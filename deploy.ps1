# Deploy Madrasa Reports to GitHub Pages
# Run:  powershell -ExecutionPolicy Bypass -File deploy.ps1
# (GitHub will prompt for credentials once — or ask opencode for the token.)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path "$repo\.git")) {
  git init $repo | Out-Null
  git -C $repo -c user.name="Dawn" -c user.email="dawn@local" add -A
  git -C $repo -c user.name="Dawn" -c user.email="dawn@local" commit -m "Madrasa Reports sample v1"
}

$remotes = git -C $repo remote
if ($remotes -notmatch 'origin') {
  git -C $repo remote add origin https://github.com/dawnuser/madrasa-reports.git
}

git -C $repo branch -M main
git -C $repo push -u origin main

Write-Host ""
Write-Host "Pushed. Enable Pages: GitHub > repo > Settings > Pages > Source: main / (root)"
Write-Host "App will be live at: https://dawnuser.github.io/madrasa-reports/"
