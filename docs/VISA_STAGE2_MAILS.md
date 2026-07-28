# deetz 비자 프로그램 2단계 운영 메일 (2026-07-28 배치)

## 목적

2026-07-23 추가 질문지 메일 이후의 후속 상태를 세 갈래로 나눠 안내한다.

이미 질문지를 제출하고 일정이 확정된 지원자에게는 온라인 미팅 확정 안내를 보낸다.

제출한 희망 일정이 모두 지나간 지원자에게는 일정 재조율 안내를 보낸다.

아직 질문지를 제출하지 않은 지원자에게는 진행 희망 여부를 확인하고, 진행하지 않는 경우 사유 설문으로 연결한다.

## 메일 세트

| 세트 | 대상 | CTA |
|---|---|---|
| `confirm` | 스크립트 상단 `CONFIRMED_MEETINGS`에 등록된 지원자 | 확정 일시·미팅 링크 안내 + 미팅 링크 열기 |
| `reschedule` | 질문지 제출 완료 + 제출한 후보 일정이 모두 24시간 이내이거나 이미 지난 경우 | 케이스 링크에서 후보 일정 3개 재제출 |
| `revive` | 질문지 미제출 | 계속 진행(케이스 링크) / 진행하지 않음(사유 설문 `?decline=1`) 2버튼 |

## 자동 제외 기준

한국 국적(`dancer_private_info.is_korean_national = true`) 지원자는 비자 대상이 아니므로 제외한다.

`memo`에 `E2E TEST`가 들어간 테스트 행은 제외한다.

내부 도메인(`grigoent.co.kr`, `astcompany.co.kr`)과 시험발송 주소는 제외한다.

이미 진행하지 않겠다고 응답한(`declined_at is not null`) 지원자는 제외한다.

같은 이메일로 여러 건 신청했고 다른 행에서 이미 질문지를 제출한 경우, 미제출 행은 중복으로 제외한다.

제출한 후보 일정 중 24시간 이후의 일정이 남아 있으면 `reschedule` 대상이 아니라 운영자 확정 대기로 분류해 제외한다.

## 진행하지 않음 사유 설문

`/visa/case/{token}?decline=1`으로 들어오면 케이스 포털에서 사유 선택 화면이 바로 열린다.

사유는 다른 에이전시·경로, 비용 부담, 일정 불가, 결정 보류, 기타(직접 입력) 5가지다.

제출하면 `dancer_visa_applications`의 `declined_at`, `decline_reason`, `decline_reason_detail`에 저장되고 `status=on_hold`, `case_stage=on_hold`가 된다.

지원자는 같은 화면에서 언제든 다시 진행을 선택할 수 있고, 이 경우 세 컬럼이 다시 비워진다.

관리자는 `/admin/visa` 목록과 상세에서 진행 안 함 사유를 확인한다.

마이그레이션은 `db/migrations/20260728_001_visa_case_decline.sql`이다.

## 추적

추적 캠페인 값은 `visa_case_stage2_20260728`이다.

CTA는 `/api/track/visa-case/click`을 거치며 `k` 값으로 어떤 버튼인지 구분한다.

`email_cta_continue`, `email_cta_reschedule`, `email_cta_decline` 세 가지 키를 쓴다.

케이스 포털에서는 `decline_open`, `decline_submit_success`, `resume_after_decline` 이벤트를 추가로 남긴다.

`confirm` 세트의 CTA는 미팅 링크로 바로 연결되므로 클릭 추적 대신 오픈 픽셀만 사용한다.

## 금지 문구

기존 정본(`docs/VISA_CASE_FOLLOWUP_MAILS.md`)의 금지 문구를 그대로 유지한다.

메일에서는 금액을 쓰지 않는다.

`Zoom 상담`이라는 서비스명 대신 `온라인 미팅 (Zoom 또는 Google Meet)`으로 쓴다.

확정되지 않은 장소와 오디션 일정은 쓰지 않는다.

비자 발급과 캐스팅을 약속하지 않는다.

## 실행

dry-run은 아래 명령으로 후보자별 HTML, text, CSV, manifest를 만든다.

```powershell
node scripts\prepare-visa-stage2-mails.mjs
```

특정 세트만 만들려면 `--set=confirm`처럼 지정한다.

시험발송(대표 확인용)은 실제 지원자 대신 내부 주소로만 3개 언어를 보낸다.

```powershell
node scripts\prepare-visa-stage2-mails.mjs --test --send --confirm-send=VISA_STAGE2
```

실제 발송은 대표 승인 후에만 실행한다.

```powershell
node scripts\prepare-visa-stage2-mails.mjs --send --confirm-send=VISA_STAGE2
```

발송 결과는 batch 폴더의 `send-results.json`에 남고, 성공분은 `sent-log.jsonl`과 `visa_case_tracking_events`에 기록된다.

기록된 세트·지원자·언어 조합은 다음 실행에서 자동 제외되며, 다시 보내야 할 때만 `--force`를 쓴다.

시험발송(`--test`)은 `sent-log.jsonl`과 추적 테이블에 기록하지 않는다.
