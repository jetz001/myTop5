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
Return ONLY a valid JSON array of exactly 5 objects (or less if not found). Do not include any markdown formatting like \`\`\`json.
Each object must match this exact structure:
{
  "entity_name": "Name of the entity (max 30 chars)",
  "description": "Short explanation of why it is in the top 5 (max 150 chars)",
  "category": "${categoryHint}",
  "w5h": {
    "who": "Who is involved or who created this?",
    "what": "What exactly is this?",
    "where": "Where is it located or where is it used?",
    "when": "When was it created or when is it relevant?",
    "why": "Why is it important or why is it in the top 5?"
  }
}
    `;

    // 3. Call Cloudflare Workers AI
    const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      prompt,
      max_tokens: 800
    });

    const responseText = aiResponse.response;
    
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
      image_url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80", // generic AI chip image
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

async function saveToDatabase(db: D1Database, entities: Entity[]) {
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
