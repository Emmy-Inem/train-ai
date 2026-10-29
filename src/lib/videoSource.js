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
  if (["mega.nz", "mega.co.nz"].includes(host)) {
    const file = url.pathname.match(/^\/(?:file|embed)\/([\w-]+)\/?$/);
    const legacyFile = url.hash.match(/^#!([\w-]+)!([\w-]+)$/);
    const fileId = file?.[1] || legacyFile?.[1];
    const fileKey = file ? url.hash.slice(1) : legacyFile?.[2];
    if (fileId && /^[\w-]+$/.test(fileKey || "")) return {
      type: "mega", src: `https://mega.nz/embed/${fileId}#${fileKey}`,
      externalUrl: `https://mega.nz/file/${fileId}#${fileKey}`,
    };
    // A shared folder is a collection of lessons, not an HTML5 video stream.
    if (/^\/folder\/[\w-]+/.test(url.pathname) || /^#F![\w-]+!/.test(url.hash)) return {
      type: "external", provider: "MEGA", src: url.toString(),
    };
    return { type: "none" };
  }
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
