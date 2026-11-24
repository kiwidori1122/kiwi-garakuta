#!/bin/sh
set -eu
exe=${KIWI_GH_EXE:-$(git config --local --get kiwiGuard.ghPath || true)}
config=${KIWI_GH_CONFIG_DIR:-$(git config --local --get kiwiGuard.ghConfigDir || true)}
[ -n "$exe" ] || exe=$(command -v gh || true)
[ -n "$config" ] || config="$HOME/.kiwi-guard/gh"
export GH_CONFIG_DIR="$config"
if [ -z "$exe" ] || [ "$("$exe" api user --jq .login 2>/dev/null)" != "kiwidori1122" ]; then
  echo 'kiwi-guard: dedicated GitHub account is not ready; operation blocked.' >&2
  exit 1
fi
exec "$exe" "$@"
