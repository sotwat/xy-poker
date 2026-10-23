#!/bin/sh
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-.selfplay/final-verification}"
TARGET_DIR="$DIR/$OUTPUT"

echo "Requesting stop for XY Poker self-play supervisor in $TARGET_DIR..."
touch "$TARGET_DIR/stop.flag"

if [ -f "$TARGET_DIR/continuation.pid" ]; then
    PID=$(cat "$TARGET_DIR/continuation.pid" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "Sending SIGINT to active training process (PID $PID) for graceful save..."
        kill -INT "$PID" 2>/dev/null || true
    fi
fi

if [ -f "$TARGET_DIR/supervisor.pid" ]; then
    SPID=$(cat "$TARGET_DIR/supervisor.pid" 2>/dev/null || true)
    if [ -n "$SPID" ] && kill -0 "$SPID" 2>/dev/null; then
        echo "Sending SIGTERM to supervisor process (PID $SPID)..."
        kill -TERM "$SPID" 2>/dev/null || true
    fi
fi

echo "Stop signal sent. Any active session will save to latest.pt and exit."
