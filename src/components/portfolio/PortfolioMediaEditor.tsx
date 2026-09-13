"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePortfolioMediaAction, type PortfolioMediaItem } from "@/app/actions/portfolio-media";
import { uploadDancerPortfolioFileFromBrowser } from "@/lib/storage/upload-dancer-portfolio-file";
import { useT } from "@/lib/i18n/provider";
import messages from "@/lib/i18n/messages/portfolio-journey";

export function PortfolioMediaEditor({ dancerId, initialItems }: { dancerId: string; initialItems: PortfolioMediaItem[] }) {
  const t = useT(messages);
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  async function change(input: unknown) {
    const result = await changePortfolioMediaAction(dancerId, input);
    if (!result.ok) throw new Error(t("error"));
    setItems(result.items); setSaved(true); router.refresh();
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setSaved(false);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : t("error")); }
    finally { setBusy(false); }
  }
  return <section id="portfolio-media" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border p-4">
    <h3 className="font-semibold">{t("media")}</h3>
    <p className="whitespace-pre-line text-sm text-ink-2">{t("mediaHint")}</p>
    <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-border p-3 text-sm font-medium">
      {busy ? t("busy") : t("upload")}
      <input aria-label={t("upload")} type="file" accept="image/jpeg,image/png,video/mp4" multiple disabled={busy} className="sr-only" onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = "";
        void run(async () => {
          if (items.length + files.length > 50) throw new Error(t("limit"));
          for (const file of files) {
            if (!["image/jpeg", "image/png", "video/mp4"].includes(file.type)) throw new Error(t("invalid"));
            const upload = await uploadDancerPortfolioFileFromBrowser(file, dancerId);
            if (!upload.ok) throw new Error(upload.error);
            await change({ op: "add", url: upload.url, type: file.type.startsWith("image/") ? "photo" : "video" });
          }
        });
      }} />
    </label>
    <form className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await change({ op: "add", type: "video", url }); setUrl(""); }); }}>
      <label htmlFor="portfolio-video-url" className="text-sm">{t("video")}</label>
      <input id="portfolio-video-url" type="url" required value={url} onChange={e => setUrl(e.target.value)} className="min-w-0 rounded-lg border border-input px-3 py-3 text-base" />
      <button disabled={busy || !url.trim()} className="min-h-11 rounded-lg bg-secondary px-4 text-sm disabled:opacity-50">{t("add")}</button>
    </form>
    {!items.length && <p className="text-sm text-ink-3">{t("empty")}</p>}
    <ol className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item, index) => <li key={`${item.url}-${index}`} className="min-w-0 overflow-hidden rounded-xl border border-border p-2">
        {item.type === "photo" || /\.(png|jpg|jpeg|webp)(\?|$)/i.test(item.url) ?
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={`${t("media")} ${index + 1}`} className="aspect-video w-full rounded-lg object-cover" /> :
          <a href={/^https?:\/\//i.test(item.url) ? item.url : undefined} target="_blank" rel="noopener noreferrer" className="block truncate py-4 text-sm underline">{item.url}</a>}
        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" disabled={busy || index === 0} aria-label={t("up")} onClick={() => void run(() => change({ op: "move", index, url: item.url, direction: -1 }))} className="min-h-11 min-w-11 rounded bg-secondary disabled:opacity-30">↑</button>
          <button type="button" disabled={busy || index === items.length - 1} aria-label={t("down")} onClick={() => void run(() => change({ op: "move", index, url: item.url, direction: 1 }))} className="min-h-11 min-w-11 rounded bg-secondary disabled:opacity-30">↓</button>
          <button type="button" disabled={busy} onClick={() => void run(() => change({ op: "remove", index, url: item.url }))} className="min-h-11 rounded px-2 text-xs">{t("remove")}</button>
        </div>
      </li>)}
    </ol>
    <p role="status" className="whitespace-pre-line text-sm">{error || (saved ? t("saved") : "")}</p>
  </section>;
}
