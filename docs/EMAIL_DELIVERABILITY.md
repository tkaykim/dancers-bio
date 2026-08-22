# 메일 도달률 (스팸함 분류 완화)

> 2026-08-22 작성.
> 운영 절차는 `docs/EMAIL_OPS_RUNBOOK.md`, 계정·키는 `~/.claude/INTEGRATIONS.md`.

## 배경

LG 음원 릴스 챌린지를 운영하면서 8일 동안 600통 넘게 나갔고, 일부 수신자가 스팸함 분류를 알려왔다.

인증 설정은 이미 정상이다 (2026-08-22 DNS 실측).

| 항목 | 값 | 상태 |
|---|---|---|
| SPF | `v=spf1 include:_spf.google.com ~all` | ✅ |
| DKIM | `google._domainkey` 2048-bit | ✅ |
| DMARC | `v=DMARC1; p=none; rua=mailto:contact@deetz.kr` | ⚠ 모니터링만 |

즉 설정 누락 때문이 아니다. 실제 원인으로 보이는 것은 이쪽이다.

- `deetz.kr` 은 2026-08 개설한 신생 도메인이라 발신 평판이 아직 없다.
- 짧은 기간에 같은 수신자에게 비슷한 내용을 반복 발송했다 (guideline / upload_notice / reminder ×3 / guide_fulltext / final_deadline / review_result / reopen).
- 안내성 메일에 `List-Unsubscribe` 헤더가 없었다.

## 대응 — List-Unsubscribe + 원클릭 (RFC 8058)

### 정본 한 곳

`src/lib/notify/list-unsubscribe.mjs` **하나만** 헤더 문자열을 만든다.

- 앱(TS): `src/lib/gmail.ts` 가 import → `sendGmailEmail({ bulk: true, unsubscribeToken })`
- 스크립트(.mjs/.ts): `scripts/lib/list-unsubscribe.mjs` 재수출 → `import { listUnsubscribeHeaders } from "./lib/list-unsubscribe.mjs"`

같은 헤더를 다른 파일에 복붙하지 말 것.

### 나가는 헤더

토큰이 있는 수신자(deetz 계정 연결):

```
List-Unsubscribe: <https://www.deetz.kr/unsubscribe/{token}>, <mailto:contact@deetz.kr?subject=unsubscribe>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

토큰이 없는 수신자(계정 미연결·콜드 아웃리치):

```
List-Unsubscribe: <mailto:contact@deetz.kr?subject=unsubscribe>
```

`List-Unsubscribe-Post` 는 **HTTPS URI 가 있을 때만** 붙인다.
mailto 만 있는데 One-Click 을 선언하면 RFC 8058 위반이라 오히려 감점이다.

헤더는 folding 없이 한 줄로 내보낸다 (`{ prepared: true }`).
접으면 `List-Unsubscribe:` 뒤가 비고 값이 다음 줄로 내려가는데, 규격상 적법해도 실제 대형 발신자는 전부 한 줄로 낸다.

### URL 이 POST 에도 동작해야 한다

원클릭은 헤더의 URL 로 **POST** 를 보낸다. 그게 안 되면 헤더를 붙인 의미가 없다.

| 요청 | 도착지 | 동작 |
|---|---|---|
| `GET /unsubscribe/<token>` | `src/app/(public)/unsubscribe/[token]/page.tsx` | 확인 버튼이 있는 페이지 (메일 스캐너 프리페치로 해지되지 않게) |
| `POST /unsubscribe/<token>` | `src/app/api/unsubscribe/[token]/route.ts` | 즉시 수신거부, `200 text/plain` |
| `GET /api/unsubscribe/<token>` | 같은 라우트 | 확인 페이지로 302 |

App Router 는 한 세그먼트에 `page` 와 `route` 를 같이 둘 수 없다.
그래서 `src/middleware.ts` 가 **POST 일 때만** API 라우트로 rewrite 한다.

⚠️ 확인 페이지의 "수신거부 확인" / "다시 메일 받기" 버튼도 서버 액션이라 같은 URL 로 POST 한다.
그건 `next-action` 헤더로 구분해 통과시킨다. 이 예외가 빠지면 페이지 버튼이 통째로 죽는다.

## 어디에 붙였고 어디에 안 붙였나

판단 기준은 하나다.
**수신자가 직접 일으킨 사건 1건의 결과 통지 = 거래성**, 그 외 우리가 보내기로 정해서 반복적으로 나가는 것 = 안내성.

거래성에 수신거부를 달면 영수증·미팅 확정 같은 필수 안내까지 끊기고, 실제로 수신거부 대상도 아니다.

### 안내성 (bulk) — 헤더 부착 ✅

| 위치 | 무엇 | 근거 |
|---|---|---|
| `src/lib/notify/approval-welcome-mail.ts` | 프로필 승인 안내 | 온보딩 브로드캐스트. 이미 본문에 수신거부 링크가 있었다 |
| `src/lib/notify/announcement-mail.ts` | 프로젝트 공지 | 운영자 작성 브로드캐스트, 같은 사람에게 여러 번 나간다 |
| `scripts/send-challenge-*.mjs` (7종) | 릴스 챌린지 안내 | 8일간 600통 — 이번 스팸 분류의 당사자 |
| `scripts/profile-nudge.mjs` | 프로필 채우기 독려 | 마케팅성 넛지 |
| `scripts/send-project-recommend.mjs` | 공고 추천 | 마케팅성 추천 |
| `scripts/send-drink-challenge-recommend.mjs` | 챌린지 참여 권유 | 마케팅성 추천 |
| `scripts/send-approval-welcome.mjs` | 승인 안내 배치 | 위 앱 경로의 배치판 |
| `scripts/send-ndol-guidance-mails.mjs` | 오디션 안내 | 지원자 대상 반복 안내 |
| `scripts/send-ndol-unavailable-notice.mjs` | 참석 불가 안내 | 지원자 대상 반복 안내 |
| `scripts/send-ndol37-schedule-check.mjs` | 일정 확인 요청 | 지원자 대상 반복 안내 |
| `scripts/send-visa-outreach.mjs` | 비자 아웃리치 | 콜드 아웃리치 (토큰 없음 → mailto 만) |
| `scripts/cold-email-send.ts` | B2B 콜드메일 | 콜드 아웃리치 (토큰 없음 → mailto 만) |

### 거래성 (transactional) — 헤더 미부착 ❌

| 위치 | 무엇 | 근거 |
|---|---|---|
| `src/lib/notify/payment-receipt-mail.ts` | 결제 영수증 | 본인이 결제한 건의 증빙. 끊으면 안 된다 |
| `src/lib/notify/workshop-mails.ts` | 워크샵 예약금·신청 확정 | 본인 결제·신청의 확정 통지 |
| `src/lib/notify/visa-meeting-invite-mail.ts` | 비자 미팅 초대·확정 | 본인이 잡은 일정 |
| `src/lib/notify/visa-stage-mails.ts` | 비자 미팅/오디션 리마인더·확정 | 본인 건의 단계 진행 |
| `src/lib/notify/visa-application-mail.ts`, `visa-applicant-confirmation-mail.ts` | 비자 신청 접수 | 본인 신청의 접수 확인 |
| `src/lib/notify/rejection-mail.ts` | 지원 결과 안내 | 본인 지원의 결과 |
| `src/lib/notify/stage-mail.ts` | 캐스팅 단계 통지 | 본인 지원의 결과 |
| `src/lib/notify/settlement-mail.ts`, `schedule-mail.ts` | 정산 출금·일정 요청 | 본인 요청의 처리 |
| `src/lib/notify/village-waitlist-mail.ts` | 대기 등록 확인 | 본인 등록의 확인 |

### 대상 아님 — 사내·파트너 운영 메일 ❌

수신자가 고정된 내부/파트너 주소라 수신거부 개념이 없다.

- `src/lib/notify/bug-mail.ts` (버그 리포트)
- `src/lib/notify/payment-receipt-mail.ts` 의 `sendPaymentInternalNotice`
- `src/lib/notify/workshop-mails.ts` 의 `*OpsMail`, `*RecoveryMail`
- `scripts/send-ndol-ops-brief-attachment.mjs`, `send-ndol-ops-procedure-guide.mjs`, `send-ndol-onsite-qr-guide.mjs`, `send-ndol-summary-notice.mjs`, `send-ndol-test-qr-instructions.mjs`
  (수신자가 `odh@grigoent.co.kr`, `hs@astcompany.co.kr` 등으로 하드코딩)

### 이메일 미발송

- `src/lib/notify/project-match.ts` — 인앱 알림 + 웹푸시만 보낸다. 메일 경로 없음.
- `scripts/send-project-match.mjs` — 위와 동일.

## 토큰 커버리지 주의

`notification_preferences` 행은 유저가 처음 필요해질 때 생성된다.
2026-08-22 실측 `auth.users` 1211명 중 행은 598개뿐이었다.

행이 없으면 토큰도 없어서 **mailto 수신거부만** 나가고 원클릭이 선언되지 않는다.
그래서 `fetchUnsubscribePrefs()` 가 발송 직전에 없는 행을 기본값으로 만들어 준다.
새 대량 발송 스크립트를 쓸 때 이 함수를 거치지 않으면 절반이 원클릭 없이 나간다.

---

# 검토 항목 (대표 승인 후 실행)

## 1. DMARC `p=none` → `p=quarantine`

**현재**: `v=DMARC1; p=none; rua=mailto:contact@deetz.kr`
**제안**: 리포트를 며칠 확인한 뒤 단계적으로 올린다. **DNS 변경은 대표 승인 후.** (가비아 관리)

`p=none` 은 "위반해도 그냥 통과시켜라" 라서 정책적 보호가 0이다.
수신 서버 입장에서 `p=quarantine` 이상은 "이 도메인은 자기 메일을 관리한다" 는 신호이기도 하다.

다만 지금 바로 올리면 안 된다. 이유는 두 가지다.

- 아직 `p=none` 리포트로 **정렬 실패 발신원이 없는지 확인하지 않았다.** 놓친 발신 경로(외부 SaaS, 폼 메일러, 전달 규칙)가 있으면 그 메일이 통째로 격리된다.
- 릴스 챌린지(`gvfbdr`)가 8/23 23:59 마감으로 실운영 중이다. 마감 전 DNS 변경은 하지 않는다.

권장 순서:

1. `contact@deetz.kr` 로 들어온 DMARC 리포트(Mail.ru, Microsoft 등) **최소 7일치**를 확인한다.
   Google Workspace 발신 외에 SPF/DKIM 정렬이 실패하는 발신원이 있는지 본다.
2. 정렬 실패가 없으면 `pct=25` 를 붙여 부분 적용부터 한다.
   `v=DMARC1; p=quarantine; pct=25; rua=mailto:contact@deetz.kr`
3. 1~2주 리포트가 깨끗하면 `pct` 를 100까지 올리고, 그 다음에 `p=reject` 를 검토한다.

리포트는 XML 이라 눈으로 읽기 어렵다. 파서를 붙이거나 무료 리포트 대시보드를 쓰는 편이 빠르다.

## 2. 열람추적 픽셀 — **유지 권장** (제거하지 말 것)

전 메일에 1×1 픽셀(`/api/track/open`)이 들어간다.
스팸 점수를 약간 올리는 것은 맞지만, **실제로 쓰이고 있어서** 지금 빼면 기능이 깨진다.

실측 (2026-08-22, `public.email_opens`):

| 캠페인 | 열람 이벤트 | 고유 수신자 |
|---|---|---|
| challenge-guideline-2026-08 | 393 | 114 |
| challenge-reminder-1-2026-08 | 261 | 62 |
| challenge-upload-notice-2026-08 | 187 | 86 |
| deetz-profile-nudge-2026-06 | 336 | 180 |
| (그 외 9개 캠페인) | — | — |

소비처 두 곳:

- `scripts/challenge-status.mjs` — 확정/발송/**열람**/제출 대시보드. 챌린지 운영 중 현재 쓰고 있다.
- `scripts/profile-nudge.mjs` — 원장 파일이 유실돼도 재발송을 막는 **중복 발송 억제 목록**으로 `email_opens` 를 쓴다.
  이걸 빼면 같은 사람에게 넛지 메일이 두 번 나갈 수 있다 — 스팸 점수를 낮추려다 반복 발송을 늘리는 역효과다.

대신 이렇게 좁히는 것을 제안한다.

- **거래성 메일에서는 뺀다.** 영수증·미팅 확정에 추적 픽셀은 얻는 게 없다.
  (현재도 챌린지·넛지 계열에만 들어가 있어서 실제 작업량은 적다.)
- **캠페인 종료 후에는 뺀다.** 챌린지가 끝나면 그 계열 스크립트에서 제거한다.
- 픽셀보다 도달률에 훨씬 크게 작용하는 것은 위의 List-Unsubscribe 와 발송 빈도다. 우선순위를 그쪽에 둔다.

## 3. 코드 밖 조치 (설정 아님 — 운영 습관)

이번 사고의 가장 큰 원인은 헤더가 아니라 **빈도**일 가능성이 높다.

- 8일에 8종을 같은 수신자에게 보냈다. 같은 사람 기준 주 1~2통을 상한으로 두는 편이 안전하다.
- 신생 도메인은 워밍업이 필요하다. 일 발송량을 급격히 올리지 않는다 (현 Gmail 계정 실질 한도 약 500통/일).
- Google Postmaster Tools 에 `deetz.kr` 을 등록하면 Gmail 기준 스팸 신고율·도메인 평판을 직접 볼 수 있다. 지금은 추측으로 판단하고 있다.
