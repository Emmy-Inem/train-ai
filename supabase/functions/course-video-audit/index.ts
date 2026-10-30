// Read-only provider checks for privileged course maintenance. Never returns keys.
import { verifiedVideos } from "../youtube-course-discovery/core.ts";
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://supabase.com", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let projectSecrets: string[] = [];
  try { projectSecrets = Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")); } catch { /* fail closed */ }
  const suppliedKey = req.headers.get("apikey") || "";
  const privileged = (!!service && req.headers.get("authorization") === `Bearer ${service}`) ||
    (suppliedKey.startsWith("sb_secret_") && projectSecrets.includes(suppliedKey));
  if (!privileged) return json({ error: "Privileged maintenance access required" }, 401);
  const key = Deno.env.get("YOUTUBE_API_KEY");
  if (!key) return json({ error: "YouTube connection is missing" }, 503);
  async function youtube(resource: string, parameters: Record<string, string>) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams({ ...parameters, key })}`, { signal: AbortSignal.timeout(20000) });
    const value = await response.json();
    if (!response.ok) throw new Error(`YouTube ${response.status}: ${value.error?.errors?.[0]?.reason || "provider_error"}`);
    return value;
  }
  async function details(ids: string[]) {
    const result = [];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const value = await youtube("videos", { part: "snippet,contentDetails,status", id: ids.slice(offset, offset + 50).join(",") });
      result.push(...(value.items || []));
    }
    return { verified: verifiedVideos(result), returned: result.map(v => ({ id: v.id, title: v.snippet?.title, status: v.status, contentDetails: v.contentDetails })) };
  }
  try {
    const body = await req.json();
    if (body.action === "verify") {
      if (!Array.isArray(body.ids) || body.ids.length > 150 || body.ids.some((id: unknown) => typeof id !== "string" || !/^[\w-]{11}$/.test(id))) return json({ error: "Supply up to 150 video IDs" }, 400);
      return json(await details([...new Set(body.ids)] as string[]));
    }
    if (body.action === "search") {
      if (!Array.isArray(body.queries) || body.queries.length > 40 || body.queries.some((q: unknown) => typeof q !== "string" || q.length < 5 || q.length > 160)) return json({ error: "Supply up to 40 concise course queries" }, 400);
      const searches = [];
      // Keep provider concurrency bounded and retain the exact query-to-result mapping.
      for (let offset = 0; offset < body.queries.length; offset += 4) {
        searches.push(...await Promise.all(body.queries.slice(offset, offset + 4).map(async (query: string) => {
          const found = await youtube("search", { part: "snippet", type: "video", q: query, maxResults: "5", videoEmbeddable: "true", videoSyndicated: "true", safeSearch: "strict", regionCode: "NG", relevanceLanguage: "en" });
          return { query, ids: (found.items || []).map((v: any) => v.id?.videoId).filter(Boolean) };
        })));
      }
      const ids = [...new Set(searches.flatMap(s => s.ids))] as string[];
      const checked = await details(ids);
      return json({ searches, ...checked });
    }
    return json({ error: "Unknown maintenance action" }, 400);
  } catch (error) { return json({ error: error.message || "Provider check failed" }, 502); }
});
