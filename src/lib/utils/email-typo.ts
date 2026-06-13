// 흔한 이메일 도메인 오타 감지 → 교정 제안. (.con, gmial, naver.co 등)
// 비차단 힌트용 — 확실치 않으면 null.

const COMMON_DOMAINS = [
  "gmail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "nate.com",
  "icloud.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "qq.com",
];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

// 입력 이메일이 흔한 도메인의 오타로 의심되면 교정된 주소를 반환. 정상/판단불가면 null.
export function suggestEmailCorrection(email: string): string | null {
  const e = email.trim().toLowerCase();
  const m = e.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const local = m[1];
  const domain = m[2];
  if (COMMON_DOMAINS.includes(domain)) return null; // 이미 정상

  let best: string | null = null;
  let bestDist = 99;
  for (const c of COMMON_DOMAINS) {
    const d = levenshtein(domain, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // 거리 1~2면 오타로 간주(자체 도메인 astcompany.co.kr 등은 거리가 멀어 제외됨).
  if (best && bestDist >= 1 && bestDist <= 2) return `${local}@${best}`;
  return null;
}
