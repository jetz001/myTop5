import { scrapeWeb } from "../utils/scraper";
import { Entity, IntentType } from "@top5/shared";
import { fetchAndCacheImage } from "./image_fetcher";
import { generateEntityId } from "../utils/slug";

function parseAIJsonArray(text: string): any[] {
  if (!text) return [];
  
  // 1. First attempt: Standard JSON.parse on full array [ ... ]
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    let jsonStr = text.substring(start, end + 1);
    jsonStr = jsonStr
      .replace(/,\s*([\]}])/g, "$1")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");

    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.warn("Full array parse failed, attempting stack-based object extraction:", e);
    }
  }

  // 2. Second attempt: Stack-based nested JSON object extraction (handles nested w5h objects)
  const results: any[] = [];
  let depth = 0;
  let objStart = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const rawObj = text.substring(objStart, i + 1);
        try {
          const cleaned = rawObj
            .replace(/,\s*}/g, "}")
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");
          const item = JSON.parse(cleaned);
          if (item && (item.entity_name || item.name)) {
            results.push(item);
          }
        } catch {
          // ignore broken item
        }
        objStart = -1;
      }
    }
  }

  return results;
}


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
Return ONLY a valid JSON array of 8 REAL, FAMOUS, HUGELY POPULAR specific entities (people, places, things, brands, etc.) for this query. Do NOT invent fake names. Use real and well-known entities.
Format MUST be a valid JSON array of 8 objects:
[
  {
    "entity_name": "<ใส่ชื่อภาษาไทยที่เป็นที่รู้จักอย่างแพร่หลาย>",
    "entity_name_en": "<Official exact English Wikipedia title>",
    "description": "<ทำไมถึงติดอันดับ และมีความสำคัญอย่างไร (ภาษาไทย max 100 chars)>",
    "category": "${categoryHint}",
    "w5h": {
      "who": "<ใครเกี่ยวข้อง>",
      "what": "<คืออะไร / ผลงานเด่น>",
      "where": "<ประเทศ / สถานที่>",
      "when": "<ช่วงเวลา / ยุค>",
      "why": "<ทำไมถึงติดอันดับ>"
    }
  }
]`;

    // 3. Try Groq API First (Super-fast Llama 3.1 8B Instant - ~0.8s latency)
    let responseText = "";
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1200,
          temperature: 0.7,
          n: 1
        }),
        signal: AbortSignal.timeout(5000), // 5s max timeout (instant model returns in < 1s)
      });

      if (!groqRes.ok) throw new Error(`Groq 8B Error: ${groqRes.statusText}`);
      
      const data: any = await groqRes.json();
      responseText = data.choices?.[0]?.message?.content || "";
    } catch (groqErr) {
      console.warn("Groq 8B Failed, trying Groq 70B fallback:", groqErr);
      
      try {
        // 3.1 Try Groq 70B Fallback
        const groq70bRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1200,
            temperature: 0.7
          }),
          signal: AbortSignal.timeout(6000), // 6s max
        });

        if (!groq70bRes.ok) throw new Error(`Groq 70B Error: ${groq70bRes.statusText}`);
        const groq70bData: any = await groq70bRes.json();
        responseText = groq70bData.choices?.[0]?.message?.content || "";
      } catch (groq70bErr) {
        console.warn("Groq 70B Failed, falling back to Mistral API:", groq70bErr);

        try {
          // 3.2 Try Mistral API
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
            signal: AbortSignal.timeout(6000), // 6s max
          });

          if (!mistralRes.ok) throw new Error(`Mistral API Error: ${mistralRes.statusText}`);
          const mistralData: any = await mistralRes.json();
          responseText = mistralData.choices?.[0]?.message?.content || "";
        } catch {
          // 3.3 Last resort: Cloudflare Workers AI
          const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
            prompt,
            max_tokens: 1200
          });
          responseText = aiResponse.response;
        }
      }
    }

    
    // 4. Parse the JSON (extract array robustly with auto-repair)
    const parsedData = parseAIJsonArray(responseText);
    if (!parsedData || parsedData.length === 0) return [];



    // 5. Format to our Entity interface using deterministic entity_id
    const newEntities: Entity[] = parsedData.map((item: any, index: number) => {
      const entityName = item.entity_name || "Unknown";
      const entityNameEn = item.entity_name_en || null;
      const generatedId = generateEntityId(entityNameEn || entityName);
      return {
        entity_id: generatedId,
        entity_name: entityName,
        entity_name_en: entityNameEn,
        category: item.category || categoryHint || "general",
        intent: item.category || categoryHint,
        description: item.description?.substring(0, 200) || "",
        global_score: 95 - index * 5,
        community_score: 0,
        total_score: 95 - index * 5,
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
