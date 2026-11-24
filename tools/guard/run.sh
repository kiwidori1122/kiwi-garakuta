#!/bin/sh
set -eu
root=$(git rev-parse --show-toplevel)
if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
  exec python3 "$root/tools/guard/guard.py" "$@"
elif command -v python >/dev/null 2>&1 && python -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
  exec python "$root/tools/guard/guard.py" "$@"
elif command -v py >/dev/null 2>&1 && py -3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
  exec py -3 "$root/tools/guard/guard.py" "$@"
fi
printf '%s\n' 'kiwi-guard: Python 3.10 or later is required. Commit/push blocked.' >&2
exit 1
