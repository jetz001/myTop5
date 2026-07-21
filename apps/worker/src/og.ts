// ─────────────────────────────────────────────────────────────
//  Dynamic OG Meta — HTMLRewriter for social bots
// ─────────────────────────────────────────────────────────────
import type { RankedEntity } from "@top5/shared";

const SOCIAL_BOT_PATTERNS = [
  "facebookexternalhit", "twitterbot", "linkedinbot",
  "slackbot", "telegrambot", "whatsapp", "line-pokemon",
  "googlebot", "discordbot", "applebot",
];

export function isSocialBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return SOCIAL_BOT_PATTERNS.some((bot) => ua.includes(bot));
}

export function rewriteOgMeta(
  response: Response,
  query: string,
  top1: RankedEntity | undefined
): Response {
  if (!top1) return response;

  const title = `🏆 อันดับ 1: ${top1.entity_name} | Top5 Search`;
  const description = top1.description ?? `ค้นหา "${query}" — Top5 คืนผลลัพธ์ที่ดีที่สุดเพียง 5 อันดับแรก`;
  const image = top1.image_url ?? "https://top5.in.th/og-default.png";

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute("content", title);
      },
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute("content", description);
      },
    })
    .on('meta[property="og:image"]', {
      element(el) {
        el.setAttribute("content", image);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", description);
      },
    })
    .transform(response);
}
