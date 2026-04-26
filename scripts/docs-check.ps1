param(
  [string]$Config = ".documentation-governor.json",
  [string]$BaseRef = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Get-Location).Path
$configPath = if ([System.IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $repoRoot $Config }
$scriptPath = Join-Path $PSScriptRoot "docs-governor.mjs"
$filesPath = Join-Path $repoRoot ".tmp-doc-governor-files.txt"

$tracked = @(git -C $repoRoot diff --name-only --diff-filter=ACMR)
$staged = @(git -C $repoRoot diff --cached --name-only --diff-filter=ACMR)
$untracked = @(git -C $repoRoot ls-files --others --exclude-standard)
$changedFiles = @($tracked + $staged + $untracked) | Where-Object { $_ } | Sort-Object -Unique

Set-Content -LiteralPath $filesPath -Value $changedFiles

try {
  $args = @($scriptPath, "check", "--config", $configPath, "--files-file", $filesPath)
  if ($BaseRef) {
    $args += @("--base-ref", $BaseRef)
  }
  & node $args
  exit $LASTEXITCODE
}
finally {
  if (Test-Path $filesPath) {
    Remove-Item -LiteralPath $filesPath -Force
  }
}
