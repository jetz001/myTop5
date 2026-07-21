import { scrapeWeb } from "../utils/scraper";
import { Entity, IntentType } from "@top5/shared";

export async function runAIFallback(
  env: any,
  query: string,
  categoryHint: IntentType
): Promise<Entity[]> {
  try {
    // 1. Scrape the web for fresh info
    const webContext = await scrapeWeb(query);

    // 2. Prepare the prompt for Llama 3
    const contextInstruction = webContext 
      ? `Here is the latest information from the web:\n---\n${webContext}\n---\nBased on the web information above,`
      : `Based on your own knowledge,`;

    const prompt = `
You are a helpful data extraction AI for a "Top 5" search engine.
The user searched for: "${query}"

${contextInstruction} extract the top 5 entities (e.g. places, items, coins, people) that best answer the search query. 
**CRITICAL: You MUST answer in the THAI language (ภาษาไทย) for all fields!**
Return ONLY a valid JSON array of exactly 5 objects (or less if not found). Do not include any markdown formatting like \`\`\`json.
Each object must match this exact structure:
{
  "entity_name": "ชื่อของสิ่งนั้น (ภาษาไทย หรือ อังกฤษถ้าเป็นชื่อเฉพาะ, max 30 chars)",
  "description": "คำอธิบายสั้นๆ ว่าทำไมถึงติด Top 5 (ภาษาไทย, max 150 chars)",
  "category": "${categoryHint}",
  "w5h": {
    "who": "ใครเกี่ยวข้อง หรือใครสร้างสิ่งนี้? (ภาษาไทย)",
    "what": "สิ่งนี้คืออะไรกันแน่? (ภาษาไทย)",
    "where": "อยู่ที่ไหน หรือใช้ที่ไหน? (ภาษาไทย)",
    "when": "สร้างขึ้นเมื่อไหร่ หรือเป็นที่นิยมตอนไหน? (ภาษาไทย)",
    "why": "ทำไมถึงสำคัญ หรือทำไมถึงติดอันดับ? (ภาษาไทย)"
  }
}
    `;

    // 3. Try Groq API First (Fast and Reliable Llama 3.3 70B)
    let responseText = "";
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 3000,
          temperature: 0.7
        })
      });

      if (!groqRes.ok) throw new Error(`Groq API Error: ${groqRes.statusText}`);
      
      const data: any = await groqRes.json();
      responseText = data.choices?.[0]?.message?.content || "";
    } catch (groqErr) {
      console.warn("Groq API Failed, falling back to Mistral API:", groqErr);
      
      try {
        // 3.1 Try Mistral API (Secondary Fallback)
        const mistralRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.MISTRAL_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "mistral-large-latest",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 3000,
            temperature: 0.7
          })
        });

        if (!mistralRes.ok) throw new Error(`Mistral API Error: ${mistralRes.statusText}`);
        
        const mistralData: any = await mistralRes.json();
        responseText = mistralData.choices?.[0]?.message?.content || "";
      } catch (mistralErr) {
        console.warn("Mistral API Failed, falling back to Cloudflare AI:", mistralErr);

        // 3.2 Fallback to Cloudflare Workers AI (Last Resort)
        const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
          prompt,
          max_tokens: 2048
        });
        responseText = aiResponse.response;
      }
    }
    
    // 4. Parse the JSON (extract array robustly)
    const arrayStart = responseText.indexOf('[');
    const arrayEnd = responseText.lastIndexOf(']');
    
    if (arrayStart === -1 || arrayEnd === -1) {
      throw new Error(`No JSON array found in AI response: ${responseText}`);
    }
    
    const jsonStr = responseText.substring(arrayStart, arrayEnd + 1);
    const parsedData = JSON.parse(jsonStr);

    if (!Array.isArray(parsedData)) return [];

    // 5. Format to our Entity interface
    const newEntities: Entity[] = parsedData.map((item: any, index: number) => ({
      entity_id: `ai_${crypto.randomUUID()}`,
      entity_name: item.entity_name || "Unknown",
      category: item.category || categoryHint,
      intent: item.category || categoryHint,
      description: item.description || "",
      global_score: 50 - index * 5, // base score for new AI items
      community_score: 0,
      total_score: 50 - index * 5,
      upvotes: 0,
      image_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(item.entity_name || query)}&background=random&color=fff&size=400`, // Dynamic image
      w5h: item.w5h,
      extra: {
        ai_generated: true
      }
    }));

    // 6. Save to D1 Database asynchronously (don't block the return)
    saveToDatabase(env.TOP5_DB, newEntities).catch(e => console.error("Failed to save AI entities:", e));

    return newEntities;

  } catch (e: any) {
    console.error("AI Fallback Error:", e);
    return [{
      entity_id: `error_${Date.now()}`,
      entity_name: "AI Error",
      category: categoryHint,
      intent: categoryHint,
      description: e.message || String(e),
      global_score: 0,
      community_score: 0,
      total_score: 0,
      upvotes: 0,
      image_url: ""
    }];
  }
}

export async function saveToDatabase(db: D1Database, entities: Entity[]) {
  if (entities.length === 0) return;
  
  const stmt = db.prepare(
    `INSERT INTO entities (entity_id, entity_name, category, description, image_url, global_score, w5h) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  
  const batch = entities.map(e => 
    stmt.bind(e.entity_id, e.entity_name, e.category, e.description, e.image_url, e.global_score, e.w5h ? JSON.stringify(e.w5h) : null)
  );
  
  await db.batch(batch);
}
