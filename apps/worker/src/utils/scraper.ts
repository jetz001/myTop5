export async function scrapeWeb(query: string): Promise<string> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      signal: AbortSignal.timeout(1000), // 1s max — non-blocking web context
    });

    
    if (!res.ok) {
      console.error("Scraper failed:", res.status);
      return "";
    }

    const html = await res.text();
    
    // Extract snippets from DuckDuckGo HTML results
    const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/gi;
    let match;
    const snippets: string[] = [];
    
    while ((match = snippetRegex.exec(html)) !== null) {
      const cleanText = match[1].replace(/<\/?[^>]+(>|$)/g, "");
      snippets.push(cleanText.trim());
    }
    
    // Return top 10 snippets joined
    return snippets.slice(0, 10).join("\n\n");
  } catch (e) {
    console.error("Scraper error:", e);
    return "";
  }
}
