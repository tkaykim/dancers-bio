# Meta 앱 검수 신청 패키지 — deetz (앱 ID 2551076955342267)

신청 대상 권한: **`instagram_business_manage_messages`** (고급 액세스)
이용 사례: Instagram에서 메시지 및 콘텐츠 관리
작성일: 2026-08-14

---

## 0. 현재 상태

| 항목 | 상태 |
|---|---|
| 앱 게시 | ✅ 게시됨(2026-08-14) |
| 개인정보처리방침 | ✅ https://deetz.kr/privacy |
| 데이터 삭제 안내 | ✅ https://deetz.kr/data-deletion |
| 앱 도메인 | ✅ deetz.kr |
| 계정 연결 | ✅ @deetz.kr (BUSINESS), 메시지 액세스 승인됨 |
| `instagram_business_manage_messages` | 🟡 표준 액세스 → **고급 액세스 신청 대상** |
| 서비스 약관 URL | ⚠️ `https://www.facebook.com/` 플레이스홀더 — 약관 페이지 작성 후 교체 필요 |

---

## 1. 권한이 필요한 이유 (제출 양식용 · 한국어)

dee'tz는 (주)그리고엔터테인먼트가 운영하는 댄서 캐스팅 플랫폼입니다.
공식 Instagram 계정 @deetz.kr 은 댄서 지원 문의, 해외 댄서의 프로그램 참가 문의, 프로덕션·브랜드의 섭외 제안을 받는 주요 창구입니다.

현재는 담당자가 Instagram 앱을 직접 열어 수동으로 확인하고 있어 문의가 누락됩니다.
실제로 2026년 8월 6일 접수된 뮤직비디오 안무팀 섭외 문의(6인, 촬영 8월 12일)를 확인하지 못해 회신하지 못했고, 클라이언트와 댄서 모두 기회를 잃었습니다.

`instagram_business_manage_messages` 고급 액세스를 받으면, 계정으로 수신되는 메시지를 자체 운영 도구에 적재하여 미응대 문의를 추적하고 담당자가 순서대로 응대할 수 있습니다.
자주 반복되는 단순 안내(프로그램 참가 방법 안내)에 한해 사전에 검토된 고정 문구로 즉시 회신하며, 그 외 모든 문의는 담당자가 직접 답변합니다.

## 1-EN. Why we need this permission (English version)

dee'tz is a dancer casting platform operated by GRIGO Entertainment Co., Ltd.
Our official Instagram account @deetz.kr is a primary intake channel for dancer applications, program inquiries from international dancers, and casting requests from production companies and brands.

Today our team checks these messages manually inside the Instagram app, and inquiries get missed.
On 6 August 2026 a production company asked us to source six choreographers for a music video shoot on 12 August. We never saw the message in time and failed to reply, which cost both the client and our dancers an opportunity.

With advanced access to `instagram_business_manage_messages`, incoming messages are stored in our internal operations tool so that no inquiry is lost and our staff can respond in order.
For one specific, high-volume request — international dancers asking how to apply to our program — we reply automatically with a pre-approved fixed message that links to our application page. Every other message is answered by a human.

---

## 2. 데이터 사용 설명

- 처리 항목: 발신자 식별자(IGSID), 계정명, 메시지 본문, 수신 시각
- 보관 위치: 자체 운영 데이터베이스(Supabase, 서비스 롤 접근 제한)
- 보관 기간: 수신일로부터 3년
- 이용 목적: 문의 응대와 응대 이력 관리
- 광고·마케팅 이용 없음, 제3자 판매·공유 없음
- 삭제 요청: https://deetz.kr/data-deletion 안내에 따라 처리
- 관련 고지: https://deetz.kr/privacy 3항 「Instagram 메시지 처리에 관한 안내」

## 3. 자동 응답 범위와 안전장치 (심사 시 강조할 부분)

메시지 자동 발송은 다음 조건을 **모두** 만족할 때만 실행됩니다.

1. 분류 결과가 `program`(프로그램 참가 방법 문의)일 것
2. 메시지 언어가 영어이고, 한글이 한 글자도 포함되지 않을 것
3. 해당 대화에서 우리가 한 번도 답한 적이 없는 첫 문의일 것
4. 금액·계약·일정 확정·섭외·결과·환불·개인정보 관련 표현이 없을 것
5. 하루 자동 발송 상한 이내일 것

발송 문구는 사전에 검토된 고정 텍스트 1종이며, 생성형 모델이 만든 문장을 그대로 외부로 보내지 않습니다.
조건을 하나라도 충족하지 못하면 자동 발송하지 않고 담당자 검토 대기 상태로 남습니다.

---

## 4. 심사용 시연(스크린캐스트) 시나리오

Meta는 권한이 실제로 어떻게 쓰이는지 보여주는 화면 녹화를 요구합니다.
아래 순서로 촬영하면 됩니다.

1. https://deetz.kr 접속 → 서비스가 무엇인지 보여준다 (10초)
2. 다른 Instagram 계정에서 @deetz.kr 로 영어 문의 DM 을 보낸다
   예: `Hi! I'm a dancer from Georgia. Can I ask how to apply to your program?`
3. 운영 도구 화면에서 해당 메시지가 목록에 들어온 것을 보여준다
4. 자동 회신이 발송되는 것과, 발신 계정에서 그 답장을 받는 화면을 보여준다
5. 한국어로 금액이 포함된 문의(예: `안녕하세요, 섭외 문의드립니다. 페이는 40만원 예정입니다.`)를 보낸다
6. 이 메시지는 자동 발송되지 않고 담당자 검토 대기로 남는 것을 보여준다 (안전장치 시연)

⚠️ 이 영상은 사람이 직접 녹화해야 합니다 — 실제 두 개의 Instagram 계정과 화면 녹화가 필요합니다.

## 5. 심사용 테스트 안내 문구

```
Test instructions:
1. Send a DM in English to @deetz.kr, e.g. "Hi! How can I apply to your dancer program?"
2. You will receive an automatic reply containing our application link within about 15 seconds.
3. Send a DM in Korean that mentions a fee. No automatic reply will be sent — the message is
   queued for a human operator, which demonstrates our safety filter.
```

---

## 6. 제출 전 남은 작업

- [ ] 서비스 약관 페이지 작성 후 앱 설정의 서비스 약관 URL 교체 (현재 facebook.com 플레이스홀더)
- [ ] 자동 응답 게이트 실가동 (`DEETZ_DM_AUTO_TEMPLATE=1`) — 시연 영상에 자동 회신이 나와야 하므로 촬영 전 켠다
- [ ] 스크린캐스트 녹화 (위 4항 시나리오)
- [ ] 비즈니스 인증 상태 확인 (Meta 비즈니스 관리자)
