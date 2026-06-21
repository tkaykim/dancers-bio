# Email Operations Runbook

## 원칙

- 한글이 들어간 운영 메일은 PowerShell 인라인 스크립트로 발송하지 않는다.
- 모든 운영 메일은 UTF-8로 저장된 `.mjs` 파일에서만 발송한다.
- deetz 운영 메일은 `scripts/lib/deetz-mail-layout.mjs`의 공통 카드 레이아웃을 사용한다.
- 발송 전 `assertKoreanMailSafe` 가드를 통과해야 한다. `???` 또는 Unicode replacement character가 있으면 발송하지 않는다.
- 대량 발송은 반드시 `--dry-run`으로 대상 수와 성비/상태를 확인한 뒤 `--send --confirm=...`으로 실행한다.

## NDOL 6/18 오디션 메일

대상 기준:

- A 현장공지: `accepted` 또는 `pending` 중 6/18 16:00-21:00 가능 확정자
- B 긴급확인: `accepted` 중 6/18 16:00-21:00 가능 여부 미제출자
- 제외: 16:00-21:00 불가, 해당 시간 전체를 못 채우는 `partial`, `do_not_contact`

명령:

```powershell
node scripts\send-ndol-guidance-mails.mjs --dry-run
```

현재 NDOL 실제 발송 경로는 5층/3층 위치 문구 오류 이후 잠겨 있다.
향후 재발송이 필요하면 본문 리뷰, 렌더링 확인, 대표자 승인 후에만 잠금을 해제한다.

공유 메일:

```powershell
node scripts\send-ndol-summary-notice.mjs
```

공유 메일도 기본값은 dry-run이다. 실제 발송은 별도 승인 후 `--send`를 붙인다.

## 사고 방지 체크

- `node --check scripts\<file>.mjs`
- `node scripts\send-ndol-guidance-mails.mjs --dry-run`
- 메일 본문을 새로 만들 때는 `scripts/lib/deetz-mail-layout.mjs`를 재사용한다.
- 한글 본문을 터미널 heredoc 또는 `node -e`에 직접 넣지 않는다.
