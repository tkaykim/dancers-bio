# Growth Engine — 구현 마스터 플랜

> **이 문서는 무엇인가:** 양면 성장 플라이휠(공급=댄서 프로필 자동수집·전환, 수요=프로젝트 자동수집·중개)의
> **단일 진실 소스(SSOT)**. 긴 멀티세션 빌드 동안 컨텍스트가 요약/초기화돼도 여기서 위치를 복구한다.
> 전략 배경: `~/.claude/plans/growth-flywheel-two-sided-seeding.md` · 진행 로그: [LOG.md](./LOG.md)

## 🧭 세션 시작 시 읽는 법 (future-me 전용)

1. 이 PLAN.md 전체 1회 정독 → "로드맵" 표의 상태(⬜/🚧/✅)로 현재 위치 파악.
2. [LOG.md](./LOG.md) 마지막 3개 엔트리 → 직전에 뭘 했고 다음이 뭔지 확인.
3. 프로젝트 메모리(`memory/growth-strategy.md`, `memory/growth-engine-build.md`) 확인.
4. 작업 끝나면 **반드시 LOG.md에 한 엔트리 추가** + 이 문서 로드맵 상태 갱신.

---

## 1. 확정된 전략 결정 (변경 금지 — 바꾸려면 명시적 합의)

| # | 결정 | 구현 함의 |
|---|---|---|
| D1 | **스코어 완전 비공개** | `career_scores`/`dancer_scores`는 server-only. 정렬 근거·경력별 점수화 사실을 **어떤 UI/API에도 노출 금지**. (인지 시 경력 부풀리기 편법) |
| D2 | **동의 = 하이브리드 공개 디폴트** | 예명·장르·공개경력·공개사진은 claim 전 공개. **이메일·연락처는 항상 마스킹(관리자만).** 모든 미claim 프로필에 "내려주세요" 1클릭 옵트아웃(=PIPA 삭제권). |
| D3 | **아웃리치 = Apify수집 → 정리 → 이메일+IG DM** | 저볼륨·개인화. IG DM은 API 없음 → 반자동(문구생성+사람발송). |
| D4 | **수요 = founder-as-demand + 상시풀** | 대표 본업이 실수요. 부족분은 "상시 섭외풀"(진실·탈락없음)로. **"가짜 특정공고+전원탈락" 기각.** |
| D5 | **컨시어지 인력 보유** | 직접 중개·현장출동 가능 → 첫 실거래를 사람이 생성. |

**유일 병목 = 공급(댄서 claim 전환).** 수요 콜드스타트는 D4로 해소됨.

---

## ⚠️ 절대 잊지 말 것 — 마이그레이션 파일 ≠ 라이브 DB
`db/migrations/*.sql`는 **라이브 스키마와 갈라져 있다** (예: 파일엔 `applications_applicant_xor`, 라이브엔 `applications_dancer_team_xor`). 스키마/제약/RLS/트리거/enum을 건드리기 전 **반드시 `mcp__supabase-dancersbio__execute_sql`로 라이브를 직접 조회**하고, 변경은 `apply_migration`으로. 파일만 보고 판단 금지.

## 2. 기존 자산 (재사용 — 새로 만들지 말 것)

| 자산 | 위치 | 비고 |
|---|---|---|
| `applications` (apply+direct_proposal 통합) | `db/migrations/20260511_*` | `source`, `status`, `dancer_id`, `applicant_id XOR team_id` CHECK |
| `dancers` (claim/auto-claim/IG인증) | `src/app/actions/{claim,verification}.ts` | `profile_id` NULL=미claim, `social_links{source_email,instagram}` |
| **프로젝트 인제스트 파이프라인** | `src/app/actions/ingestions.ts` + `project_ingestions` 테이블 | LLM 파싱(Gemini/Anthropic)·중복탐지·발행·병합·기각 + `/admin/projects/import` UI **완성됨** |
| pro-proximity 스코어 | `src/lib/scoring/*` + `career_scores`/`dancer_scores` | 디렉토리 정렬 RPC `list_directory_dancers` |
| PDF 경력 파싱 | `src/app/actions/portfolio-ai.ts` | LLM 추출 패턴 재활용 가능 |
| Gmail 발송 | `src/lib/gmail.ts` | 아웃리치 이메일에 재활용 |
| LLM 추상화 | `src/lib/llm/*` | provider 전환·schema 파싱. 경력 추출에 재활용 |

> **핵심 재사용 패턴:** 댄서 수집도 `project_ingestions`의 `draft→published/merged/dismissed` 상태머신을 **그대로 복제**한다 → `dancer_ingestions`.

---

## 3. 아키텍처 — 두 파이프라인

### 공급 파이프라인 (IG 크롤 → 프로필 → 아웃리치) — 3단계 큐

```
[A. 발견 풀]  팔로우그래프에서 핸들 + 싼 신호(팔로워수·72명과의 맞팔수·bio키워드) 대량 수집 (싸다, 거대)
     │  dedup = IG numeric user_id (핸들 X), 기존 dancers·기존후보와 매칭
     ▼
[B. 스크랩 큐]  A를 자동랭킹 → "며칠에 정밀스크랩" 배정. 관리자가 보고 순서/날짜 수정. 하루 N개 throttle
     │  Apify 정밀 actor (프로필+포스트+캡션)
     ▼
[C. 검수 게이트]  정밀스크랩 → LLM 경력추출(미검증 플래그) → 프로필 자동생성 → 관리자 승인 → dancers 행 생성
     │  (dancers 행 생성 시 스코어/공개페이지 자동)
     ▼
[아웃리치]  이메일(gmail.ts) / IG DM(반자동) 발송 + 추적(조회·claim 전환)
     ▼
[claim]  댄서가 claim → 대기 중이던 proposal 연결 → 실유저 전환
```

### 수요 파이프라인 (프로젝트 자동수집)

```
[크롤러]  댄서채용 정보 흩어진 소스(IG계정/해시태그·카페·오디션사이트·크루모집)
     │  Apify actor (스케줄) → 신규글 감지
     ▼
[webhook]  /api/ingest/project (외부 webhook용 /api/* 허용) → createIngestionAction 로직
     ▼
[project_ingestions]  draft  ← (이하 전부 기존 UI/액션 재사용)
     ▼
[관리자 검토]  /admin/projects/import → 발행/병합/기각 → projects 행 → 중개
```

**상시 섭외풀(B0):** 마감없는 "풀 모집" 프로젝트 타입. 지원자는 탈락이 아니라 풀에 적재 → 실건 발생 시 direct_proposal.

---

## 4. 로드맵 (상태: ⬜ 대기 · 🚧 진행 · ✅ 완료)

### Phase 0 — 기반 (선결과제)
- ⬜ **알림 인프라 점검·구축** — 현재 버그메일만. `notification_type` enum/테이블 실재 확인 후, proposal수신·claim상태·아웃리치 이벤트용 알림 레이어 정비. (Phase 1·2의 전제)
- ⬜ 중복탐지 trigram RPC 보강 (`ingestions.ts:185` 코드에 이미 TODO. 자동수집 켜면 필수)

### Phase 1 — 플라이휠 점화: 미claim proposal → claim 후크  ★최우선
> ✅ **Q1 해소(2026-05-31, 라이브 스키마 검증):** 라이브 제약은 `applications_dancer_team_xor` = `dancer_id XOR team_id` (마이그파일의 applicant_id XOR 아님). `applicant_id` 자유 NULL. **미claim 댄서 제안 = `dancer_id`만 채운 applications 행 → 스키마 변경 0.** RLS INSERT(direct_proposal)=`owns_project AND dancer_id NOT NULL`(profile_id 불요). SELECT/UPDATE=`can_act_as_dancer(dancer_id)`=`owns_dancer OR manages_dancer` → claim 시 접근 **자동 이전**(applicant_id back-fill 불필요). applications 트리거엔 알림생성 없음+`prevent_self`는 profile NULL 댄서 안전통과 → insert 안전. unique=`(project_id,dancer_id)` pending/accepted.
> ⚠️ **direct_proposal 전체가 "Lite MVP"에서 의도적 OFF:** `/proposals`=`notFound()`, 모든 `canPropose=false`. Phase 1 = 이 흐름을 미claim 트위스트 포함해 **복원**.
- ✅ `sendDirectProposalAction`: `dancer_id` 직접 타깃(미claim 포함). profile_id 요구 제거. `src/app/actions/proposals.ts`
- ✅ `sendProposalSchema`(dancer_id XOR team_id)/`SendProposalDialog`(target.dancer_id).
- ✅ `/d/[slug]` 제안 열기: `canPropose`=로그인+can_create_project/admin+비owner. dancer_id 타깃. + 미claim 대기 제안 배너(RPC).
- ✅ `respondToProposalAction`: dancer 소유자(owns/manages) 인가, 레거시 applicant 경로 유지. source/status 가드.
- ✅ `/proposals` 복원: 받은 제안 목록(dancer/team/applicant) + 수락·거절(`RespondProposalButtons`).
- ✅ 알림 배선: `src/lib/notify` (admin client로 notifications insert + 웹푸시). send→received(claim된 댄서만), respond→accepted/declined(프로젝트 소유자). best-effort.
- ✅ RPC `dancer_pending_proposal_count` (migration `20260531_001`). DB 트랜잭션 검증 통과(applicant_id NULL insert OK, count=1).
- ⬜ (후속·낮은 우선순위) 미claim 프로필 "내려주세요" 옵트아웃 (D2). 대표 판단(2026-05-31): 옵트아웃 가능성 낮고 DM/이메일 등으로도 대응 가능 → 급하지 않음(필요 없다는 뜻은 아님). 이메일은 현재 페이지에 미렌더라 마스킹 이미 충족. Phase 2 대량생성 운영 전까지 처리하면 됨.
- 🔎 검증 남음: 라이브 UI 스모크(제안 보내기 → claim → /proposals 응답), 알림 실발송(VAPID/SERVICE_ROLE 키 환경). 코드/타입/빌드/DB제약은 통과.

### Phase 2 — 공급 인제스트 (IG 크롤)  ✅ 구현 완료 + Apify 실연결(2026-05-31)
- ✅ Apify 실연결: `apify-client` + `instagram-profile/post/hashtag-scraper`. `APIFY_TOKEN`(tkay_kim, FREE) 유효 확인. 발견은 **해시태그 기반**(`discoverViaHashtag`/`discoverDancersByHashtagAction` + admin "해시태그로 발견" 폼). `INGEST_WEBHOOK_SECRET` 생성·연결.
- ✅ `ig_discovery`(발견 풀) 테이블 + dedup(ig_user_id unique) + 자동랭킹(rank_score).
- ✅ `dancer_scrape_queue` + 관리자 화면 `/admin/dancers/discovery`(순서·날짜 수정, stats "발견X/스크랩Y/대기Z").
- ✅ `dancer_ingestions`(draft→approved/dismissed) + 검수 UI `/admin/dancers/ingestions`(미검증 배지).
- ✅ 분류 필터(`classifyDancerCandidate` bio키워드+mutuals) + 경력추출(`extractDancerProfileFromScrape`, `unverified` 플래그). LLM 고도화·나무위키는 TODO.
- ✅ 승인 시 `dancers`+`careers` 자동 생성(admin client). 
- ✅ `dancer_outreach` + `/admin/dancers/outreach`(이메일=gmail.ts, IG DM 반자동, 토큰 추적).
- ✅ `/api/ingest/dancer` webhook(`INGEST_WEBHOOK_SECRET`).
- ⬜ 실가동 대기: APIFY_TOKEN/APIFY_IG_ACTOR(크롤·스크랩), 하루 N개 throttle 운영값, cron(Apify→webhook), 나무위키 보강, LLM 경력추출 고도화.

### Phase 3 — 수요 인제스트 + 상시풀  ✅ 구현 완료(2026-05-31)
- ✅ `/api/ingest/project` webhook → `parseProjectWithFallback` + `project_ingestions` draft(기존 검토 UI 재사용). `INGEST_WEBHOOK_SECRET` 필요.
- ⬜ 프로젝트 크롤러(Apify actor, 소스 목록) — 외부 크롤러는 미연결(webhook 수신부는 준비됨).
- ✅ 상시 섭외풀(B0): `projects.is_standing_pool`, 마감 강제 null, 만료필터 제외(`isExpired` 헬퍼), "상시 모집" 배지, 폼 토글.

### Phase 4 — 매칭  ✅ 구현 완료(2026-05-31)
- ✅ `match_dancers_for_project(p_id,_limit)` RPC: score(내부정렬, **미반환**) + genre/location 부스트, 소유자/admin 가드, 기제안·본인댄서 제외.
- ✅ `/projects/[id]/applicants` "추천 댄서" 섹션 + 원클릭 제안(`RecommendedDancers.tsx`).
- ✅ 미claim 고매칭 댄서 제안 = Phase 1 후크와 연결 → 플라이휠 닫힘.

---

## 5. 데이터 모델 스케치 (Phase 진입 시 구체화)

- `ig_discovery`: `id, ig_user_id (unique), ig_handle, display_name, follower_count, mutuals_with_seed int, bio_text, bio_keyword_hit bool, rank_score numeric, status('discovered'|'queued'|'scraped'|'dismissed'), discovered_at`
- `dancer_scrape_queue`: `id, ig_discovery_id fk, scheduled_date date, priority int, status('queued'|'scraping'|'done'|'failed'), attempts int, scraped_at`
- `dancer_ingestions`: `id, ig_user_id, raw_scrape jsonb, parsed_profile jsonb, parsed_careers jsonb (unverified), status('draft'|'approved'|'dismissed'), created_dancer_id fk, decided_at` (= `project_ingestions` 미러)
- `dancer_outreach`: `id, dancer_id fk, channel('email'|'ig_dm'), status('queued'|'sent'|'opened'|'claimed'|'bounced'), message_text, sent_at, opened_at, claimed_at, token (추적용)`
- 기존 `applications`: Phase 1 설계결정에 따라 제약 조정 가능성.

---

## 6. 리스크 / 가드레일 (협상 불가)

- 🇰🇷 **PIPA** — 대량 자동생성 프로필이므로 "내려주세요" 옵트아웃 + 연락처 마스킹이 **필수 선제**. 옵트아웃 요청률을 지표로 모니터.
- **IG ToS / 밴** — Apify 크롤·팔로우그래프는 ToS 위반. managed proxy·저볼륨·소스계정 분리. IG DM 매스발송 금지(반자동).
- **미검증 경력 공개** — LLM 추출 경력을 동의 전 공개 시 오정보 리스크 → `unverified` 플래그 + 보수적 추출 + claim 시 수정.
- **나무위키** — CC BY-NC-SA·유저편집 → 정본 아님, 교차참조·출처표기.
- **가짜 특정공고 금지** (D4) — 모든 프로젝트는 진짜 결과(승자/풀등록)로 이어져야.

---

## 7. 지표 (북극성: 주간 신규 claim)
공급: 발견→스크랩→프로필→아웃리치→claim 퍼널 전환율 / 옵트아웃 요청률(건강도).
수요: 신규 프로젝트(실/상시풀/어그리게이션 분리), proposal 응답률.
톱니: **미claim proposal → claim 전환율** (플라이휠 작동의 단일 증거).

---

## 8. 열린 질문 (결정되면 해당 Phase로 이동)
- ~~Q1. Phase 1 proposal 저장 방식~~ ✅ **해소** — 라이브 스키마가 `dancer_id XOR team_id`라 변경 불필요(Phase 1 박스 참조).
- Q2. Apify 스케줄 위치 — Apify actor→webhook push(권장) vs 앱 cron이 Apify호출.
- Q3. 하루 스크랩 N = ? (Apify 예산 + IG 밴 임계 기준).
- Q4. 경력추출 깊이 — IG캡션만 vs +나무위키 +유튜브크레딧.
