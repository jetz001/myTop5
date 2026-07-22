import { scrapeWeb } from "../utils/scraper";
import { Entity, IntentType } from "@top5/shared";
import { fetchAndCacheImage } from "./image_fetcher";
import { generateEntityId } from "../utils/slug";

export async function runAIFallback(
  env: any,
  query: string,
  categoryHint: IntentType,
  ctx?: ExecutionContext
): Promise<Entity[]> {
  try {
    // 1. Scrape the web for fresh info
    const webContext = await scrapeWeb(query);

    // 2. Prepare the prompt for Llama 3
    const contextInstruction = webContext 
      ? `Here is the latest information from the web:\n---\n${webContext}\n---\nBased on the web information above,`
      : `Based on your own knowledge,`;

    const prompt = `You are Top5 AI. User searched: "${query}".
Return ONLY a valid JSON array of top 8 items. Format MUST be JSON array with 8 objects:
[
  {
    "entity_name": "ชื่อเฉพาะภาษาไทย (max 35 chars)",
    "entity_name_en": "Official English Name",
    "description": "เหตุผลที่ติด Top 5 (ภาษาไทย max 100 chars)",
    "category": "${categoryHint}",
    "w5h": {
      "who": "ใครเกี่ยวข้อง",
      "what": "คืออะไร",
      "where": "ที่ไหน",
      "when": "เมื่อไหร่",
      "why": "ทำไมถึงติดอันดับ"
    }
  }
]`;

    // 3. Try Groq API First (Fast Llama 3.3 70B)
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
          max_tokens: 1200,
          temperature: 0.7,
          n: 1
        }),
        signal: AbortSignal.timeout(15000), // 15s max
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
            max_tokens: 1200,
            temperature: 0.7
          }),
          signal: AbortSignal.timeout(15000), // 15s max
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

    // 5. Format to our Entity interface using deterministic entity_id
    const newEntities: Entity[] = parsedData.map((item: any, index: number) => {
      const entityName = item.entity_name || "Unknown";
      const entityNameEn = item.entity_name_en || null;
      const generatedId = generateEntityId(entityNameEn || entityName);
      return {
        entity_id: generatedId,
        entity_name: entityName,
        entity_name_en: entityNameEn,
        category: item.category || categoryHint,
        intent: item.category || categoryHint,
        description: item.description || "",
        global_score: 50 - index * 5,
        community_score: 0,
        total_score: 50 - index * 5,
        upvotes: 0,
        image_url: `/images/${generatedId}`,
        w5h: item.w5h,
        extra: {
          ai_generated: true
        }
      };
    });

    // 6. Save to D1 Database
    try {
      await saveToDatabase(env.TOP5_DB, newEntities);

      // 7. Fetch & cache Wikipedia thumbnails into R2 in background (non-blocking)
      for (const entity of newEntities) {
        const p = fetchAndCacheImage(env, entity.entity_id, entity.entity_name, entity.entity_name_en || undefined).catch(() => {});
        if (ctx) ctx.waitUntil(p);
      }
    } catch (dbErr) {
      console.error("Failed to save AI entities:", dbErr);
    }

    return newEntities;

  } catch (e: any) {
    console.error("AI Fallback Error:", e);
    return [];
  }
}

export async function saveToDatabase(db: D1Database, entities: Entity[]) {
  if (entities.length === 0) return;
  
  const stmt = db.prepare(
    `INSERT INTO entities (entity_id, entity_name, entity_name_en, category, description, image_url, global_score, w5h) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_id) DO UPDATE SET
       entity_name = excluded.entity_name,
       entity_name_en = COALESCE(excluded.entity_name_en, entities.entity_name_en),
       description = excluded.description,
       image_url = CASE WHEN excluded.image_url IS NOT NULL AND excluded.image_url != '' THEN excluded.image_url ELSE entities.image_url END,
       global_score = excluded.global_score,
       w5h = COALESCE(excluded.w5h, entities.w5h)`
  );
  
  const batch = entities.map(e => 
    stmt.bind(
      e.entity_id,
      e.entity_name,
      e.entity_name_en || null,
      e.category,
      e.description,
      e.image_url,
      e.global_score,
      e.w5h ? (typeof e.w5h === "string" ? e.w5h : JSON.stringify(e.w5h)) : null
    )
  );
  
  await db.batch(batch);
}
