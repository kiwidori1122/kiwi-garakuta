@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || goto nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)" || goto nonode
if not exist node_modules\wrangler call npm install --no-audit --no-fund
node scripts\demo.mjs
pause
exit /b
:nonode
echo Node.js 22.12 以上が必要です。開いたページから「LTS」をインストールして、もう一度実行してください。
start https://nodejs.org/ja
pause
