import { scrapeWeb } from "../utils/scraper";
import { Entity, IntentType } from "@top5/shared";
import { fetchAndCacheImage } from "./image_fetcher";

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
## บริบทของแพลตฟอร์ม (Platform Context)
คุณเป็น AI ผู้ช่วยของเว็บไซต์ชื่อ **"Top5"** — แพลตฟอร์มจัดอันดับแบบ Real-time ที่คนไทยใช้ค้นหาและโหวตเลือก "5 อันดับที่ดีที่สุด" ในทุกหัวข้อ

**วิธีทำงานของ Top5:**
- ผู้ใช้พิมพ์คำค้นหาอะไรก็ได้ เช่น "ร้านกะเพราอร่อยๆ แถวอโศก", "เหรียญคริปโต 2024", "นักพัฒนา Python มือโปร", "ดารานักร้องยอดนิยม"
- ระบบแสดงผล **Top 5 อันดับ** พร้อม Challenger Pool (อันดับ 6-8 ที่รอแชลเลนจ์)
- ผู้ใช้สามารถ **โหวต (Upvote)** ให้รายการที่ชอบ เพื่อเลื่อนอันดับขึ้นได้จริง
- คะแนนคำนวณจาก Global Score + Community Upvotes + Time Decay (คะแนนเก่าค่อยๆ ลดลงเพื่อให้ระบบสดใหม่)
- แต่ละรายการมีข้อมูล **5W1H** (Who, What, Where, When, Why) เพื่อให้ผู้ใช้เข้าใจบริบทของสิ่งนั้น

**ผู้ใช้หลักของเรา:** คนไทย ชอบข้อมูลที่ชัดเจน กระชับ สนุก และมีประโยชน์จริง

---
## ภารกิจของคุณ
ผู้ใช้ค้นหาว่า: **"${query}"**

${contextInstruction} จงสร้างรายการ Top 8 ที่ดีที่สุดสำหรับคำค้นหานี้ เพื่อนำไปแสดงบนแพลตฟอร์ม Top5

**กฎสำคัญ:**
1. ตอบเป็น **ภาษาไทย** ทุก field (ยกเว้นชื่อเฉพาะภาษาอังกฤษ เช่น Bitcoin, Python)
2. ให้ชื่อ **เฉพาะเจาะจง** ของจริง — ห้ามตอบคำกว้างๆ เช่น "ร้านอาหาร" หรือ "จังหวัด"
3. ถ้าเป็นร้านอาหาร/สถานที่ → ให้ชื่อร้านจริงๆ, ถ้าเป็นเทคโนโลยี → ให้ชื่อเทคโนโลยีจริงๆ
4. description ต้องบอกว่า **ทำไมถึงติด Top 5** ให้ผู้ใช้อยากโหวต
5. w5h ต้องมีข้อมูลที่เป็นประโยชน์และน่าสนใจ ไม่ใช่แค่ copy entity_name
6. ส่งกลับเป็น **JSON array เท่านั้น** ห้ามมีข้อความอื่น ห้าม markdown

Return ONLY a valid JSON array of exactly 8 objects. Each object:
{
  "entity_name": "ชื่อเฉพาะเจาะจง (max 40 chars)",
  "description": "ทำไมถึงติดอันดับ และดีอย่างไร (ภาษาไทย, max 150 chars)",
  "category": "${categoryHint}",
  "w5h": {
    "who": "ใครสร้าง/ใครเกี่ยวข้อง?",
    "what": "คืออะไร? มีจุดเด่นอะไร?",
    "where": "อยู่ที่ไหน / ใช้ที่ไหน?",
    "when": "เมื่อไหร่ที่เป็นที่นิยม?",
    "why": "ทำไมถึงสำคัญ / ทำไมต้องเลือก?"
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
          temperature: 0.8,
          // Request more items so challenger pool is never empty
          n: 1
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

    // 6. Save to D1 Database synchronously so entities exist before user votes
    try {
      await saveToDatabase(env.TOP5_DB, newEntities);

      // 7. Fetch & cache Wikipedia thumbnails in background (non-blocking)
      //    This runs after we return results so it doesn't slow down the response
      for (const entity of newEntities) {
        fetchAndCacheImage(env, entity.entity_id, entity.entity_name, entity.entity_name_en)
          .then((imageUrl) => {
            if (imageUrl && imageUrl !== entity.image_url) {
              // Update DB with real image URL
              env.TOP5_DB
                .prepare("UPDATE entities SET image_url = ? WHERE entity_id = ?")
                .bind(imageUrl, entity.entity_id)
                .run()
                .catch(() => {});
            }
          })
          .catch(() => {}); // ignore errors — placeholder still works
      }
    } catch (dbErr) {
      console.error("Failed to save AI entities:", dbErr);
    }

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
    `INSERT OR REPLACE INTO entities (entity_id, entity_name, category, description, image_url, global_score, w5h) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  
  const batch = entities.map(e => 
    stmt.bind(e.entity_id, e.entity_name, e.category, e.description, e.image_url, e.global_score, e.w5h ? JSON.stringify(e.w5h) : null)
  );
  
  await db.batch(batch);
}
