export type VideoProvider = "youtube" | "vimeo";

export type VideoInfo = {
  provider: VideoProvider;
  id: string;
  url: string; // canonical
  embed_url: string;
  thumbnail_url: string | null;
};

const YT_PATTERNS = [
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/,
];
const VIMEO_PATTERN = /vimeo\.com\/(?:video\/)?(\d+)/;

export function parseVideoUrl(input: string | null | undefined): VideoInfo | null {
  if (!input) return null;
  const url = input.trim();
  if (!url) return null;

  for (const pattern of YT_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      const id = match[1];
      return {
        provider: "youtube",
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        embed_url: `https://www.youtube.com/embed/${id}`,
        thumbnail_url: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }

  const vimeo = url.match(VIMEO_PATTERN);
  if (vimeo) {
    const id = vimeo[1];
    return {
      provider: "vimeo",
      id,
      url: `https://vimeo.com/${id}`,
      embed_url: `https://player.vimeo.com/video/${id}`,
      thumbnail_url: null, // Vimeo requires an API call we don't make at MVP
    };
  }

  return null;
}

export function isSupportedVideoUrl(input: string): boolean {
  return parseVideoUrl(input) !== null;
}
