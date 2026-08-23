/**
 * 흔한 이메일 도메인 오타를 잡아 고칠 후보를 제안한다.
 *
 * 왜 필요한가
 *   접수 폼에 적은 주소가 틀리면 안내 메일이 전부 반송되는데, 지원자는 그 사실을
 *   알 방법이 없다. 실제로 릴스 챌린지에서 두 건이 났다.
 *     lhn10630@naver.com  (실제 lhm10630 — 로컬파트 오타라 여기서 못 잡는다)
 *     sslk456@naver.con   (naver.com — 이 모듈이 잡는 유형)
 *   한 사람은 캠페인 내내 메일 7통을 한 통도 못 받았다.
 *
 * 막지 않고 제안만 한다.
 *   실제로 존재하는 사내 도메인이나 해외 도메인을 오타로 오판해 접수를 막으면
 *   지원 자체를 잃는다. 그 손해가 반송보다 크다. 그래서 경고 + 원클릭 수정만 제공한다.
 */

/** 실무에서 실제로 들어오는 도메인들. 이 목록에 대해서만 근접 오타를 본다. */
const KNOWN_DOMAINS = [
  "naver.com",
  "gmail.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "nate.com",
  "icloud.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "hanmail.com",
] as const;

/**
 * 오타가 잦은 자리를 직접 매핑한다.
 * 편집거리만으로는 naver.net(실존) 같은 걸 naver.com 오타로 오판하기 쉽다.
 */
const EXPLICIT_FIXES: Record<string, string> = {
  // 최상위 도메인 오타 — 키보드에서 m 옆이 n 이라 가장 흔하다
  "naver.con": "naver.com",
  "gmail.con": "gmail.com",
  "daum.ent": "daum.net",
  "nate.con": "nate.com",
  "kakao.con": "kakao.com",
  // 철자 오타
  "navr.com": "naver.com",
  "nave.com": "naver.com",
  "naver.co": "naver.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gnail.com": "gmail.com",
  "hanmail.ne": "hanmail.net",
  "hanmial.net": "hanmail.net",
  "icloud.co": "icloud.com",
  "outlook.co": "outlook.com",
};

/** 한 글자 차이인지 본다(삽입·삭제·치환 1회). 짧은 도메인에서 과잉 매칭을 막으려 길이도 본다. */
function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * 고칠 후보 도메인을 돌려준다. 확신이 없으면 null.
 * 입력이 이메일 형태가 아니거나 이미 아는 도메인이면 null.
 */
export function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;

  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain.includes(".")) return null;
  if ((KNOWN_DOMAINS as readonly string[]).includes(domain)) return null;

  const explicit = EXPLICIT_FIXES[domain];
  if (explicit) return `${email.slice(0, at)}@${explicit}`;

  // 아는 도메인과 한 글자 차이면 오타로 본다.
  // 여러 개가 걸리면 판단이 서지 않는 것이므로 제안하지 않는다.
  const near = KNOWN_DOMAINS.filter((known) => isOneEditAway(domain, known));
  if (near.length !== 1) return null;

  return `${email.slice(0, at)}@${near[0]}`;
}
