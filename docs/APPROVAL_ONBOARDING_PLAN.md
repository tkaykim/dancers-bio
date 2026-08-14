# deetz 승인 → 본인인증 → 안내 발송 계획

> 2026-08-14. 채점·평점(DQS)은 보류하고 **승인 / 인스타 DM 본인인증 / 승인 완료 안내** 라인만 다룬다.
> 점수 설계는 `QUALITY_PLAN.md` 에 그대로 둔다.
> 아래 진단은 전부 실제 조회·실측이다(운영 DB, 허브 DB, prod HTTP, 워커 env).

## 0. 결론 먼저

승인 자체는 준비가 끝났고, **본인인증 자동화는 지금 작동하지 않는다.**
DM은 잘 들어오는데 마지막 세 걸음이 끊겨 있다.

| 단계 | 상태 | 증거 |
|---|---|---|
| ① DM 수집 (Conversations API 15초 폴) | ✅ 정상 | `social_inbox_events` deetz 34건, 최신 08-14 06:48, 전건 분류 완료 |
| ② 6자리 코드 감지 | ✅ 정상 | `code_detected: true` |
| ③ deetz 앱 `/api/verify/instagram-dm` 호출 | ❌ **404 (미배포)** | `POST https://www.deetz.kr/api/verify/instagram-dm` → **404**. 라우트가 미머지 브랜치에만 있음 |
| ④ 코드 대조 후 승인 RPC | ❌ **배포해도 실패** | `approve_instagram_verification` 은 `is_admin()` 요구 → service_role은 `auth.uid()=null` → **`admin only` 예외** (DB에서 직접 확인) |
| ⑤ 인증 결과 DM 회신 | ❌ 꺼짐 | 워커 `DEETZ_DM_REPLY_SEND=0` |
| (참고) Meta webhook 실시간 배달 | ❌ 미구독 | `subscribed_apps` = `[]`. 다만 폴링 수집이 대신하고 있어 **치명적이지는 않다** |

실제 피해 사례가 로그에 남아 있다.

```
sender: xid2hs / "dancers.bio 본인인증 @xid2hs 코드: 838740"
intent: verification, code_detected: true, verified: false
reason: "verify_call_failed", needs_human: true
```

이 분은 코드를 정확히 보냈는데 자동 인증이 안 됐고, 회신도 못 받았다.

**추가 발견 — 가입자 인테이크도 같은 벽에 막혀 있다.**
`deetz:dancer-intake` 워커는 라이브 전환 시 `system_approve_dancers` RPC를 호출하도록 설계돼 있는데, **그 RPC가 DB에 존재하지 않는다**(현재 존재: `admin_bulk_approve_dancers`, `approve_instagram_verification` 둘뿐).
그래서 이 워커는 관찰모드에서 못 벗어난다.

즉 **"서버가 사람 대신 승인한다"는 경로 전체가 같은 원인 하나로 막혀 있다** — service_role 컨텍스트에서 `is_admin()`이 false라는 것.

## 1. 목표 흐름

```
[가입/프로필 작성]
      ↓
[승인 트리아지]  ← 이미 구현됨 (A 218 / B 362 / C 172 / REVIEW 26)
      ↓ 승인
[승인 완료 안내]  ── 알림톡(짧게) + 이메일(본체) + 앱 내 카드(상시)
      ↓
[본인인증 유도]  ── 인스타 DM 6자리 코드
      ↓ 자동 대조
[인증 완료]  → 공고 등록 권한(can_create_project) + 인증 배지
      ↓
[내 링크 SNS에 걸기]  ── dancers.bio/<slug>
```

승인과 본인인증은 **다른 것**이고, 안내문에서도 분리해야 한다.

| | 승인 | 인스타 본인인증 |
|---|---|---|
| 무엇 | 명단·검색·추천에 올라감 | 계정이 본인 것임을 확인 |
| 얻는 것 | 노출 + 캐스팅 제안 수신 | 공고 등록 권한 + 인증 표시 |
| 주체 | 관리자(트리아지) | 댄서 본인(DM) |

## 2. Part A — 승인 (남은 일: 자동 경로 통일)

트리아지 화면과 일괄 승인은 이미 만들어져 있다(`/admin/dancers/triage`).
남은 건 **사람이 아닌 서버가 승인하는 경로를 하나로 통일**하는 것이다.

### A-1. `system_approve_dancers` RPC 신설

지금 승인 경로가 세 갈래로 갈라져 있고 기준도 다르다.

| 경로 | 호출자 | 기준 | 상태 |
|---|---|---|---|
| `approveDancerAction` | 관리자 UI 1건씩 | 사람 판단 | ✅ 작동 |
| `admin_bulk_approve_dancers` | 트리아지 일괄 | 트리아지 A (사진+장르+경력≥1) | ✅ 작동 |
| `system_approve_dancers` | 인테이크 워커 | 사진 **또는** bio≥10자 **또는** 경력≥1 | ❌ **RPC 없음** |

⚠️ **워커 기준이 트리아지보다 훨씬 느슨하다.**
워커는 "사진 없어도 bio만 10자 있으면 승인"인데, 트리아지는 사진 없으면 C등급으로 막는다.
둘이 동시에 살아나면 같은 사람이 경로에 따라 다르게 처리된다.

→ **기준을 트리아지 규칙(`src/lib/scoring/triage.ts`) 하나로 통일**하고, 워커는 그 기준을 그대로 쓰게 한다.

### A-2. service_role 승인 문제의 정석 해법

`is_admin()` 가드를 약화시키지 않으면서 서버 승인을 허용하려면, **system 전용 RPC를 따로 만들어 service_role 에게만 EXECUTE** 를 준다.

```sql
create or replace function public.system_approve_dancers(p_ids uuid[], p_reason text)
returns table (updated_id uuid)
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform set_config('app.bypass_dancers_guard', 'on', true);
  return query
    update public.dancers d set approval_status='approved',
           approved_at = coalesce(d.approved_at, now())
    where d.id = any(p_ids) and d.approval_status='pending'
    returning d.id;
end $$;

revoke all on function public.system_approve_dancers(uuid[], text) from anon, authenticated;
grant execute on function public.system_approve_dancers(uuid[], text) to service_role;
```

`approve_instagram_verification` 도 동일하게 **system 변형**을 만든다.
기존 admin 전용 함수는 그대로 두고 건드리지 않는다 — 관리자 UI의 가드를 약화시키지 않기 위해서다.

## 3. Part B — 본인인증 DM (블로커 3개 제거)

### B-1. 라우트 배포 (가장 시급)

`/api/verify/instagram-dm` 이 prod에 없다.
현재 미머지 브랜치 `chore/salvage-uncommitted-20260814` 에만 있고, 운영은 404를 돌려주고 있다.

→ 이 라우트를 main 에 올려 배포한다.
→ Vercel env `DM_VERIFY_WEBHOOK_SECRET` (워커의 `DEETZ_DM_VERIFY_SECRET` 과 동일 값) + `DM_VERIFY_REVIEWER_PROFILE_ID` 설정이 함께 필요하다. 둘 중 하나라도 없으면 각각 503 / 승인 실패로 조용히 죽는다.

### B-2. 승인 RPC를 system 변형으로 교체

라우트가 배포돼도 지금 코드는 `approve_instagram_verification`(admin only)을 service-role로 호출해 **100% 실패**한다.
`system_` 변형을 만들고 라우트가 그것을 호출하게 바꾼다.

### B-3. 인증 결과 DM 회신 켜기

`DEETZ_DM_REPLY_SEND=1` 로 바꾸면 인증 결과가 DM으로 회신된다.
문구는 이미 라우트에 6종(`approved` / `already_approved` / `handle_mismatch` / `expired` / `not_found` / `ambiguous`)이 준비돼 있다.

⚠️ **이건 외부 발송이라 대표 승인 게이트다.**
다만 범위가 좁다 — 회신 대상은 "우리에게 6자리 코드를 보낸 사람"뿐이고, 문구는 고정 6종이며, LLM이 개입하지 않는다.
문의 답변 자동발송(`DEETZ_DM_AUTO_TEMPLATE`)과는 **별개 스위치**이므로 인증 회신만 먼저 켤 수 있다.

### B-4. 자동 인증의 안전장치 (이미 설계돼 있음 — 유지)

- 보낸 사람 핸들 ≠ 신청 핸들 → 자동승인 안 함 (`handle_mismatch`)
- 같은 코드로 pending 2건 이상 → 자동승인 안 함 (`ambiguous`)
- 만료 코드 → 상태만 `expired` 로 정리
- claim(남의 프로필 소유권 이전) → **자동 처리 안 하고 사람 큐로**

이 네 가지는 그대로 두는 게 맞다.

## 4. Part C — 승인 완료 안내 (핵심 요청)

### C-1. 채널별 역할 — 알림톡에 링크 유도를 넣을 수 없다

⚠️ **가장 중요한 제약**: 승인 알림톡 템플릿(`deetz_프로필승인`)은 원래 "인스타그램 프로필에 내 프로필 링크를 등록하세요" 문구를 담았다가 **카카오 검수에서 광고성으로 반려**되어 그 줄을 삭제하고서야 승인됐다.

→ **"SNS에 링크 걸어두세요"는 알림톡으로 보낼 수 없다.** 이메일과 앱 내 화면으로 보내야 한다.

| 채널 | 역할 | 담을 내용 | 상태 |
|---|---|---|---|
| **알림톡** | 도달 알림 | "승인됐습니다" + 버튼 1개 | 템플릿 승인 완료, env OFF |
| **이메일** | 본체 | 승인 후 할 수 있는 것 + 내 링크 + SNS에 거는 법 + 인증 안내 | 발송 인프라·수신거부 있음 |
| **앱 내 카드** | 상시 | 내 링크 복사·공유 버튼 | 신규 구현 |
| DM | ❌ 안 씀 | — | 정책·스팸 위험 |

메일이 본체인 이유는 분량과 링크를 자유롭게 담을 수 있는 유일한 채널이기 때문이다.

### C-2. 어떤 링크를 밀 것인가 — 하나만 민다

세 형태 모두 실제로 200을 반환하는 것을 확인했다.

| URL | 응답 | 용도 |
|---|---|---|
| `dancers.bio/<slug>` | ✅ 200 | **인스타 프로필 링크 — 이걸 민다** |
| `www.dancers.bio/<slug>` | ✅ 200 | 위와 동일 |
| `deetz.kr/d/<slug>` | ✅ 200 | 앱 내부·공유 카드용 |

**권장: 댄서에게 안내하는 대표 링크는 `dancers.bio/<slug>` 하나로 고정한다.**

- 짧고 `/d/` 같은 기술 경로가 없다
- 미들웨어가 주소창을 그대로 유지한다(리다이렉트 아님)
- 코드 주석에도 "link-in-bio 도메인"으로 명시돼 있다

두 링크를 나란히 주면 댄서가 어느 걸 써야 하나 헷갈리고, 실제로 둘 다 붙여넣는 사람이 생긴다.
메일 본문에는 `dancers.bio/<slug>` 만 크게 넣고, deetz.kr 링크는 "앱에서 보기" 버튼으로만 쓴다.

⚠️ **slug 없는 사람이 꽤 된다 — 발송 전 반드시 채워야 한다.**

- 이미 승인·활성인 259명 중 **23명이 slug 없음**
- 승인 대기 중에도 **102명이 slug 없음**

slug가 없으면 링크가 `dancers.bio/<uuid>` 형태가 되는데, 이건 인스타 프로필에 걸라고 줄 수 있는 주소가 아니다.
slug 자동 생성 로직은 이미 있으므로(활동명 → 소문자·하이픈, 중복 시 `-2`), 발송 대상에 대해 한 번 돌려주면 된다.

### C-3. 메일 콘텐츠 — 실제 코드로 확인된 것만 쓴다

과장하면 신뢰를 잃는다. 아래는 전부 코드에서 확인한 실제 효과다.

**① 승인되면 이렇게 됩니다**
- deetz 댄서 목록과 검색에 노출됩니다
- 구글 등 검색엔진에 프로필이 등록됩니다
- 조건에 맞는 새 공고가 올라오면 알림을 받습니다
- 캐스팅 담당자의 추천 후보에 포함됩니다
- 캐스팅 제안을 직접 받을 수 있습니다 *(미승인 상태에서는 제안 발송이 차단됩니다)*

**② 내 프로필 링크**
- `dancers.bio/<slug>` — 크게, 복사 버튼과 함께
- 인스타그램 프로필 → 프로필 편집 → 웹사이트 칸에 붙여넣기 (3줄 가이드)
- 링크를 걸어두면 좋은 이유: 프로필 하나로 경력·영상·연락 경로가 정리돼 전달된다

**③ 아직 안 하신 것 (조건부 노출)**
- 프로필 완성도가 낮으면 비어 있는 항목 최대 3개만
- 인스타 본인인증 미완료면 → 인증하면 공고를 직접 등록할 수 있다는 안내

### C-4. 발송 설계

- **트리거**: 승인 시점 이벤트 기반. 일괄 승인분은 배치로.
- **속도 제한**: 시간당 50통 이하로 나눠 보낸다. 169통을 한 번에 쏘면 스팸 처리 위험이 실재한다.
- **멱등**: `(dancer_id, 'approval_welcome')` 유니크로 재발송 차단. 기존 `career-reminder` 가 쓰는 패턴 그대로.
- **수신거부 존중**: 원클릭 수신거부가 이미 라이브다 — 반드시 태운다.
- **소급 발송 여부**: 이미 승인된 288명에게도 보낼지는 **대표 결정 필요**. 보낸다면 문구를 "승인되었습니다"가 아니라 "프로필 링크를 안내드립니다"로 바꿔야 한다(몇 달 전 승인된 사람에게 지금 승인 통지를 보내면 이상하다).

## 5. 실행 순서

| # | 작업 | 상태 | 비고 |
|---|---|---|---|
| 1 | system RPC 2종 SQL 작성 | 🟡 파일 완료 / **DB 적용 막힘** | `db/migrations/20260814_002_system_approval_rpcs.sql`. MCP 적용이 권한 게이트에 차단됨 |
| 2 | `/api/verify/instagram-dm` 머지·배포 + env 2종 | ⬜ | **PR #112**(DM 자동화 세션 소유)에 있음. 해당 세션에 공유 완료 |
| 3 | 라우트가 system RPC 호출하도록 수정 | ⬜ | 한 줄 교체. PR #112 소유자와 조율 중 |
| 4 | slug 채우기 (승인자 23명 + 대기자 102명) | ⬜ | 발송 전 선행 |
| 5 | 승인 완료 메일 템플릿 + 배치 발송기 | ✅ **완료** | `src/lib/notify/approval-welcome-mail.ts` + `scripts/send-approval-welcome.mjs` |
| 6 | 앱 내 "내 프로필 링크" 카드 | 🟡 컴포넌트 완료 / 배선 대기 | `src/components/portfolio/ProfileLinkCard.tsx` |
| 7 | A등급 169명 일괄 승인 실행 | ⬜ | 화면 준비됨 |
| 8 | 승인 메일 발송 (배치) | ⬜ | 대표 승인 완료, 실행만 남음 |
| 9 | `DEETZ_DM_REPLY_SEND=1` | ⬜ | 대표 승인 완료. 단 2·3 선행 필요 |
| 10 | 인테이크 워커 기준을 트리아지로 통일 후 라이브 | ⬜ | 1번 RPC 선행 |
| 11 | (선택) 승인 알림톡 ON | ⬜ | 켜면 대량 발송 |

### 메일 발송 한도 방어 (실장착)

과거 두 번 터진 이력이 있어 스크립트에 그대로 반영했다.

| 사고 | 원인 | 대응 |
|---|---|---|
| `454-4.7.0 Too many login attempts` (2026-08-05) | 메일마다 SMTP 로그인 | **pool 연결 + `maxConnections=1`** |
| `550-5.4.5 Daily user sending limit` (2026-08-06, 누적 510통) | 계정 일일 한도 | `--limit` 로 회차 분할 + **한도 에러 감지 시 즉시 전체 중단** |

- 재개는 `career_reminder_log(stage='approval_welcome', status='sent')` 기준 멱등 — 같은 명령을 다시 실행하면 남은 대상만 이어서 보낸다.
- 실패 행은 `status='failed'` 로 남고 **재시도를 막지 않는다**.
- 기본은 dry-run. 실제 발송은 `--send --confirm-send=APPROVAL_WELCOME` 둘 다 있을 때만.
- 발신 계정은 `contact@deetz.kr`(Google Workspace). 08-05·06 사고는 구 개인 Gmail 계정 때였으므로 한도가 더 높을 수 있으나 **검증된 바 없어 보수적으로 나눠 보낸다.**
- 대량 메일 HTML에 **Supabase Storage 이미지를 넣지 않았다** — 2026-08-06 egress quota 초과로 메일 이미지가 깨진 이력 때문에 로고는 Vercel 정적자산, SNS는 텍스트 링크로 했다.

**현재 발송 대상(dry-run 실측)**: 승인 + slug + 계정 보유 = **194명**.
(승인 288명 중 slug 또는 계정이 없어 제외되는 인원이 있다 — 4번 slug 채우기를 하면 늘어난다.)

## 6. 대표 결정 (2026-08-14 확정)

1. ✅ 대표 링크는 `dancers.bio/<slug>` **우선**, `deetz.kr/d/<slug>` 도 사용 가능.
2. ✅ 기승인자 **소급 발송 승인**. 단 메일 한도·SMTP/IMAP 인증 한도를 넘기지 않게 분할 발송.
3. ✅ **인증 회신 DM 켜기 승인** — 인입 패턴이 동일해 자동화 가능하다는 판단.
4. 승인 알림톡 ON 여부는 미정(메일 우선).

## 7. 저장소 작업 시 주의 — 세션 간 공유 작업 트리

`dev/dancers-bio` 한 개의 작업 트리를 여러 세션이 동시에 쓰고 있다.
이 작업 중에도 브랜치가 `chore/salvage-uncommitted-20260814` → `feat/legal-pages` → `fix/deetz-mail-handle` 로 세 번 바뀌었다.

- **새 파일(untracked)은 살아남는다** — 브랜치를 바꿔도 그대로 있다.
- **기존 파일 수정은 날아간다** — 브랜치 전환 때 워킹 트리가 되감기면서 사라진다(이번에 실제로 두 번 유실).

그래서 이 작업의 산출물은 전부 **새 파일**로 만들었고, 기존 파일 배선(2건)은 보류했다.
여러 세션이 같은 레포를 계속 다룰 거라면 **세션별 git worktree 분리**가 필요하다.

---

관련: `QUALITY_PLAN.md` · [[reference_deetz_dm_patterns]] · [[reference_deetz_alimtalk]] · [[reference_deetz_notification_prefs]] · [[reference_deetz_canonical]]
