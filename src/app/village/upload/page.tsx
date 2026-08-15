import type { Metadata } from "next";
import { listVillagePhotos } from "@/app/actions/village-photos";
import { VillagePhotoUploader } from "@/components/village/VillagePhotoUploader";

// 로그인 없이 여는 임시 사진 창구라 검색엔진에는 노출하지 않는다.
export const metadata: Metadata = {
  title: "deetz Village 사진 올리기",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VillageUploadPage() {
  const photos = await listVillagePhotos();
  return <VillagePhotoUploader initialPhotos={photos} />;
}
