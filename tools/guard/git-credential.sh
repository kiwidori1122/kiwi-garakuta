#!/bin/sh
exec sh "$(git rev-parse --show-toplevel)/tools/guard/gh.sh" auth git-credential "$@"
