import { parseVideoUrl } from "@/lib/utils/video";

type Props = {
  url: string | null | undefined;
  title?: string;
  className?: string;
};

export function VideoEmbed({ url, title, className }: Props) {
  const video = parseVideoUrl(url ?? null);
  if (!video) return null;
  return (
    <div className={"relative aspect-video w-full overflow-hidden rounded-md bg-black " + (className ?? "")}>
      <iframe
        src={video.embed_url}
        title={title ?? "video"}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

type ThumbProps = {
  url: string | null | undefined;
  alt?: string;
  className?: string;
};

export function VideoThumbnail({ url, alt, className }: ThumbProps) {
  const video = parseVideoUrl(url ?? null);
  if (!video?.thumbnail_url) {
    return (
      <div className={"flex aspect-video w-full items-center justify-center rounded-md bg-muted text-xs text-muted-foreground " + (className ?? "")}>
        {video?.provider === "vimeo" ? "Vimeo" : "영상"}
      </div>
    );
  }
  // Using <img> on purpose: dynamic external thumbnails benefit from no-cost rendering and avoid Next/Image config burden.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={video.thumbnail_url}
      alt={alt ?? "video thumbnail"}
      loading="lazy"
      className={"aspect-video w-full rounded-md object-cover " + (className ?? "")}
    />
  );
}
