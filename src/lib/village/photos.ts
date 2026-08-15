/**
 * deetz Village 사진 업로드 공통 상수.
 * "use server" 파일은 async 함수만 export 할 수 있어 서버 액션 파일에 둘 수 없다.
 */

/** 브라우저에서 1920px JPEG 로 줄인 뒤의 상한. Storage 직행이라 Vercel 요청 본문 한도(4.5MB)와 무관하다. */
export const VILLAGE_PHOTO_MAX_BYTES = 20 * 1024 * 1024;

export const VILLAGE_PHOTO_BUCKET = "village-photos";
