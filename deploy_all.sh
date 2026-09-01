#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Deployment must run from main; current branch is ${branch:-detached}." >&2
  exit 1
fi

app_version="$(sed -nE 's/.*(v[0-9]{8}).*/\1/p' src/App.tsx | head -n 1)"
readme_version="$(sed -nE 's/.*Current Version:.*`([0-9]{8})`.*/v\1/p' README.md | head -n 1)"
if [[ -z "$app_version" || "$app_version" != "$readme_version" ]]; then
  echo "App and README versions must match before deployment." >&2
  exit 1
fi

git diff --check

if command -v npm >/dev/null 2>&1; then
  npm run check
elif command -v node >/dev/null 2>&1; then
  node_modules/.bin/eslint .
  node --import tsx --test src/logic/*.test.ts server/*.test.js
  node_modules/.bin/tsc -b
  node_modules/.bin/vite build
else
  echo "Node.js 20.19 or newer is required for deployment." >&2
  exit 1
fi

if [[ -n "$(git status --short)" ]]; then
  commit_message="$app_version ${1:-Release}"
  git add --all
  git commit -m "$commit_message"
fi

if command -v npx >/dev/null 2>&1; then
  npx wrangler pages deploy dist --project-name xy-poker
elif [[ -x node_modules/.bin/wrangler ]]; then
  node_modules/.bin/wrangler pages deploy dist --project-name xy-poker
else
  echo "Wrangler 4.x is required for Cloudflare Pages deployment." >&2
  exit 1
fi
git push origin main

echo "Deployment complete: $app_version"
echo "Cloudflare: https://xy-poker.pages.dev"
echo "Render: https://xy-poker.onrender.com"
