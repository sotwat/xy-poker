#!/bin/bash

# Ensure script halts on error
set -e

echo "🚀 Starting Dual Deployment (Cloudflare & Render)..."

# 1. Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "⚠️  Uncommitted changes found."
    read -p "Enter commit message to proceed (or Ctrl+C to cancel): " commit_msg
    if [ -z "$commit_msg" ]; then
        echo "❌ Error: Commit message required."
        exit 1
    fi
    git add .
    git commit -m "$commit_msg"
    echo "✅ Changes committed."
else
    echo "ℹ️  No uncommitted changes. Proceeding with existing state."
fi

# 2. Deploy to Cloudflare Pages (Direct Upload)
echo "-----------------------------------"
echo "👉 Deploying to Cloudflare Pages..."
echo "-----------------------------------"
npm run build
npx wrangler pages deploy dist --project-name xy-poker

# 3. Deploy to Render (via Git Push)
echo "-----------------------------------"
echo "👉 Deploying to Render (Triggering Git Push)..."
echo "-----------------------------------"
git push origin main

echo "-----------------------------------"
echo "✅ DUAL DEPLOYMENT COMPLETE!"
echo "Cloudflare: https://xy-poker.pages.dev (Instant)"
echo "Render:     https://xy-poker.onrender.com (Wait ~2 mins)"
echo "-----------------------------------"
