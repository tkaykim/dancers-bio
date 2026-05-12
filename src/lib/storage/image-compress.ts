"use client";

/**
 * 큰 사진을 브라우저에서 자동 축소·재인코딩.
 * - GIF는 애니메이션 보존을 위해 그대로 통과
 * - SVG는 비트맵이 아니므로 그대로 통과
 * - 그 외는 longest-side를 maxDim 이내로 비례 축소 후 JPEG로 재인코딩
 * - 결과가 원본보다 크면 원본 그대로 반환 (이미 작은 이미지는 굳이 재인코딩 안 함)
 */
export type CompressOptions = {
  /** 가장 긴 변 픽셀 한도 (기본 1600) */
  maxDim?: number;
  /** JPEG 품질 0~1 (기본 0.85) */
  quality?: number;
  /** 이 임계치 이하면 압축 시도조차 안 함 (기본 700KB) */
  skipUnderBytes?: number;
};

export async function compressAvatarImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.85;
  const skipUnderBytes = opts.skipUnderBytes ?? 700 * 1024;

  // 애니메이션·벡터는 그대로
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  // 충분히 작은 파일은 그대로
  if (file.size <= skipUnderBytes) return file;
  // 비트맵 이미지가 아니면 그대로
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  let dataUrl: string | null = null;
  let img: HTMLImageElement | null = null;
  try {
    // createImageBitmap이 빠르고 메모리 효율적이지만 일부 모바일 사파리 빌드에서 HEIC 등 일부 포맷에서 실패하므로 fallback.
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      dataUrl = URL.createObjectURL(file);
      img = new Image();
      await new Promise<void>((resolve, reject) => {
        img!.onload = () => resolve();
        img!.onerror = () => reject(new Error("이미지 디코딩 실패"));
        img!.src = dataUrl!;
      });
    }

    const srcW = bitmap?.width ?? img?.naturalWidth ?? 0;
    const srcH = bitmap?.height ?? img?.naturalHeight ?? 0;
    if (!srcW || !srcH) return file;

    const ratio = Math.min(1, maxDim / Math.max(srcW, srcH));
    const dstW = Math.round(srcW * ratio);
    const dstH = Math.round(srcH * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // 일부 PNG 투명 배경 대비 흰 배경 채움 (JPEG는 알파 미지원)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dstW, dstH);
    if (bitmap) ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    else if (img) ctx.drawImage(img, 0, 0, dstW, dstH);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) {
      // 압축해도 더 커지면 원본 반환
      return file;
    }
    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
    if (dataUrl) URL.revokeObjectURL(dataUrl);
  }
}
