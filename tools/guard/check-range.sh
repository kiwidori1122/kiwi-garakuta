#!/bin/sh
# 指定した範囲のコミットをまとめて検査する（pre-push と GitHub Actions から使う。手動でも可）
#   sh tools/guard/check-range.sh <git rev-list の引数...>
#   例: sh tools/guard/check-range.sh HEAD          … 全履歴
#       sh tools/guard/check-range.sh origin/main..HEAD
set -u
. "$(dirname "$0")/lib.sh"
[ $# -gt 0 ] || set -- HEAD
deny="$(guard_deny_file)" || deny=""
if [ -z "$deny" ]; then
  if [ "${KIWI_GUARD_ALLOW_NO_DENY:-}" = "1" ]; then echo "⚠ kiwi-guard: 出してはいけない言葉の一覧がないので、名義だけ検査します" >&2
  else guard_fail "出してはいけない言葉の一覧がありません。tools/setup-pc.bat を実行してください"; fi
fi
bad=0; n=0
for c in $(git rev-list "$@"); do
  n=$((n+1))
  ae="$(git log -1 --format=%ae "$c")"; ce="$(git log -1 --format=%ce "$c")"
  if ! guard_email_allowed "$ae" || ! guard_email_allowed "$ce"; then
    echo "✖ $(git log -1 --format='%h %s' "$c")：許可されていない名義のコミットです" >&2; bad=1; continue
  fi
  if [ -n "$deny" ]; then
    if git log -1 --format='%an%n%cn%n%B' "$c" | guard_has_denied "$deny"; then
      echo "✖ $(git log -1 --format='%h' "$c")：名義かコミットメッセージに、出してはいけない言葉があります" >&2; bad=1; continue
    fi
    if git show --format= --no-color --unified=0 --text "$c" | grep -a '^+' | guard_has_denied "$deny"; then
      echo "✖ $(git log -1 --format='%h %s' "$c")：変更の中に、出してはいけない言葉があります" >&2; bad=1; continue
    fi
  fi
done
[ -n "$deny" ] && rm -f "$deny"
[ "$bad" = 0 ] || guard_fail "上のコミットは公開できません。push せずに直してください"
echo "✔ kiwi-guard: ${n} 件のコミットを検査しました（問題なし）"
