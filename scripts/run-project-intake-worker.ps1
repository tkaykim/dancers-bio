$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'project-intake-scheduled.cjs')
exit $LASTEXITCODE
