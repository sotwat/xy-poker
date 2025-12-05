#!/bin/bash

# XY Poker サーバーとトンネルを起動するスクリプト

# サーバーをtmuxセッションで起動
tmux new-session -d -s server 'cd /Users/watanabesotaro/.gemini/antigravity/xy-poker && node server/index.js'

# トンネルをtmuxセッションで起動
tmux new-session -d -s tunnel 'cloudflared tunnel --url http://localhost:3001'

echo "✓ サーバーとトンネルを起動しました"
echo ""
echo "セッション確認:"
echo "  サーバー: tmux attach -t server"
echo "  トンネル: tmux attach -t tunnel"
echo ""
echo "セッション一覧: tmux ls"
echo ""
echo "トンネルURLを確認するには: tmux attach -t tunnel"
echo "(デタッチ: Ctrl+B → D)"
