# deetz 비자 상담 Calendar + Meet 자동화

## 운영 흐름

1. 지원자는 `/visa/case/[token]`에서 자신의 IANA 시간대와 가능한 시간 3개를 제출한다.
2. 운영자는 `/admin/visa` 상세에서 후보 시간을 KST로 비교하고 하나를 선택한다.
3. 운영자는 30분, 45분, 60분 중 미팅 길이와 확정 메일 언어를 선택한다.
4. `Calendar 겹침 확인`을 눌러 선택한 날짜의 `contact@deetz.kr` 일정을 보고, 선택 구간과 겹치는 일정을 확인한다.
5. 겹치는 일정이 있거나 Calendar 조회가 실패하면 메일 미리보기와 최종 확정을 막는다.
6. 메일 미리보기에는 아직 생성되지 않은 Meet 링크 대신 자동 생성 안내가 표시된다.
7. 최종 확인 직전에 서버가 Calendar를 다시 조회하고, 충돌이 없을 때만 지원자를 참석자로 포함한 이벤트와 Meet 링크를 만든다.
8. Google Calendar 초대와 deetz 브랜드 확정 메일이 지원자에게 각각 발송된다.

## 서버 환경변수

- `DEETZ_GOOGLE_CLIENT_ID`
- `DEETZ_GOOGLE_CLIENT_SECRET`
- `DEETZ_GOOGLE_REFRESH_TOKEN`
- `DEETZ_GOOGLE_CALENDAR_ID` 기본값 `contact@deetz.kr`

OAuth 범위에는 `https://www.googleapis.com/auth/calendar`가 포함되어야 한다.

Refresh token은 브라우저나 저장소에 넣지 않고 Vercel 서버 환경변수로만 관리한다.

## 멱등성과 부분 실패 복구

- 브라우저가 생성한 `request_id`를 DB와 Google event ID에 함께 사용한다.
- 같은 확정 요청을 다시 실행하면 새 이벤트를 만들지 않고 기존 이벤트를 조회한다.
- Calendar 생성 후 Meet 링크가 지연되면 같은 이력에서 링크 생성을 다시 확인한다.
- Calendar와 Meet 생성 후 SMTP만 실패하면 이력의 `확정 메일 재발송`으로 메일만 다시 보낸다.
- 메일 Message-ID는 invite ID를 기준으로 고정해 재시도 중복 가능성을 낮춘다.
- Calendar 상태와 deetz 메일 상태는 각각 `calendar_status`와 `status`로 분리한다.

## 알림 정책

Calendar API는 `sendUpdates=all`을 사용한다.

지원자는 Google Calendar 참석자 초대 한 통과 deetz 브랜드 확정 메일 한 통을 받는다.

이 방식은 지원자 Calendar에 실제 일정이 동기화되면서 기존 deetz 메일 열람·클릭 추적을 유지한다.

## 검증

```bash
npm run typecheck
npx eslint "src/app/(app)/admin/visa/page.tsx" src/app/actions/visa-meeting.ts src/components/admin/VisaAdminList.tsx src/components/admin/VisaMeetingInvitePanel.tsx src/lib/gmail.ts src/lib/google-calendar/visa-meeting.ts src/lib/notify/visa-meeting-invite-mail.ts src/lib/visa/consultation-slots.ts --max-warnings=0
npm run build
```

실제 지원자에게 테스트 초대나 메일을 보내지 않는다.

운영 E2E는 내부 테스트 신청 건을 만든 뒤 Calendar 이벤트, Meet 링크, Google 초대, deetz 확정 메일, 클릭 추적을 순서대로 확인한다.

2026-08-12 운영 E2E에서는 Gmail plus alias를 쓴 테스트 신청 건으로 후보 3개 제출, 충돌 없음 확인, 2단계 확정, Calendar 이벤트와 Meet 생성, Google 초대와 deetz 메일 수신, CTA 클릭 추적까지 통과했다.

생성 후 같은 구간을 다시 조회했을 때 기존 테스트 이벤트가 `겹치는 일정 1건`으로 표시되고 확정 버튼이 비활성화되는 것도 확인했다.
