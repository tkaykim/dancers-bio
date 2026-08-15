@echo off
REM 릴스 챌린지 — 신규 지원자 자동 수락 + 가이드라인 메일 발송.
REM Windows 작업 스케줄러가 30분마다 호출한다.
REM
REM 멱등: 이미 보낸 사람은 project_notification_log 기준으로 자동으로 건너뛴다.
REM 정원(200명)을 넘으면 수락하지 않는다.
REM Gmail 한도에 걸리면 즉시 중단하고, 다음 회차에 남은 대상만 이어서 보낸다.

cd /d "C:\Users\tkay\Desktop\dev\dancers-bio"

for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set TODAY=%%a-%%b-%%c
set LOGDIR=C:\Users\tkay\Desktop\dev\dancers-bio\scripts\out
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo. >> "%LOGDIR%\challenge-autopilot.log"
echo ===== %DATE% %TIME% ===== >> "%LOGDIR%\challenge-autopilot.log"

node scripts\send-challenge-guideline.mjs --accept --send --confirm-send=CHALLENGE_GUIDELINE >> "%LOGDIR%\challenge-autopilot.log" 2>&1

exit /b 0
