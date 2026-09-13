param([switch]$Enable)
$ErrorActionPreference = 'Stop'
if (-not $Enable) { Write-Output 'After release approval, use -Enable to register DeetzPortfolioImport.'; exit 0 }
$portfolioRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$portfolioNode = (Get-Command node.exe).Source
$portfolioRunner = Join-Path $PSScriptRoot 'portfolio-import-scheduled.cjs'
$portfolioHidden = Join-Path $env:USERPROFILE 'Desktop\tkay_personal\tools\hidden-automation'
if (-not (Test-Path -LiteralPath (Join-Path $portfolioHidden 'hidden-launch.vbs'))) { throw 'Hidden automation launcher missing.' }
if (Get-ScheduledTask -TaskName 'DeetzPortfolioImport' -ErrorAction SilentlyContinue) { throw 'Task already exists; inspect before changing its installation.' }
& $portfolioNode ('--env-file=' + (Join-Path $portfolioRepo '.env.local')) (Join-Path $PSScriptRoot 'portfolio-import-worker.mjs') '--check'
if ($LASTEXITCODE -ne 0) { throw 'Portfolio preflight failed.' }
& $portfolioNode $portfolioRunner '--register'
if ($LASTEXITCODE -ne 0) { throw 'Hub registration failed.' }
@{execute=$portfolioNode;arguments=('"' + $portfolioRunner + '"');workingDirectory=$portfolioRepo} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $portfolioHidden 'tasks\DeetzPortfolioImport.json') -Encoding UTF8
$portfolioAction = New-ScheduledTaskAction -Execute ($env:SystemRoot + '\System32\wscript.exe') -Argument ('//B //Nologo "' + $portfolioHidden + '\hidden-launch.vbs" "DeetzPortfolioImport"') -WorkingDirectory $portfolioHidden
$portfolioTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$portfolioSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$portfolioPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'DeetzPortfolioImport' -Action $portfolioAction -Trigger $portfolioTrigger -Settings $portfolioSettings -Principal $portfolioPrincipal | Out-Null
Disable-ScheduledTask -TaskName 'DeetzPortfolioImport' | Out-Null
& $portfolioNode $portfolioRunner '--register' '--enable'
if ($LASTEXITCODE -ne 0) { throw 'Hub enable failed; Windows task remains disabled.' }
Enable-ScheduledTask -TaskName 'DeetzPortfolioImport' | Out-Null
Start-ScheduledTask -TaskName 'DeetzPortfolioImport'
Write-Output 'DeetzPortfolioImport enabled: hidden execution every minute while this Windows user is logged in.'
