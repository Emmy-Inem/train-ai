export function parseVideoSource(rawUrl) {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (/^[\w-]{11}$/.test(value)) return { type: "youtube", videoId: value };
  if (value.startsWith("blob:")) return { type: "html5", src: value };
  if (!value) return { type: "none" };
  let url;
  try { url = new URL(/^(?:www\.|youtu\.be\/|youtube\.com\/|vimeo\.com\/)/i.test(value) ? `https://${value}` : value); }
  catch { return { type: "none" }; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return { type: "none" };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
    const id = host === "youtu.be" ? url.pathname.split("/")[1]
      : url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/)?.[1];
    return /^[\w-]{11}$/.test(id || "") ? { type: "youtube", videoId: id } : { type: "none" };
  }
  if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([\w]+))?\/?$/);
    if (!match) return { type: "none" };
    return { type: "vimeo", videoId: match[1], hash: url.searchParams.get("h") || match[2] || "" };
  }
  return { type: "html5", src: url.toString() };
}
