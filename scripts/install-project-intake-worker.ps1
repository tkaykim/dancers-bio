param([switch]$Enable)
$ErrorActionPreference = 'Stop'
$intakeRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$intakeNode = (Get-Command node.exe).Source
$intakeRunner = Join-Path $PSScriptRoot 'project-intake-scheduled.cjs'
$intakeEnv = Join-Path $intakeRepo '.env.local'
if (-not $Enable) {
  Write-Output 'No changes made. After release approval, run this script with -Enable to install and enable DeetzProjectIntake.'
  exit 0
}
& $intakeNode ('--env-file=' + $intakeEnv) (Join-Path $PSScriptRoot 'project-intake-worker.mjs') '--check'
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed. Scheduling was not changed.' }
& $intakeNode $intakeRunner '--register'
if ($LASTEXITCODE -ne 0) { throw 'Automation registration failed.' }
$intakeShell = (Get-Command powershell.exe).Source
$intakeLauncher = Join-Path $PSScriptRoot 'run-project-intake-worker.ps1'
$intakeAction = New-ScheduledTaskAction -Execute $intakeShell -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $intakeLauncher + '"') -WorkingDirectory $intakeRepo
$intakeTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$intakeSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$intakePrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'DeetzProjectIntake' -Action $intakeAction -Trigger $intakeTrigger -Settings $intakeSettings -Principal $intakePrincipal -Force | Out-Null
Disable-ScheduledTask -TaskName 'DeetzProjectIntake' | Out-Null
& $intakeNode $intakeRunner '--register' '--enable'
if ($LASTEXITCODE -ne 0) { throw 'Automation enable failed. The task remains disabled.' }
Enable-ScheduledTask -TaskName 'DeetzProjectIntake' | Out-Null
Write-Output 'DeetzProjectIntake enabled. Requires this Windows user to be logged in.'
