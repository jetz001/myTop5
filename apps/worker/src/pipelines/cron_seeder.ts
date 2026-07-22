import { D1Database } from "@cloudflare/workers-types";
import { Entity } from "@top5/shared";
import { saveToDatabase } from "./ai_fallback";
import { fetchAndCacheImage } from "./image_fetcher";
import { generateEntityId } from "../utils/slug";
import { Env } from "../index";

// Categories for random distribution
const CATEGORIES = ["อาหาร", "สถานที่", "เทคโนโลยี", "บุคคลดัง", "เกม", "เพลง", "ภาพยนตร์", "วิทยาศาสตร์", "แบรนด์", "สัตว์", "ยานพาหนะ", "แอปพลิเคชัน", "กีฬา", "แฟชั่น", "ธุรกิจ", "การศึกษา"];
const ALPHABETS = "ABCDEFGHIJKLMNOPQRSTUVWXYZกขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ".split("");

/** Backfill Wikipedia thumbnails for entities that still have ui-avatars placeholder */
async function backfillMissingImages(env: Env, batchSize = 5): Promise<void> {
  try {
    const stale = await env.TOP5_DB
      .prepare(`SELECT entity_id, entity_name, entity_name_en FROM entities 
                WHERE image_url LIKE 'https://ui-avatars.com%' OR image_url IS NULL OR image_url = ''
                ORDER BY upvotes DESC, global_score DESC LIMIT ?`)
      .bind(batchSize)
      .all<{ entity_id: string; entity_name: string; entity_name_en: string }>();

    if (!stale.results?.length) return;

    console.log(`[Cron] Backfilling images for ${stale.results.length} entities`);

    for (const entity of stale.results) {
      const imageUrl = await fetchAndCacheImage(
        env, entity.entity_id, entity.entity_name, entity.entity_name_en
      );
      if (imageUrl) {
        await env.TOP5_DB
          .prepare("UPDATE entities SET image_url = ? WHERE entity_id = ?")
          .bind(imageUrl, entity.entity_id)
          .run();
        console.log(`[Cron] Updated image for ${entity.entity_name}`);
      }
    }
  } catch (e: any) {
    console.error("[Cron] Image backfill error:", e.message);
  }
}

export async function runCronSeeder(env: Env) {
  try {
    // Get current iteration index from KV
    const indexStr = await env.CACHE_KV.get("cron_index");
    let currentIndex = parseInt(indexStr || "0", 10);
    if (isNaN(currentIndex)) currentIndex = 0;

    // Every other run: backfill images instead of seeding new content
    if (currentIndex % 2 === 0) {
      await backfillMissingImages(env, 5);
    }

    // Generate a diverse topic using sequential alphabet
    const randomCat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const randomChar = ALPHABETS[currentIndex % ALPHABETS.length];
    
    // Increment and save index for next run
    await env.CACHE_KV.put("cron_index", (currentIndex + 1).toString());

    const randomKeyword = `หมวดหมู่ ${randomCat} ที่ขึ้นต้นด้วยตัวอักษร ${randomChar}`;
    console.log(`[Cron] Seeding keyword: ${randomKeyword}`);

    const prompt = `คุณคือผู้เชี่ยวชาญการจัดอันดับของโลก ช่วยจัดอันดับ "Top 5" สำหรับ "${randomKeyword}"
ต้องตอบกลับเป็นภาษาไทย (Thai Language) เท่านั้น
ต้องตอบเป็น JSON Array เท่านั้น โดยแต่ละอันมี field:
- entity_name: ชื่อ
- category: หมวดหมู่ภาษาอังกฤษสั้นๆ เช่น food, tech, crypto, place
- description: คำอธิบายภาษาไทยแบบกระชับ ไม่เกิน 2 บรรทัด
- w5h: Object { who, what, where, when, why } อธิบายสั้นๆ ภาษาไทย

ห้ามมีคำพูดอธิบายอื่นใด ให้ตอบแค่ JSON อย่างเดียว`;

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
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!groqRes.ok) {
      console.error(`[Cron] Groq API Error: ${groqRes.statusText}`);
      return;
    }

    const data: any = await groqRes.json();
    let responseText = data.choices?.[0]?.message?.content || "";

    const arrayStart = responseText.indexOf('[');
    const arrayEnd = responseText.lastIndexOf(']');
    
    if (arrayStart === -1 || arrayEnd === -1) {
      console.error(`[Cron] No JSON array found in Groq response`);
      return;
    }

    const jsonStr = responseText.substring(arrayStart, arrayEnd + 1);
    const parsed = JSON.parse(jsonStr) as any[];

    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const entities: Entity[] = parsed.map((item, index) => {
      const entityName = item.entity_name || "Unknown";
      const entityNameEn = item.entity_name_en || null;
      const generatedId = generateEntityId(entityNameEn || entityName);
      return {
        entity_id: generatedId,
        entity_name: entityName,
        entity_name_en: entityNameEn,
        category: item.category || "general",
        description: item.description || "",
        global_score: 50 - index * 5,
        w5h: item.w5h,
        image_url: `/images/${generatedId}`,
      };
    });

    await saveToDatabase(env.TOP5_DB, entities);
    console.log(`[Cron] Seeded ${entities.length} entities for ${randomKeyword}`);

  } catch (error: any) {
    console.error(`[Cron] Error: ${error.message}`);
  }
}
