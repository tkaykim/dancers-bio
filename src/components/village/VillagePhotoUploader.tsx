"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, CircleAlert, ImagePlus, Loader2, Trash2 } from "lucide-react";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { createClient } from "@/lib/supabase/browser";
import { compressAvatarImage } from "@/lib/storage/image-compress";
import {
  createVillagePhotoUploadUrlAction,
  hideVillagePhotoAction,
  registerVillagePhotoAction,
  type VillagePhotoRow,
} from "@/app/actions/village-photos";
import { VILLAGE_PHOTO_BUCKET, VILLAGE_PHOTO_MAX_BYTES } from "@/lib/village/photos";
import { cn } from "@/lib/utils";
import { PLANS, VILLAGE_FULL_NAME } from "./copy";

type OptionKey = "a" | "b" | "common";

const BUCKET = VILLAGE_PHOTO_BUCKET;

const OPTIONS: { key: OptionKey; label: string; desc: string }[] = [
  { key: "a", label: "옵션 A", desc: "강서구 2층 · 첫 결제 200만원 / 월 50만원" },
  { key: "b", label: "옵션 B", desc: "강서구 4층(엘리베이터) · 첫 결제 240만원 / 월 60만원" },
  { key: "common", label: "공용 공간", desc: "두 옵션에 공통으로 쓸 사진" },
];

export function VillagePhotoUploader({ initialPhotos }: { initialPhotos: VillagePhotoRow[] }) {
  const [photos, setPhotos] = useState<VillagePhotoRow[]>(initialPhotos);
  const [option, setOption] = useState<OptionKey>("a");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // 사진은 여러 장을 한 번에 고를 수 있다.
  // 한 요청에 몰아 보내면 서버 액션 용량 한도에 걸리므로 파일마다 순차로 올린다.
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    const list = Array.from(files);
    setProgress({ done: 0, total: list.length });

    const added: VillagePhotoRow[] = [];
    const failures: string[] = [];
    const supabase = createClient();

    for (let i = 0; i < list.length; i += 1) {
      const original = list[i];
      try {
        // 폰 원본은 5~10MB라 1920px JPEG 로 줄인다.
        // 아이폰 HEIC 는 브라우저가 그대로는 못 보여주므로 크기와 무관하게 변환을 시도한다.
        const isHeic = /hei[cf]/i.test(original.type) || /\.hei[cf]$/i.test(original.name);
        const prepared = await compressAvatarImage(original, {
          maxDim: 1920,
          quality: 0.85,
          ...(isHeic ? { skipUnderBytes: 0 } : {}),
        });

        if (prepared.size > VILLAGE_PHOTO_MAX_BYTES) {
          failures.push(`${original.name}: 사진 용량이 너무 큽니다(${(prepared.size / 1048576).toFixed(1)}MB).`);
          setProgress({ done: i + 1, total: list.length });
          continue;
        }

        // ① 서버에서 업로드 자리를 받고 ② 브라우저가 Storage 로 직접 올린다.
        //    파일 본문이 서버 액션을 지나가지 않으므로 Vercel 요청 본문 한도(4.5MB)에 걸리지 않는다.
        const signed = await createVillagePhotoUploadUrlAction({
          optionKey: option,
          filename: prepared.name || original.name || `photo_${i}.jpg`,
          contentType: prepared.type || original.type || null,
          size: prepared.size,
        });
        if (!signed.ok) {
          failures.push(`${original.name}: ${signed.error}`);
          setProgress({ done: i + 1, total: list.length });
          continue;
        }
        if (!signed.data) {
          failures.push(`${original.name}: 업로드 준비에 실패했습니다.`);
          setProgress({ done: i + 1, total: list.length });
          continue;
        }

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(signed.data.path, signed.data.token, prepared, {
            contentType: prepared.type || "image/jpeg",
          });
        if (upErr) {
          failures.push(`${original.name}: 업로드 실패 (${upErr.message})`);
          setProgress({ done: i + 1, total: list.length });
          continue;
        }

        const registered = await registerVillagePhotoAction({
          optionKey: option,
          path: signed.data.path,
        });
        if (registered.ok && registered.data) added.push(registered.data);
        else if (!registered.ok) failures.push(`${original.name}: ${registered.error}`);
      } catch {
        failures.push(`${original.name}: 사진을 읽지 못했습니다. 다른 파일로 시도해 주세요.`);
      }
      setProgress({ done: i + 1, total: list.length });
    }
    const failed = failures.length;
    setError(failed > 0 ? failures.slice(0, 3).join("\n") : null);

    if (added.length > 0) {
      setPhotos((prev) => [...prev, ...added]);
      setSavedAt(Date.now());
    }
    setBusy(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // 파일을 지우지 않고 화면에서만 내린다 — 인증 없는 창구라 되돌릴 수 없는 삭제는 열어두지 않는다.
  const remove = (id: string) => {
    startTransition(async () => {
      const res = await hideVillagePhotoAction({ id });
      if (res.ok) setPhotos((prev) => prev.filter((p) => p.id !== id));
      else setError(res.error);
    });
  };

  const current = photos.filter((p) => p.option_key === option);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col break-keep px-6 pb-16 pt-6 md:max-w-3xl md:px-10 md:pb-24 md:pt-10">
      <div className="mb-8 flex items-center justify-between">
        <DeetzLogo className="h-7 w-auto" priority />
        <Link href="/village?lang=ko" className="text-xs text-ink-3 hover:text-foreground">
          공개 페이지 보기 →
        </Link>
      </div>

      <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-ink-3">{VILLAGE_FULL_NAME}</p>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">사진 올리기</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
        <span className="block">옵션 A와 옵션 B의 건물·객실 사진을 여기서 올립니다.</span>
        <span className="block">여러 장을 한 번에 선택할 수 있습니다.</span>
        <span className="block">올리면 곧바로 공개 페이지에 반영됩니다.</span>
      </p>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-hairline-2 bg-secondary/40 px-4 py-3">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">이 주소는 로그인 없이 열리는 임시 창구입니다.</span>
          <span className="block">링크를 아는 사람은 누구나 사진을 올리거나 지울 수 있으니 필요한 분에게만 전달해 주세요.</span>
        </p>
      </div>

      {/* 옵션 선택 */}
      <p className="mb-2 mt-8 text-sm font-semibold text-foreground">어느 옵션 사진인가요?</p>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => {
          const count = photos.filter((p) => p.option_key === o.key).length;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setOption(o.key)}
              aria-pressed={option === o.key}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
                option === o.key
                  ? "border-foreground bg-secondary/60"
                  : "border-hairline-2 hover:border-foreground/40",
              )}
            >
              <span>
                <span className="block text-sm font-semibold text-foreground">{o.label}</span>
                <span className="block text-xs text-ink-3">{o.desc}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-4">{count}장</span>
            </button>
          );
        })}
      </div>

      {/* 업로드 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        {busy
          ? progress
            ? `올리는 중… ${progress.done}/${progress.total}`
            : "올리는 중…"
          : "사진 선택해서 올리기"}
      </button>
      <p className="mt-2 text-center text-xs text-ink-4">
        <span className="block">한 번에 여러 장을 고를 수 있습니다.</span>
        <span className="block">큰 사진은 자동으로 줄여서 올립니다.</span>
      </p>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-destructive">{error}</p>
        </div>
      ) : null}

      {savedAt && !busy && !error ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-hairline-2 bg-secondary/50 px-3.5 py-3">
          <Check className="size-4 shrink-0 text-primary" />
          <p className="text-[13px] text-ink-2">공개 페이지에 반영됐습니다.</p>
        </div>
      ) : null}

      {/* 현재 사진 */}
      <p className="mb-3 mt-9 text-sm font-semibold text-foreground">
        {OPTIONS.find((o) => o.key === option)?.label} 사진 {current.length}장
      </p>
      {current.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-2 px-5 py-10 text-center text-sm text-ink-3">
          아직 올린 사진이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
          {current.map((p) => (
            <figure key={p.id} className="overflow-hidden rounded-xl border border-hairline-2 bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.public_url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] text-ink-3 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                내리기
              </button>
            </figure>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-ink-4">
        <span className="block">
          요금 안내는 옵션 A 첫 결제 {(PLANS[0].firstMonth / 10000).toLocaleString()}만원, 옵션 B 첫 결제{" "}
          {(PLANS[1].firstMonth / 10000).toLocaleString()}만원으로 공개되어 있습니다.
        </span>
        <span className="block">사진 외에 고칠 내용이 있으면 알려주세요.</span>
      </p>
    </div>
  );
}
