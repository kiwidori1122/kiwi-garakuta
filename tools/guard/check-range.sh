#!/bin/sh
exec sh "$(git rev-parse --show-toplevel)/tools/guard/run.sh" range "$@"
