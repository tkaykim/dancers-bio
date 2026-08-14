import "server-only";

/**
 * Google Drive resumable upload 세션 발급.
 *
 * 지원자는 구글 로그인을 하지 않는다.
 * 서버가 우리(대표 계정) 자격증명으로 업로드 세션 URL만 만들어 주고,
 * 브라우저가 그 URL로 파일을 직접 PUT 한다.
 *
 * - 액세스 토큰은 절대 브라우저로 내보내지 않는다. 세션 URL 자체가 1회용 업로드 권한이다.
 * - 파일이 서버(Vercel)를 경유하지 않으므로 요청 본문 크기 제한을 받지 않는다.
 * - 파일명은 여기서 정한 값이 그대로 Drive 에 기록된다. 지원자가 바꿀 수 없다.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";

function creds() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "서버 설정이 누락되었습니다. (GOOGLE_DRIVE_* 미설정) 관리자에게 문의해 주세요.",
    );
  }
  return { clientId, clientSecret, refreshToken };
}

/** 액세스 토큰은 짧게 살아 있으므로 요청마다 새로 받는다. 캐시하지 않는다. */
async function accessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = creds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Drive 토큰 갱신 실패 (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Drive 토큰 응답에 access_token 없음");
  return json.access_token;
}

export interface ResumableSession {
  uploadUrl: string;
  fileName: string;
}

/**
 * 지정한 폴더에 파일 하나를 올릴 resumable 세션을 연다.
 * 같은 이름의 파일이 이미 있어도 Drive 는 덮어쓰지 않고 별개 파일로 쌓는다.
 * 재제출 시 최신 파일을 쓰려면 uploaded_at 기준으로 최신 것을 본다.
 */
export async function createResumableSession(opts: {
  fileName: string;
  contentType: string;
  folderId: string;
  sizeBytes?: number;
  /**
   * 브라우저가 이 세션 URL 로 직접 PUT 하려면, 세션을 만들 때 그 Origin 을 같이 알려야 한다.
   * 구글이 이 값을 세션에 묶어두고 이후 PUT 응답에 CORS 헤더를 내준다.
   * 생략하면 브라우저 업로드가 CORS 로 차단된다.
   */
  origin?: string;
}): Promise<ResumableSession> {
  const token = await accessToken();
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.contentType,
      ...(opts.origin ? { Origin: opts.origin } : {}),
      ...(opts.sizeBytes
        ? { "X-Upload-Content-Length": String(opts.sizeBytes) }
        : {}),
    },
    body: JSON.stringify({
      name: opts.fileName,
      parents: [opts.folderId],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive 업로드 세션 생성 실패 (${res.status}) ${detail.slice(0, 300)}`);
  }

  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) throw new Error("Drive 응답에 업로드 URL(Location)이 없습니다.");
  return { uploadUrl, fileName: opts.fileName };
}

export interface DriveFileMeta {
  id: string;
  name: string;
  size?: number;
  webViewLink?: string;
  parents?: string[];
}

/** 업로드 완료 후 실제로 우리 폴더에 들어왔는지 서버가 직접 확인한다. */
export async function getDriveFile(fileId: string): Promise<DriveFileMeta> {
  const token = await accessToken();
  const url = `${FILES_URL}/${encodeURIComponent(fileId)}?fields=id,name,size,webViewLink,parents&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Drive 파일 조회 실패 (${res.status})`);
  const j = (await res.json()) as {
    id: string;
    name: string;
    size?: string;
    webViewLink?: string;
    parents?: string[];
  };
  return {
    id: j.id,
    name: j.name,
    size: j.size ? Number(j.size) : undefined,
    webViewLink: j.webViewLink,
    parents: j.parents,
  };
}
