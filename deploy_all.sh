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
npm run check

if [[ -n "$(git status --short)" ]]; then
  commit_message="$app_version ${1:-Release}"
  git add --all
  git commit -m "$commit_message"
fi

npx wrangler pages deploy dist --project-name xy-poker
git push origin main

echo "Deployment complete: $app_version"
echo "Cloudflare: https://xy-poker.pages.dev"
echo "Render: https://xy-poker.onrender.com"
