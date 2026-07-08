import os

shared_board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/SharedBoard.css'
board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Board.css'
app_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Update SharedBoard.css to optimal stretch scale: slots to 12.2cqw, column gap 10px, scale 0.94, translateY -8px
# This maximizes the board width and height to fit perfectly, stopping right at the edge of the controls panel.
optimal_stretch_shared_board_css = """
/* ========================================================================= */
/* Contained Unified SharedBoard Styling (Restored Skins & Optimal Fit)       */
/* ========================================================================= */

.shared-board {
    display: flex !important;
    gap: 10px !important;
    padding: 10px !important;
    border-radius: 12px !important;
    justify-content: center !important;
    align-items: center !important;
    transform: scale(0.94) translateY(-8px) !important; /* Maximized scale, shifted slightly up to clear controls */
    transform-origin: center center !important;
    position: relative !important;
    z-index: 100 !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
}

.shared-column {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important; /* Compresses vertical height slightly to fit maximum slot size */
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

/* Card Slot sizes (Perfectly balanced size for mobile display) */
.card-slot {
    width: 12.2cqw !important;
    height: 18.3cqw !important;
    border: 2px dashed rgba(255, 255, 255, 0.3) !important;
    border-radius: 6px !important;
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
    padding: 2px !important;
    margin: 2px 0 !important;
    background: rgba(255, 255, 255, 0.15) !important;
    border-radius: 50% !important;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2) !important;
}

.opponent-slot .card {
    transform: rotate(180deg) !important;
}

/* Board Skins (RESTORED BEAUTIFUL ORIGINAL BACKS) */
.board-theme-classic {
    background: #27ae60 !important; /* Green felt board */
    border: 3px solid #1e7e43 !important;
}
.board-theme-wood {
    background: #8e44ad !important;
    border: 3px solid #732d91 !important;
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
    border: 3px solid #134074 !important;
}
.board-theme-crimson {
    background: #210a04 !important;
    border: 3px solid #3d1308 !important;
}
"""

with open(shared_board_css, 'w', encoding='utf-8') as file:
    file.write(optimal_stretch_shared_board_css)
print("Success: Updated SharedBoard.css with optimal stretch scale.")

# 2. Update Board.css slots to strictly be 12.2cqw width
with open(board_css, 'r', encoding='utf-8') as file:
    content_board = file.read()

content_board = content_board.replace("width: 10cqw !important;", "width: 12.2cqw !important;")
content_board = content_board.replace("height: 15cqw !important;", "height: 18.3cqw !important;")

with open(board_css, 'w', encoding='utf-8') as file:
    file.write(content_board)
print("Success: Updated Board.css slot sizes to 12.2cqw.")

# 3. Update App.css: Set play-area padding-bottom to 14px to maximize stretch space while maintaining strict clearance
with open(app_css, 'r', encoding='utf-8') as file:
    content_app = file.read()

content_app = content_app.replace("padding-bottom: 25px !important; /* Inject 25px safe buffer zone at bottom of board */", "padding-bottom: 12px !important; /* 12px tight safe buffer zone */")

with open(app_css, 'w', encoding='utf-8') as file:
    file.write(content_app)
print("Success: Adjusted padding buffer in App.css.")
