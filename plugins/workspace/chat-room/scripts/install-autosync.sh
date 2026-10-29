#!/bin/sh
# Install a post-commit hook so every local commit is pushed to GitHub.
# Remove it with: rm .git/hooks/post-commit
set -e
cd "$(dirname "$0")/.."
mkdir -p .git/hooks
cat > .git/hooks/post-commit <<'HOOK'
#!/bin/sh
# Auto-sync installed by scripts/install-autosync.sh — pushes main after every
# commit. Network failures are ignored so a commit is never blocked.
branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo '')
[ "$branch" = "main" ] || exit 0
git push origin main >/dev/null 2>&1 || true
HOOK
chmod +x .git/hooks/post-commit
echo "installed .git/hooks/post-commit"
