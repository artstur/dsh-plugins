#!/bin/sh
# Stage, commit (when something changed) and push this plugin repo.
#
#   sh scripts/sync.sh "commit message"
#
# With no message it uses a timestamped chore message. Exits non-zero only when
# the push fails; a clean tree is not an error.
set -e
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  git add -A
  if [ -n "$1" ]; then
    git commit -q -m "$1"
  else
    git commit -q -m "chore: sync $(date '+%Y-%m-%d %H:%M')"
  fi
fi

branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo '')
if [ "$branch" != "main" ]; then
  echo "on branch '$branch', not pushing (main only)" >&2
  exit 1
fi

git push origin main
