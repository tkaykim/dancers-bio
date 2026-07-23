# deetz 비자 프로그램 추가 질문지 메일 운영 문서

## 목적

이미 `/program` 또는 `/visa/apply`로 최초 지원을 제출한 사람에게 개인 케이스 링크를 다시 안내한다.

메일은 지원자가 제출한 `preferred_lang`에 따라 영어, 일본어, 한국어 중 하나로 생성한다.

메일에서는 금액을 바로 오픈하지 않는다.

실제 발송 전에는 항상 dry-run으로 HTML, text, CSV, manifest를 먼저 확인한다.

## 기존 발송 방식

deetz 앱의 표준 메일 발송은 `src/lib/gmail.ts`의 `sendGmailEmail`을 기준으로 한다.

발신 표기명은 코드에서 `deetz 에이전시 & 매거진`으로 고정한다.

발신 계정은 `GMAIL_USER`와 `GMAIL_APP_PASSWORD`를 사용하는 Gmail SMTP다.

기존 신청자 접수 확인 메일은 `src/lib/notify/visa-applicant-confirmation-mail.ts`에서 3개국어로 발송한다.

일괄 운영 메일 스크립트는 `scripts/send-*.mjs` 패턴처럼 기본 dry-run, 명시적 `--send`에서만 발송한다.

## 대상자 기준

기본 대상은 `dancer_visa_applications.source = 'program'`인 신청자다.

이미 추가 질문지를 제출한 `follow_up_submitted_at is not null` 신청자는 기본 발송 대상에서 제외한다.

`status`가 `rejected` 또는 `on_hold`인 신청자도 기본 발송 대상에서 제외한다.

개인 링크는 `makeVisaCaseToken`과 같은 HMAC 방식으로 생성한 `/visa/case/{token}` 링크를 사용한다.

## 메일에 들어가는 핵심 문구

온라인 미팅은 `Zoom 또는 Google Meet`으로 표현한다.

지원자가 온라인 미팅 가능한 날짜와 시간을 3개 입력하도록 안내한다.

지원 항목은 댄스 트레이닝, 주거, 한국어 언어, 입국·교통을 확인한다고 설명한다.

그리고엔터테인먼트는 약 7년 동안 한국에서 댄스 매니지먼트, 에이전시, 안무 제작, 행사 제작 등을 해온 회사라고 소개한다.

소속 아티스트들과 댄서 네트워크를 기반으로 해외 댄서의 한국 활동 다음 단계를 안내한다고 설명한다.

메일 CTA는 `추가정보 + 화상 미팅 일정 제출하기`를 한국어 기준 문구로 사용한다.

캐스팅, 유급 일거리, 비자 발급은 보장하지 않는다고 명시한다.

문의사항은 이 메일에 바로 답장하라고 안내한다.

## 금지 문구

`Zoom 상담`처럼 특정 도구만 상담명으로 쓰지 않는다.

`합정`, `신촌`, `8월 1회`, `9월 1회`처럼 확정되지 않은 장소와 일정을 쓰지 않는다.

`은행·휴대폰`은 현재 신청자 선택지에서 제외된 과거 항목이므로 신규 메일에 쓰지 않는다.

메일에서는 `예상 단가`, `400만원`, `400万ウォン`, `₩4,000,000` 등 금액 표현을 쓰지 않는다.

비용을 확정가처럼 쓰지 않는다.

비자 발급과 캐스팅을 약속하지 않는다.

## dry-run 생성

아래 명령은 실제 발송 없이 후보자별 HTML, text, CSV, manifest를 생성한다.

```powershell
node scripts\prepare-visa-case-followup-mails.mjs
```

기본 출력 위치는 `C:\Users\tkay\Documents\Codex\2026-07-23\deetz\outputs\visa-followup-mails\<batch>`다.

`manifest.json`에는 대상자, 언어, 제목, 개인 링크, 미리보기 파일 경로가 들어간다.

`recipients.csv`는 사람이 최종 확인하기 위한 발송 대상 목록이다.

각 신청자별 `.html`과 `.txt` 파일은 실제 메일 본문 미리보기다.

## 실제 발송

실제 발송은 사용자의 명시 승인 후에만 실행한다.

발송 명령은 아래처럼 확인 플래그를 함께 넣어야 한다.

```powershell
node scripts\prepare-visa-case-followup-mails.mjs --send --confirm-send=VISA_CASE_FOLLOWUP
```

발송 결과는 같은 batch 폴더의 `send-results.json`에 저장한다.

성공한 발송은 `outputs\visa-followup-mails\sent-log.jsonl`에 기록한다.

기록된 신청자는 중복 발송 방지를 위해 다음 실행에서 기본 제외된다.

정말 다시 보내야 할 때만 `--force`를 쓴다.

## 2026-07-23 dry-run 결과

대상자는 9명이다.

언어 분포는 영어 4명, 일본어 4명, 한국어 1명이다.

생성된 batch 폴더는 `C:\Users\tkay\Documents\Codex\2026-07-23\deetz\outputs\visa-followup-mails\2026-07-23T09-22-13-363Z`다.

실제 발송은 하지 않았다.
