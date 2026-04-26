param(
  [string]$Config = ".documentation-governor.json",
  [string]$Note = "Documentation refresh recorded."
)

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$configPath = if ([System.IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $repoRoot $Config }
$scriptPath = Join-Path $PSScriptRoot "docs-governor.mjs"
$head = (git -C $repoRoot rev-parse HEAD).Trim()
$dirty = if ((git -C $repoRoot status --porcelain).Trim()) { "true" } else { "false" }

& node $scriptPath write-stamp --config $configPath --head $head --dirty $dirty --note $Note
exit $LASTEXITCODE
