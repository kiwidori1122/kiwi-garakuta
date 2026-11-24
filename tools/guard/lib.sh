#!/bin/sh
# kiwi-garakuta の名前漏れ防止チェック（共通部分）
# 許可するメールアドレス以外のコミットと、「出してはいけない言葉」を含む変更を止める。
# 出してはいけない言葉の一覧はリポジトリに入れない（公開されるため）。次のどれかから読む:
#   1. 環境変数 KIWI_GUARD_DENY_FILE が指すファイル
#   2. ~/.kiwi-guard/deny.txt（各PCで tools/setup-pc.bat が作る）
#   3. 環境変数 KIWI_GUARD_DENY（カンマか改行区切り。GitHub Actions やクラウドのAI環境用）

KIWI_NAME="kiwidori"
KIWI_EMAIL="360543408+kiwidori1122@users.noreply.github.com"
# 自分のコミットとして許可するのは KIWI_EMAIL だけ。下は GitHub やボットが作るコミット用
KIWI_OTHER_EMAILS="49699333+dependabot[bot]@users.noreply.github.com
41898282+github-actions[bot]@users.noreply.github.com
noreply@github.com"

guard_fail() {
  echo "" >&2
  echo "✖ kiwi-guard: $*" >&2
  echo "  （名前が出ないようにするためのチェックです。tools/guard/README.md を見てください）" >&2
  exit 1
}

# 出してはいけない言葉の一覧を、空行・CRを除いた一時ファイルにして、そのパスを出力する
guard_deny_file() {
  out="$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/kiwi-guard-$$")"
  src=""
  if [ -n "${KIWI_GUARD_DENY_FILE:-}" ] && [ -f "$KIWI_GUARD_DENY_FILE" ]; then src="$KIWI_GUARD_DENY_FILE"
  elif [ -f "$HOME/.kiwi-guard/deny.txt" ]; then src="$HOME/.kiwi-guard/deny.txt"
  elif [ -n "${USERPROFILE:-}" ] && [ -f "$USERPROFILE/.kiwi-guard/deny.txt" ]; then src="$USERPROFILE/.kiwi-guard/deny.txt"
  fi
  if [ -n "$src" ]; then cat "$src" > "$out"
  elif [ -n "${KIWI_GUARD_DENY:-}" ]; then printf '%s\n' "$KIWI_GUARD_DENY" | tr ',' '\n' > "$out"
  else rm -f "$out"; return 1
  fi
  # CR・前後の空白・空行・#で始まる行を取り除く
  tr -d '\r' < "$out" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' -e '/^#/d' > "$out.clean"
  mv "$out.clean" "$out"
  [ -s "$out" ] || { rm -f "$out"; return 1; }
  echo "$out"
}

# 標準入力に出してはいけない言葉が含まれていたら 0 を返す（大文字小文字は区別しない）
# 一覧の行の先頭に = を付けた言葉は、単語としてそのまま出てきたときだけ一致にする
# （例: =taro は「taro」「Taro」には一致し、「Kintaro」には一致しない）
guard_has_denied() {
  _in="$1.in"; _sub="$1.sub"; _word="$1.word"
  cat > "$_in"
  grep -v '^=' "$1" > "$_sub"
  sed -n 's/^=//p' "$1" | sed '/^$/d' > "$_word"
  _r=1
  if [ -s "$_sub" ] && LC_ALL=C grep -a -i -F -q -f "$_sub" "$_in"; then _r=0
  elif [ -s "$_word" ] && LC_ALL=C grep -a -i -w -F -q -f "$_word" "$_in"; then _r=0
  fi
  rm -f "$_in" "$_sub" "$_word"
  return $_r
}

guard_email_allowed() {
  [ "$1" = "$KIWI_EMAIL" ] && return 0
  printf '%s\n' "$KIWI_OTHER_EMAILS" | grep -F -x -q -- "$1"
}
