#!/bin/sh
# このリポジトリの git 設定を、名前が出ない状態にそろえる（何回実行してもよい）
# AI のクラウド環境でも、最初にこれを実行する（Claude Code は .claude/settings.json で自動実行）
. "$(dirname "$0")/lib.sh"
cd "$(git rev-parse --show-toplevel)" || exit 1
git config --local user.name "$KIWI_NAME"
git config --local user.email "$KIWI_EMAIL"
git config --local user.useConfigOnly true
git config --local core.hooksPath .githooks
git config --local core.autocrlf false
chmod +x .githooks/* tools/guard/*.sh 2>/dev/null || true
echo "kiwi-guard: git の名義を $KIWI_NAME <$KIWI_EMAIL> に、フックを .githooks に設定しました"
