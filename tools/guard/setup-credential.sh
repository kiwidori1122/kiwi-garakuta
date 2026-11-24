#!/bin/sh
# このリポジトリだけ、kiwidori1122 専用の gh ログインで GitHub に接続するよう設定する
# （PCに保存されているほかのアカウントのログインは使わない・変えない）
#   KIWI_GH_EXE=gh.exe のパス  KIWI_GH_CONFIG_DIR=kiwidori1122 用の gh 設定フォルダー
[ -n "${KIWI_GH_EXE:-}" ] && [ -n "${KIWI_GH_CONFIG_DIR:-}" ] || { echo "KIWI_GH_EXE と KIWI_GH_CONFIG_DIR を指定してください" >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)" || exit 1
git config --local --unset-all credential.helper 2>/dev/null
git config --local --add credential.helper ""
git config --local kiwiGuard.ghPath "$KIWI_GH_EXE"
git config --local kiwiGuard.ghConfigDir "$KIWI_GH_CONFIG_DIR"
git config --local --add credential.helper "!sh tools/guard/git-credential.sh"
echo "kiwi-guard: GitHub への接続を kiwidori1122 専用のログインに設定しました"
