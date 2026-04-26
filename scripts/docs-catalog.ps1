param(
  [string]$Config = ".documentation-governor.json"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$configPath = if ([System.IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $repoRoot $Config }
$scriptPath = Join-Path $PSScriptRoot "docs-governor.mjs"

& node $scriptPath write-catalog --config $configPath
exit $LASTEXITCODE
