# kiwi-garakuta を更新するPCの初期設定（PCごとに1回。何回実行してもよい）
#  1. Git と GitHub CLI(gh) を確認し、kiwidori1122 でログイン（このPCのほかの gh ログインとは別に保存）
#  2. リポジトリを clone（古い履歴の clone があれば、使わないよう名前を変えてよける）
#  3. このリポジトリだけの git 設定（名義・チェック用フック・GitHub への接続）
#  4. 「出してはいけない言葉」の一覧を作る（%USERPROFILE%\.kiwi-guard\deny.txt。公開しない）
#  5. 全履歴を検査して動作確認
param([string]$RepoDir = "")
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if (-not $RepoDir) { $RepoDir = Join-Path $env:USERPROFILE "kiwi-garakuta" }
$Owner = "kiwidori1122"; $Repo = "kiwi-garakuta"; $Url = "https://github.com/$Owner/$Repo.git"
$RootCommit = "3a045a6a281437a8633612dfe29b998334f59fc7"
$GuardDir = Join-Path $env:USERPROFILE ".kiwi-guard"
$GhDir = Join-Path $GuardDir "gh"
$Deny = Join-Path $GuardDir "deny.txt"
function Step($t) { Write-Host ""; Write-Host "━━ $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "✅ $t" -ForegroundColor Green }
function Fail($t) { throw $t }

try {
  Step "1/5 Git と GitHub CLI"
  $git = (Get-Command git -ErrorAction SilentlyContinue).Source
  if (-not $git) { Fail "Git が見つかりません。https://git-scm.com/download/win から入れて、もう一度実行してください" }
  $gitRoot = Split-Path (Split-Path $git -Parent) -Parent
  $sh = @((Join-Path $gitRoot "bin\sh.exe"), (Join-Path $gitRoot "usr\bin\sh.exe")) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $sh) { Fail "Git の sh.exe が見つかりません（Git for Windows を入れ直してください）" }
  $gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
  if (-not $gh -and (Test-Path "$env:ProgramFiles\GitHub CLI\gh.exe")) { $gh = "$env:ProgramFiles\GitHub CLI\gh.exe" }
  if (-not $gh) {
    Write-Host "GitHub CLI を入れます..."
    winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
    if (Test-Path "$env:ProgramFiles\GitHub CLI\gh.exe") { $gh = "$env:ProgramFiles\GitHub CLI\gh.exe" } else { Fail "GitHub CLI を入れたら、このウィンドウを閉じてもう一度実行してください" }
  }
  New-Item -ItemType Directory -Force -Path $GhDir | Out-Null
  $env:GH_CONFIG_DIR = $GhDir
  $o = $ErrorActionPreference; $ErrorActionPreference = "Continue"; & $gh auth status -h github.com 2>&1 | Out-Null; $code = $LASTEXITCODE; $ErrorActionPreference = $o
  if ($code -ne 0) {
    Write-Host "ブラウザで GitHub にログインします。必ず $Owner のアカウントで許可してください"
    Write-Host "途中で「Authenticate Git with your GitHub credentials?」と聞かれたら n を押してください（このPCのほかの設定を変えないため）"
    & $gh auth login -h github.com -p https -w -s "repo,workflow"
  }
  $me = (& $gh api user --jq .login)
  if ($me -ne $Owner) { Fail "GitHub CLI が $me でログインしています。黒い画面で「set GH_CONFIG_DIR=$GhDir」→「gh auth logout」をしてから、もう一度実行してください" }
  Ok "GitHub CLI: $me（このPCのほかの gh ログインとは別に保存しています）"

  Step "2/5 リポジトリ：$RepoDir"
  if (Test-Path $RepoDir) {
    $o = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $root = (& git -C $RepoDir rev-list --max-parents=0 HEAD 2>$null | Select-Object -Last 1)
    $ErrorActionPreference = $o
    if ($root -ne $RootCommit) {
      $old = "$RepoDir.old-" + (Get-Date -Format "yyyyMMdd-HHmm")
      Rename-Item -Path $RepoDir -NewName (Split-Path $old -Leaf)
      Write-Host "⚠ 古い履歴の clone だったので「$old」に名前を変えました。中に名前入りの履歴があるので、使わずに消してください" -ForegroundColor Yellow
    }
  }
  if (-not (Test-Path $RepoDir)) {
    & git -c core.autocrlf=false clone $Url $RepoDir
    if ($LASTEXITCODE -ne 0) { Fail "clone に失敗しました" }
  }
  Ok "リポジトリの準備ができました"

  Step "3/5 このリポジトリだけの git 設定"
  Push-Location $RepoDir
  & $sh "tools/guard/setup-local.sh"
  if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "setup-local.sh が失敗しました" }
  $env:KIWI_GH_EXE = ($gh -replace '\\', '/')
  $env:KIWI_GH_CONFIG_DIR = ($GhDir -replace '\\', '/')
  & $sh "tools/guard/setup-credential.sh"
  if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "setup-credential.sh が失敗しました" }
  & git fetch -q origin
  if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "GitHub に接続できませんでした" }
  Pop-Location
  Ok "名義・チェック用フック・GitHub への接続を設定しました"

  Step "4/5 「出してはいけない言葉」の一覧：$Deny"
  if (-not (Test-Path $Deny)) {
    Write-Host "公開リポジトリに絶対に入れたくない言葉を、カンマ区切りで入力してください"
    Write-Host "（例：本名の名字・名前のローマ字と漢字、会社名、会社メールの@より前、PCのユーザー名、昔のアカウント名、昔のメールアドレス）"
    $words = @((Read-Host "言葉") -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($words.Count -lt 1) { Fail "1つ以上入力してください" }
    [IO.File]::WriteAllText($Deny, (($words -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
  }
  $count = @(Get-Content -Encoding UTF8 $Deny | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') }).Count
  Ok "$count 個の言葉を見張ります（追加・修正はメモ帳で $Deny を開いて、1行に1つ）"

  Step "5/5 動作確認（全履歴を検査）"
  Push-Location $RepoDir
  & $sh "tools/guard/check-range.sh" "origin/main"
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "検査で問題が見つかりました。この画面をAIに見せて相談してください" }
  Write-Host ""
  Ok "完了しました。$RepoDir を ChatGPT（Codex）や Claude（Claude Code）で開いて作業してください"
  Write-Host "  AI は AGENTS.md のルールを読みます。コミットと push の前には自動でチェックが走ります"
} catch {
  Write-Host ""; Write-Host "❌ $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host "Enterで閉じます"
