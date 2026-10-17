// Supabase Edge Function: import-recipe
// Deploy: supabase functions deploy import-recipe
// Flow: detect source → extract video/page content → generate recipe via AI
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SourceType = "youtube" | "instagram" | "tiktok" | "facebook" | "blog";

type FetchedContent = {
  title: string;
  thumbnail: string | null;
  text: string;
  transcript: string;
  sourceType: SourceType;
  hasRichTranscript: boolean;
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function detectSourceType(url: string): SourceType {
  if (/youtube\.com|youtu\.be|m\.youtube\.com|youtube-nocookie\.com/i.test(url)) return "youtube";
  if (/instagram\.com|instagr\.am/i.test(url)) return "instagram";
  if (/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(url)) return "tiktok";
  if (/facebook\.com|fb\.watch|fb\.com|m\.facebook\.com/i.test(url)) return "facebook";
  return "blog";
}

/** Clean share links so extractors get a stable URL. */
function normalizeUrl(raw: string): string {
  let url = raw.trim();
  const embedded = url.match(/(https?:\/\/[^\s<>"']+)/i);
  if (embedded) url = embedded[1];
  url = url.replace(/[),.]+$/g, "");
  try {
    const u = new URL(url);
    [
      "si",
      "feature",
      "pp",
      "fbclid",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "igshid",
      "igsh",
      "tt_from",
      "is_from_webapp",
      "sender_device",
    ].forEach((p) => u.searchParams.delete(p));
    // Prefer canonical watch URL for YouTube share links
    if (/youtu\.be/i.test(u.hostname)) {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (/youtube\.com/i.test(u.hostname) && u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchMetaTags(url: string): Promise<{
  title: string;
  description: string;
  thumbnail: string | null;
  rawText: string;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const html = await res.text();
    const title =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      "";
    const description =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      "";
    const thumbnail =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      null;
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
    const rawText = (bodyMatch ? bodyMatch[0] : html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    return { title, description, thumbnail, rawText };
  } catch {
    return { title: "", description: "", thumbnail: null, rawText: "" };
  }
}

function buildFoodVideoPrompt(
  sourceType: SourceType,
  url: string,
  title: string,
  extras: string
): string {
  return `
SOURCE PLATFORM: ${sourceType}
VIDEO / PAGE TITLE: ${title || "(unknown)"}
VIDEO URL: ${url}

EXTRACTED CONTENT:
${extras || "(limited metadata)"}

USER INTENT: They pasted this as a FOOD recipe video/link.
Always produce a complete cookable recipe (ingredients + steps).
If measurements are missing, infer authentic standard amounts for the dish.
Do NOT return {"error":"no_recipe"} unless this is clearly not food at all.
`.trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseCaptionXml(xml: string): string {
  const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)]
    .map((m) => decodeXmlEntities(m[1]))
    .filter(Boolean);
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(
    /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/|\/v\/)([\w-]{11})/
  );
  return match?.[1] ?? null;
}

async function fetchCaptionTrack(baseUrl: string): Promise<string> {
  try {
    const res = await fetch(baseUrl, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return "";
    return parseCaptionXml(await res.text());
  } catch {
    return "";
  }
}

async function extractYouTubeTranscriptFromHtml(html: string): Promise<string> {
  try {
    const captionMatch = html.match(/"captionTracks":\s*(\[[\s\S]*?\])/);
    if (!captionMatch) return "";

    const tracks = JSON.parse(captionMatch[1]);
    if (!Array.isArray(tracks) || tracks.length === 0) return "";

    const preferred =
      tracks.find((t: any) => t.languageCode?.startsWith("en") && !t.kind) ||
      tracks.find((t: any) => t.languageCode?.startsWith("en")) ||
      tracks.find((t: any) => !t.kind) ||
      tracks[0];

    if (!preferred?.baseUrl) return "";
    return await fetchCaptionTrack(preferred.baseUrl);
  } catch {
    return "";
  }
}

async function fetchYouTubeTimedText(videoId: string): Promise<string> {
  const attempts = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3&kind=asr`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=srv3&kind=asr`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-IN&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=hi&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=hi&fmt=srv3&kind=asr`,
  ];

  for (const endpoint of attempts) {
    try {
      const res = await fetch(endpoint, {
        headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const text = parseCaptionXml(xml);
      if (text.length > 40) return text;
    } catch {
      // try next
    }
  }
  return "";
}

/** Innertube ANDROID client — works from cloud IPs where HTML scrape often fails. */
async function fetchYouTubeInnertube(videoId: string): Promise<{
  title: string;
  description: string;
  thumbnail: string | null;
  transcript: string;
}> {
  const clients = [
    { clientName: "ANDROID", clientVersion: "20.10.38", ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip" },
    { clientName: "IOS", clientVersion: "20.10.4", ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X)" },
  ];

  for (const client of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.ua,
          "X-YouTube-Client-Name": client.clientName === "ANDROID" ? "3" : "5",
          "X-YouTube-Client-Version": client.clientVersion,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              hl: "en",
              gl: "US",
            },
          },
          videoId,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const details = data?.videoDetails;
      if (!details?.title) continue;

      let transcript = "";
      const tracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (Array.isArray(tracks) && tracks.length > 0) {
        const preferred =
          tracks.find((t: any) => String(t.languageCode || "").startsWith("en") && !t.kind) ||
          tracks.find((t: any) => String(t.languageCode || "").startsWith("en")) ||
          tracks.find((t: any) => !t.kind) ||
          tracks[0];
        if (preferred?.baseUrl) {
          transcript = await fetchCaptionTrack(preferred.baseUrl);
        }
      }

      const thumbs = details.thumbnail?.thumbnails;
      const thumb =
        Array.isArray(thumbs) && thumbs.length
          ? thumbs[thumbs.length - 1]?.url ?? null
          : null;

      return {
        title: details.title ?? "",
        description: details.shortDescription ?? "",
        thumbnail: thumb,
        transcript,
      };
    } catch {
      // try next client
    }
  }

  return { title: "", description: "", thumbnail: null, transcript: "" };
}

function looksLikeFoodContent(title: string, description: string, transcript: string): boolean {
  const blob = `${title}\n${description}\n${transcript}`.toLowerCase();
  if (!blob.trim()) return false;
  const foodSignals = [
    "recipe", "cook", "ingredient", "gram", "tsp", "tbsp", "cup", "fry", "boil",
    "gravy", "curry", "aloo", "paneer", "chicken", "biryani", "masala", "chef",
    "kitchen", "bake", "roast", "sauce", "dish", "meal", "food", "sabzi", "roti",
    "naan", "dal", "rice", "pasta", "noodles", "soup", "salad", "dessert",
    "chocolate", "cake", "bread", "egg", "garlic", "onion", "tomato", "salt",
    "pepper", "oil", "ghee", "butter", "flour", "sugar", "prep", "minutes",
    "serving", "cuisine", "street food", "homemade", "khana", "banaye", "बना",
  ];
  return foodSignals.some((s) => blob.includes(s));
}

async function fetchYouTube(url: string): Promise<FetchedContent> {
  const videoId = extractYouTubeVideoId(url);
  const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

  let title = "";
  let thumbnail: string | null = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null;
  let description = "";
  let spokenTranscript = "";

  // 1) Innertube first (reliable from Edge Function IPs)
  if (videoId) {
    const innertube = await fetchYouTubeInnertube(videoId);
    title = innertube.title || title;
    description = innertube.description || description;
    spokenTranscript = innertube.transcript || spokenTranscript;
    if (innertube.thumbnail) thumbnail = innertube.thumbnail;
  }

  // 2) oEmbed fallback for title/thumbnail
  if (!title) {
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        title = oembed.title ?? "";
        if (oembed.thumbnail_url) thumbnail = oembed.thumbnail_url;
      }
    } catch {
      // best effort
    }
  }

  // 3) HTML scrape fallback
  if (!description || !spokenTranscript) {
    try {
      const pageRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const html = await pageRes.text();

      if (!description) {
        const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
        if (descMatch) {
          description = JSON.parse(`"${descMatch[1]}"`);
        } else {
          const metaDesc = html.match(
            /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
          );
          if (metaDesc) description = metaDesc[1];
        }
      }

      if (!title) {
        const titleMatch = html.match(/"title":"((?:[^"\\]|\\.)*)"/);
        if (titleMatch) title = JSON.parse(`"${titleMatch[1]}"`);
      }

      if (!spokenTranscript) {
        spokenTranscript = await extractYouTubeTranscriptFromHtml(html);
      }
    } catch {
      // best-effort scrape
    }
  }

  if (!spokenTranscript && videoId) {
    spokenTranscript = await fetchYouTubeTimedText(videoId);
  }

  // Many chef videos put the FULL recipe in the description — treat that as primary content.
  const richText = [description, spokenTranscript].filter(Boolean).join("\n\n");
  const hasRichTranscript = richText.length > 120 || spokenTranscript.length > 80;
  const text = `
SOURCE PLATFORM: YouTube / YouTube Shorts
VIDEO TITLE: ${title}
VIDEO URL: ${url}
VIDEO DESCRIPTION (often contains the full written recipe):
${description || "(none)"}

FULL SPOKEN VIDEO AUDIO TRANSCRIPT (captions / speech-to-text):
${spokenTranscript || "(no captions found — use the description and dish name in the title to build a complete authentic recipe)"}

INSTRUCTION: This is a food cooking video. Extract or reconstruct a complete cookable recipe. Do NOT return no_recipe.
`.trim();

  return {
    title,
    thumbnail,
    text,
    transcript: richText || spokenTranscript,
    sourceType: "youtube",
    hasRichTranscript,
  };
}

async function fetchTikTok(url: string): Promise<FetchedContent> {
  let title = "";
  let thumbnail: string | null = null;
  let description = "";
  let author = "";

  try {
    const oembedRes = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      title = oembed.title ?? "";
      thumbnail = oembed.thumbnail_url ?? null;
      author = oembed.author_name ?? "";
      description = title;
    }
  } catch {
    // fallback below
  }

  const meta = await fetchMetaTags(url);
  if (meta.title && !title) title = meta.title;
  if (meta.description) description = [description, meta.description].filter(Boolean).join("\n");
  if (meta.thumbnail) thumbnail = meta.thumbnail;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });
    const html = await res.text();
    const captionMatch = html.match(/"desc":"((?:[^"\\]|\\.)*)"/);
    if (captionMatch) {
      try {
        const caption = JSON.parse(`"${captionMatch[1]}"`);
        if (caption) description = [description, caption].filter(Boolean).join("\n");
      } catch {
        // ignore
      }
    }
  } catch {
    // keep what we have
  }

  const combined = [title, author ? `Author: ${author}` : "", description, meta.rawText.slice(0, 3000)]
    .filter(Boolean)
    .join("\n");
  const text = buildFoodVideoPrompt("tiktok", url, title, combined);

  return {
    title,
    thumbnail,
    text,
    transcript: combined,
    sourceType: "tiktok",
    hasRichTranscript: combined.length > 120,
  };
}

async function fetchInstagram(url: string): Promise<FetchedContent> {
  let title = "";
  let thumbnail: string | null = null;
  let description = "";
  let author = "";

  // Public Instagram oEmbed (works for many public posts/reels)
  for (const endpoint of [
    `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`,
    `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`,
  ]) {
    try {
      const res = await fetch(endpoint, { headers: { "User-Agent": BROWSER_UA } });
      if (!res.ok) continue;
      const data = await res.json();
      title = data.title || data.author_name || title;
      author = data.author_name || author;
      thumbnail = data.thumbnail_url || thumbnail;
      if (data.title) description = data.title;
      break;
    } catch {
      // try next
    }
  }

  const meta = await fetchMetaTags(url);
  if (!title) title = meta.title;
  if (meta.description) description = [description, meta.description].filter(Boolean).join("\n");
  // Keep thumbnail for hero_image in DB, but do NOT send it to OpenAI (CDN 403).
  if (meta.thumbnail) thumbnail = meta.thumbnail;

  // Extra caption scrape from embeddable HTML patterns
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });
    const html = await res.text();
    const captionMatch =
      html.match(/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"((?:[^"\\]|\\.)*)"/) ||
      html.match(/"caption":"((?:[^"\\]|\\.)*)"/);
    if (captionMatch) {
      try {
        const caption = JSON.parse(`"${captionMatch[1]}"`);
        if (caption) description = [description, caption].filter(Boolean).join("\n");
      } catch {
        // ignore
      }
    }
  } catch {
    // keep what we have
  }

  const combined = [
    title,
    author ? `Creator: ${author}` : "",
    description,
    meta.rawText.slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n");

  const text = buildFoodVideoPrompt(
    "instagram",
    url,
    title,
    `${combined}

REEL ANALYSIS MODE:
- Instagram blocks thumbnail download for AI vision.
- Use captions, hashtags, dish names, and creator context to reconstruct a complete similar recipe.
- Infer authentic ingredients + steps for the dish implied by this reel.`
  );

  return {
    title,
    thumbnail,
    text,
    transcript: combined,
    sourceType: "instagram",
    hasRichTranscript: combined.length > 80,
  };
}

async function fetchFacebook(url: string): Promise<FetchedContent> {
  let title = "";
  let thumbnail: string | null = null;
  let description = "";

  try {
    const oembedRes = await fetch(
      `https://www.facebook.com/plugins/video/oembed.json?url=${encodeURIComponent(url)}`
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      title = oembed.title ?? "";
      thumbnail = oembed.thumbnail_url ?? null;
      description = title;
    }
  } catch {
    // fallback
  }

  const meta = await fetchMetaTags(url);
  if (!title) title = meta.title;
  if (meta.description) description = [description, meta.description].filter(Boolean).join("\n");
  if (meta.thumbnail) thumbnail = meta.thumbnail;

  const combined = [title, description, meta.rawText.slice(0, 4000)].filter(Boolean).join("\n");
  const text = buildFoodVideoPrompt("facebook", url, title, combined);

  return {
    title,
    thumbnail,
    text,
    transcript: combined,
    sourceType: "facebook",
    hasRichTranscript: combined.length > 100,
  };
}

async function fetchSocialOrBlog(
  url: string,
  sourceType: SourceType
): Promise<FetchedContent> {
  let thumbnail: string | null = null;
  let title = "";
  let text = "";
  let transcript = "";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const html = await res.text();

    const ldJsonBlocks = [
      ...html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      ),
    ].map((m) => m[1]);

    let recipeJsonLd: any = null;
    for (const block of ldJsonBlocks) {
      try {
        const parsed = JSON.parse(block);
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const c of candidates) {
          const graph = c["@graph"] ? c["@graph"] : [c];
          for (const g of graph) {
            const type = g["@type"];
            const types = Array.isArray(type) ? type : [type];
            if (types.includes("Recipe")) recipeJsonLd = g;
            if (!title && (types.includes("VideoObject") || types.includes("SocialMediaPosting"))) {
              title = g.name || g.headline || title;
            }
          }
        }
      } catch {
        // skip malformed JSON-LD
      }
    }

    const ogImageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );
    if (ogImageMatch) thumbnail = ogImageMatch[1];

    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      "";
    const ogDesc =
      html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
      )?.[1] ?? "";
    title = title || ogTitle;

    if (recipeJsonLd) {
      const essential = {
        name: recipeJsonLd.name,
        description: recipeJsonLd.description,
        recipeIngredient: recipeJsonLd.recipeIngredient,
        recipeInstructions: recipeJsonLd.recipeInstructions,
        prepTime: recipeJsonLd.prepTime,
        cookTime: recipeJsonLd.cookTime,
        totalTime: recipeJsonLd.totalTime,
        recipeYield: recipeJsonLd.recipeYield,
        recipeCuisine: recipeJsonLd.recipeCuisine,
        image: recipeJsonLd.image,
      };
      if (!thumbnail) {
        const img = essential.image;
        thumbnail = Array.isArray(img)
          ? img[0]
          : typeof img === "string"
            ? img
            : img?.url ?? null;
      }
      title = essential.name || title;
      transcript = JSON.stringify(essential);
      text = buildFoodVideoPrompt(
        sourceType,
        url,
        title,
        `STRUCTURED RECIPE DATA (JSON-LD):\n${transcript}`
      );
      return {
        title,
        thumbnail,
        text,
        transcript,
        sourceType,
        hasRichTranscript: true,
      };
    }

    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
    const rawText = (bodyMatch ? bodyMatch[0] : html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    transcript = [ogTitle, ogDesc, rawText].filter(Boolean).join("\n");
    text = buildFoodVideoPrompt(
      sourceType,
      url,
      ogTitle,
      `CAPTIONS / DESCRIPTION:\n${ogDesc || "(none)"}\n\nPAGE CONTENT:\n${rawText || "(none)"}`
    );
  } catch {
    text = buildFoodVideoPrompt(
      sourceType,
      url,
      "",
      "Could not fetch page content. Infer a complete authentic recipe from the dish implied by this food video URL."
    );
  }

  return {
    title,
    thumbnail,
    text,
    transcript,
    sourceType,
    hasRichTranscript: transcript.length > 180,
  };
}

const SYSTEM_PROMPT = `You are an advanced culinary AI that analyzes food videos and recipe pages from YouTube, YouTube Shorts, Instagram Reels, TikTok, Facebook, and food blogs.

CRITICAL RULE:
If the content is from a VIDEO GAME (e.g., Minecraft, Roblox, Zelda), ANIMATION, or is CGI/VIRTUAL food, you MUST immediately return {"error":"no_recipe"}. Do this even if the title mentions words like "cooking", "recipe", "curry", or "chef". We ONLY process real-life food.

Pipeline you follow for REAL-LIFE food:
1) Identify the source platform from the provided SOURCE PLATFORM field.
2) Analyze ALL available video content: spoken transcript/captions, on-screen text, description, title, and structured recipe data.
3) Generate a complete, cookable recipe for the dish shown/described.

Rules for Real-Life Food:
- Prefer exact ingredients and steps spoken or written in the video/page.
- If measurements were not said aloud, infer authentic standard measurements for that exact dish so the recipe is still fully usable.
- Keep instructions clear, numbered, and chronological.
- Estimate prep_time, cook_time, difficulty, cuisine, servings.
- Only return {"error":"no_recipe"} if the content is clearly NOT food-related (news, tech, sports, etc.).
- Real-life food shorts/reels with only a dish name still count as food — generate the full recipe.
- If the title/description mentions a real-life dish, chef, gravy, curry, ingredients, or cooking (AND it is not a video game) — you MUST return a full recipe JSON, never no_recipe.

Return ONLY valid JSON matching this exact shape (no markdown):
{
  "title": string,
  "description": string | null,
  "ingredients": [{ "item": string, "quantity": string | null, "notes": string | null }],
  "instructions": [{ "step": number, "text": string }],
  "prep_time": number | null,
  "cook_time": number | null,
  "servings": number | null,
  "difficulty": "easy" | "medium" | "hard" | null,
  "cuisine": string | null,
  "chef_notes": string | null,
  "tips": string[] | null,
  "tags": string[]
}`;

function isOpenAiFetchableImage(url: string | null | undefined, sourceType: SourceType): boolean {
  if (!url) return false;
  // Instagram / Facebook / many CDNs return 403 to OpenAI's image fetcher.
  // YouTube thumbs (ytimg) are usually public and safe to send.
  if (sourceType === "instagram" || sourceType === "tiktok" || sourceType === "facebook") {
    return false;
  }
  if (/instagram\.|cdninstagram\.|fbcdn\.|facebook\.|tiktokcdn\.|ttwstatic\./i.test(url)) {
    return false;
  }
  return /^https?:\/\//i.test(url);
}

async function callOpenAiJson(messages: { role: string; content: any }[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 4096,
      messages,
    }),
  });

  const errText = await res.text();
  if (!res.ok) {
    const err = new Error(`OpenAI request failed: ${errText}`);
    (err as any).body = errText;
    throw err;
  }

  try {
    return JSON.parse(errText);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${errText.slice(0, 200)}`);
  }
}

function repairAndParseJson(content: string) {
  let fixed = content ?? "{}";
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  if (openBraces > closeBraces) fixed += "}".repeat(openBraces - closeBraces);
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/]/g) || []).length;
  if (openBrackets > closeBrackets) fixed += "]".repeat(openBrackets - closeBrackets);
  return JSON.parse(fixed);
}

async function extractRecipeWithAI(fetched: FetchedContent, forceFood = false) {
  const forceNote = forceFood
    ? "\n\nIMPORTANT OVERRIDE: This is a food cooking video/reel. You MUST return a complete cookable recipe JSON from the title, captions, description, and typical method for that dish. Never return no_recipe. Infer authentic measurements if missing."
    : "";

  const analysisHint =
    fetched.sourceType === "instagram" ||
    fetched.sourceType === "tiktok" ||
    fetched.sourceType === "facebook"
      ? "\n\nNOTE: Thumbnail images from this platform are blocked. Do a full text analysis of the reel/video captions and title, then generate a complete similar recipe that fits the dish shown."
      : "";

  const textOnlyContent = `Analyze this ${fetched.sourceType} food video/page and generate the complete recipe.\n\n${fetched.text}${forceNote}${analysisHint}`;

  const messagesTextOnly = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: textOnlyContent },
  ];

  const canUseVision =
    isOpenAiFetchableImage(fetched.thumbnail, fetched.sourceType) &&
    (!fetched.hasRichTranscript || forceFood);

  // Prefer text-only for blocked platforms; optionally try vision for YouTube.
  if (!canUseVision) {
    const data = await callOpenAiJson(messagesTextOnly);
    return repairAndParseJson(data.choices?.[0]?.message?.content ?? "{}");
  }

  const userContent: any[] = [
    { type: "text", text: textOnlyContent + "\n\nA video thumbnail is attached — use it if helpful." },
    { type: "image_url", image_url: { url: fetched.thumbnail } },
  ];

  try {
    const data = await callOpenAiJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);
    return repairAndParseJson(data.choices?.[0]?.message?.content ?? "{}");
  } catch (err: any) {
    const body = String(err?.body || err?.message || "");
    // Instagram/CDN 403 → invalid_image_url — fall back to caption/title analysis
    if (/invalid_image_url|403|downloading file/i.test(body)) {
      const data = await callOpenAiJson(messagesTextOnly);
      return repairAndParseJson(data.choices?.[0]?.message?.content ?? "{}");
    }
    throw err;
  }
}

function mapSourceTypeForDb(sourceType: SourceType): string {
  // DB check constraint historically allowed youtube|instagram|blog|manual.
  // Migration 0006 expands it; still map safely if older DBs are behind.
  if (sourceType === "tiktok" || sourceType === "facebook") return sourceType;
  return sourceType;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = normalizeUrl(rawUrl);

    // 1) Analyze link source
    const sourceType = detectSourceType(url);

    // 2) Extract full video / page content for that source
    let fetched: FetchedContent;
    if (sourceType === "youtube") {
      fetched = await fetchYouTube(url);
    } else if (sourceType === "tiktok") {
      fetched = await fetchTikTok(url);
    } else if (sourceType === "instagram") {
      fetched = await fetchInstagram(url);
    } else if (sourceType === "facebook") {
      fetched = await fetchFacebook(url);
    } else {
      fetched = await fetchSocialOrBlog(url, sourceType);
    }

    // 3) Generate recipe — Add tab is food-first, so force generation for all video sources
    const forceFoodByDefault =
      sourceType === "youtube" ||
      sourceType === "tiktok" ||
      sourceType === "instagram" ||
      sourceType === "facebook" ||
      looksLikeFoodContent(fetched.title, fetched.text, fetched.transcript);

    let extracted = await extractRecipeWithAI(fetched, forceFoodByDefault);

    // Retry once if model still refuses or returns incomplete structure
    if (
      extracted.error === "no_recipe" ||
      !extracted.title ||
      !Array.isArray(extracted.ingredients) ||
      !Array.isArray(extracted.instructions)
    ) {
      extracted = await extractRecipeWithAI(fetched, true);
    }

    if (extracted.error === "no_recipe") {
      return new Response(JSON.stringify({ error: "no_recipe" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Last resort: if AI returned a title but empty arrays somehow, still save with retry data checks
    if (!extracted.title || !Array.isArray(extracted.ingredients) || !Array.isArray(extracted.instructions)) {
      return new Response(
        JSON.stringify({ error: "Could not build a complete recipe from this video. Try another food video link." }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let dbSourceType = mapSourceTypeForDb(sourceType);
    const insertPayload = {
      user_id: user.id,
      title: extracted.title || fetched.title || "Imported Recipe",
      description: extracted.description ?? null,
      ingredients: extracted.ingredients ?? [],
      instructions: extracted.instructions ?? [],
      prep_time: extracted.prep_time ?? null,
      cook_time: extracted.cook_time ?? null,
      servings: extracted.servings ?? null,
      difficulty: extracted.difficulty ?? null,
      cuisine: extracted.cuisine ?? null,
      hero_image: fetched.thumbnail ?? null,
      source_url: url,
      source_type: dbSourceType,
      tags: extracted.tags ?? [],
      chef_notes: extracted.chef_notes ?? null,
      tips: extracted.tips ?? null,
      raw_transcript: fetched.text.slice(0, 10000),
    };

    let { data: recipe, error: insertErr } = await supabase
      .from("recipes")
      .insert(insertPayload)
      .select()
      .single();

    // Backward-compatible fallback if DB still only allows youtube|instagram|blog|manual
    if (
      insertErr &&
      (sourceType === "tiktok" || sourceType === "facebook") &&
      /source_type|check constraint/i.test(insertErr.message || "")
    ) {
      dbSourceType = "blog";
      const retry = await supabase
        .from("recipes")
        .insert({ ...insertPayload, source_type: dbSourceType })
        .select()
        .single();
      recipe = retry.data;
      insertErr = retry.error;
    }

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        recipe,
        analysis: {
          source_type: sourceType,
          has_transcript: fetched.hasRichTranscript,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("import-recipe error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
