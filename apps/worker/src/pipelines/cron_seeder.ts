import { D1Database } from "@cloudflare/workers-types";
import { Entity } from "@top5/shared";
import { saveToDatabase } from "./ai_fallback";
import { Env } from "../index";

// List of popular Thai keywords to seed
const SEED_KEYWORDS = [
  "อาหารไทย", "สถานที่ท่องเที่ยว", "ดารา", "ภาพยนตร์", "เพลง",
  "บริษัทเทคโนโลยี", "มหาวิทยาลัย", "ภาษาโปรแกรม", "รถยนต์", "สมาร์ทโฟน",
  "คริปโตเคอร์เรนซี", "แบรนด์แฟชั่น", "เครื่องใช้ไฟฟ้า", "แอปพลิเคชัน", "เกมออนไลน์",
  "ศิลปิน", "นักกีฬา", "เครื่องดื่ม", "สัตว์เลี้ยง", "ช่องยูทูป",
  "หมูกรอบ", "หมูกระทะ", "ขนมไทย", "ตลาดกลางคืน", "ซีรีส์เกาหลี"
];

export async function runCronSeeder(env: Env) {
  try {
    // Pick a random keyword
    const randomKeyword = SEED_KEYWORDS[Math.floor(Math.random() * SEED_KEYWORDS.length)];
    console.log(`[Cron] Seeding keyword: ${randomKeyword}`);

    // Call Groq API (fast external Llama-3.3-70b)
    const prompt = `คุณคือผู้เชี่ยวชาญการจัดอันดับของโลก ช่วยจัดอันดับ "Top 5" สำหรับ "${randomKeyword}"
ต้องตอบกลับเป็นภาษาไทย (Thai Language) เท่านั้น
ต้องตอบเป็น JSON Array เท่านั้น โดยแต่ละอันมี field:
- entity_name: ชื่อ
- category: หมวดหมู่ภาษาอังกฤษสั้นๆ เช่น food, tech, crypto, place
- description: คำอธิบายภาษาไทยแบบกระชับ ไม่เกิน 2 บรรทัด
- w5h: Object { who, what, where, when, why } อธิบายสั้นๆ ภาษาไทย

ห้ามมีคำพูดอธิบายอื่นใด ให้ตอบแค่ JSON อย่างเดียว ตัวอย่าง:
[
  { "entity_name": "...", "category": "...", "description": "...", "w5h": { "who": "...", "what": "...", "where": "...", "when": "...", "why": "..." } }
]`;

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

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error(`[Cron] Parsed JSON is empty or not an array`);
      return;
    }

    const entities: Entity[] = parsed.map((item, index) => {
      const generatedId = `ai_${crypto.randomUUID()}`;
      return {
        entity_id: generatedId,
        entity_name: item.entity_name || "Unknown",
        entity_name_en: item.entity_name_en || null,
        category: item.category || "general",
        description: item.description || "",
        global_score: 50 - index * 5,
        w5h: item.w5h,
        image_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(item.entity_name || randomKeyword)}&background=random&color=fff&size=400`
      };
    });

    await saveToDatabase(env.TOP5_DB, entities);
    console.log(`[Cron] Successfully seeded ${entities.length} entities for ${randomKeyword}`);

  } catch (error: any) {
    console.error(`[Cron] Error running seeder: ${error.message}`);
  }
}
