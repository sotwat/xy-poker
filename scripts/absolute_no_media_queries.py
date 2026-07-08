import os

shared_board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/SharedBoard.css'
board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Board.css'

# The ultimate complete overhaul of SharedBoard.css
# This completely obliterates window-width media queries (which bypass the 480px app container check)
# and enforces a flat, strict, scaled down mobile-first canvas design everywhere.
ultimate_shared_board_css = """
/* ========================================================================= */
/* Contained Unified SharedBoard Styling (No Window Media Queries)           */
/* ========================================================================= */

.shared-board {
    display: flex !important;
    gap: 4px !important;
    padding: 6px !important;
    background: #f0f2f5 !important;
    border-radius: 12px !important;
    justify-content: center !important;
    align-items: center !important;
    transform: scale(0.72) translateY(-26px) !important; /* Strictly lock scale to 72% and lift up to clear controls */
    transform-origin: center center !important;
    position: relative !important;
    z-index: 100 !important;
}

.shared-column {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important; /* Tight spacing between slots to compress height */
    align-items: center !important;
}

.shared-column.interactive:hover .player-slots {
    background: rgba(0, 0, 0, 0.05) !important;
    border-radius: 8px !important;
}

.shared-column.winning-column-p1 {
    background: rgba(79, 172, 254, 0.15) !important;
    border-radius: 12px !important;
    padding: 4px !important;
    border: 2px solid rgba(79, 172, 254, 0.8) !important;
    box-shadow: 0 0 15px rgba(79, 172, 254, 0.5) !important;
    animation: glow-p1 2s ease-in-out infinite !important;
}

.shared-column.winning-column-p2 {
    background: rgba(255, 88, 88, 0.15) !important;
    border-radius: 12px !important;
    padding: 4px !important;
    border: 2px solid rgba(255, 88, 88, 0.8) !important;
    box-shadow: 0 0 15px rgba(255, 88, 88, 0.5) !important;
    animation: glow-p2 2s ease-in-out infinite !important;
}

@keyframes glow-p1 {
    0%, 100% {
        box-shadow: 0 0 15px rgba(79, 172, 254, 0.5);
        border-color: rgba(79, 172, 254, 0.8);
    }
    50% {
        box-shadow: 0 0 25px rgba(79, 172, 254, 0.8);
        border-color: rgba(79, 172, 254, 1);
    }
}

@keyframes glow-p2 {
    0%, 100% {
        box-shadow: 0 0 15px rgba(255, 88, 88, 0.5);
        border-color: rgba(255, 88, 88, 0.8);
    }
    50% {
        box-shadow: 0 0 25px rgba(255, 88, 88, 0.8);
        border-color: rgba(255, 88, 88, 1);
    }
}

/* Card Slot sizes (Strictly scaled using cqw to stay within 480px app) */
.card-slot {
    width: 7.6cqw !important;
    height: 11.4cqw !important;
    border: 1px dashed #ccc !important;
    border-radius: 4px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
}

/* Force card component inside slots to fit perfectly */
.card-slot .card {
    width: 100% !important;
    height: 100% !important;
}

.empty-slot {
    width: 100% !important;
    height: 100% !important;
}

.dice-row {
    padding: 1px !important;
    margin: 1px 0 !important;
    background: #e0e0e0 !important;
    border-radius: 50% !important;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1) !important;
}

.opponent-slot .card {
    transform: rotate(180deg) !important;
}

/* Board Skins overrides */
.board-theme-classic {
    background: #27ae60 !important;
}
.board-theme-wood {
    background: #8e44ad !important;
}
.board-theme-neon {
    background: #111111 !important;
    border: 2px solid #00f2fe !important;
    box-shadow: 0 0 20px rgba(0, 242, 254, 0.3) !important;
}
.board-theme-dark-gold {
    background: #1a1a1a !important;
    border: 2px solid #ffd700 !important;
    box-shadow: 0 0 25px rgba(255, 215, 0, 0.25) !important;
}
.board-theme-cyberpunk {
    background: #0f0c1b !important;
    border: 2px solid #ff007f !important;
}
.board-theme-ocean {
    background: #0b2545 !important;
}
.board-theme-crimson {
    background: #210a04 !important;
}
"""

with open(shared_board_css, 'w', encoding='utf-8') as file:
    file.write(ultimate_shared_board_css)
print("Success: Rewrote SharedBoard.css entirely without media queries.")

# 2. Overwrite Board.css slots to strictly be 7.6cqw
with open(board_css, 'r', encoding='utf-8') as file:
    content_board = file.read()

content_board = content_board.replace("width: 8.4cqw !important;", "width: 7.6cqw !important;")
content_board = content_board.replace("height: 12.6cqw !important;", "height: 11.4cqw !important;")

with open(board_css, 'w', encoding='utf-8') as file:
    file.write(content_board)
print("Success: Updated Board.css slot sizes.")
