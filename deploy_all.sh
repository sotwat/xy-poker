#!/bin/bash

# Ensure script halts on error
set -e

echo "🚀 Starting Dual Deployment (Cloudflare & Render)..."

# 0. 自動でバージョン番号を現在時刻（MMDDhhmm）に更新
VERSION="v$(date '+%m%d%H%M')"
echo "📌 Version: $VERSION"
sed -i '' "s/v[0-9]\{8\}/$VERSION/g" src/App.tsx
echo "✅ Version updated to $VERSION in src/App.tsx"

# 1. 未コミットの変更をコミット（バージョン更新含む）
if [[ -n $(git status -s) ]]; then
    echo "⚠️  Uncommitted changes found."

    # 引数 $1 をコミットメッセージとして使用。なければ自動生成
    if [ -n "$1" ]; then
        commit_msg="$VERSION $1"
    else
        commit_msg="$VERSION Deploy"
    fi

    git add .
    git commit -m "$commit_msg"
    echo "✅ Changes committed: $commit_msg"
else
    echo "ℹ️  No uncommitted changes. Proceeding with existing state."
fi

# 2. Cloudflare Pages へデプロイ（Direct Upload）
echo "-----------------------------------"
echo "👉 Deploying to Cloudflare Pages..."
echo "-----------------------------------"
npm run build
npx wrangler pages deploy dist --project-name xy-poker

# 3. Render へデプロイ（Git Push）
echo "-----------------------------------"
echo "👉 Deploying to Render (Triggering Git Push)..."
echo "-----------------------------------"
git push origin main

echo "-----------------------------------"
echo "✅ DUAL DEPLOYMENT COMPLETE! [$VERSION]"
echo "Cloudflare: https://xy-poker.pages.dev (Instant)"
echo "Render:     https://xy-poker.onrender.com (Wait ~2 mins)"
echo "-----------------------------------"
