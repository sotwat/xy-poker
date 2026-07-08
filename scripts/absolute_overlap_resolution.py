import os

shared_board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/SharedBoard.css'
board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Board.css'
app_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Modify SharedBoard.css: Shrink card-slot in mobile/container view to 9.2cqw width to prevent pushing heights down
with open(shared_board_css, 'r', encoding='utf-8') as file:
    content_shared = file.read()

# Locate mobile styling media query in SharedBoard.css
old_card_slot_shared = """    .card-slot {
        width: 45px;
        height: 63px;
        /* Fixed height (5/7 ratio) */
        border-width: 1px;
        border-radius: 4px;
    }"""

new_card_slot_shared = """    .card-slot {
        width: 9.2cqw !important;
        height: 13.8cqw !important;
        border-width: 1px !important;
        border-radius: 6px !important;
    }"""

if old_card_slot_shared in content_shared:
    content_shared = content_shared.replace(old_card_slot_shared, new_card_slot_shared)
else:
    # Try normalized spacing
    content_shared_norm = content_shared.replace('\r\n', '\n')
    old_card_slot_shared_norm = old_card_slot_shared.replace('\r\n', '\n')
    new_card_slot_shared_norm = new_card_slot_shared.replace('\r\n', '\n')
    if old_card_slot_shared_norm in content_shared_norm:
        content_shared = content_shared_norm.replace(old_card_slot_shared_norm, new_card_slot_shared_norm)

# Also scale the board itself to 0.9
content_shared = content_shared.replace("transform: scale(0.95) translateY(0px) !important;", "transform: scale(0.9) translateY(0px) !important; /* Scale board down to 90% */")
content_shared = content_shared.replace("gap: 16px;", "gap: 8px !important;")
content_shared = content_shared.replace("padding: 20px;", "padding: 8px !important;")

with open(shared_board_css, 'w', encoding='utf-8') as file:
    file.write(content_shared)
print("Success: Updated SharedBoard.css card slots and scaled board container down.")

# 2. Modify Board.css: Make sure standard board card slot is also 9.2cqw width
with open(board_css, 'r', encoding='utf-8') as file:
    content_board = file.read()

content_board = content_board.replace("width: 11cqw !important;", "width: 9.2cqw !important;")
content_board = content_board.replace("height: 16.5cqw !important;", "height: 13.8cqw !important;")

with open(board_css, 'w', encoding='utf-8') as file:
    file.write(content_board)
print("Success: Updated Board.css card slots.")

# 3. Modify App.css: Force dark themed background on controls, scale hand cards to 13cqw, and prevent any overlap
with open(app_css, 'r', encoding='utf-8') as file:
    content_app = file.read()

# Replace any white background settings on controls
content_app = content_app.replace("background: rgba(255, 255, 255, 0.95);", "background: rgba(15, 15, 27, 0.98) !important; color: #fff !important;")
content_app = content_app.replace("background: rgba(255, 255, 255, 0.9);", "background: rgba(255, 255, 255, 0.05) !important; color: #fff !important;")

# Target hand card size up block and change it to 13cqw
old_scale_up = """/* Hand Card Scale Up */
.hand .card {
  width: 14.5cqw !important;
  height: 21.75cqw !important;
}"""

new_scale_up = """/* Hand Card Scale Up */
.hand .card {
  width: 13.2cqw !important;
  height: 19.8cqw !important;
}"""

content_app = content_app.replace(old_scale_up, new_scale_up)

# Append ultimate overlap containment CSS overrides
final_overlap_prevention = """
/* --- Strict Battle Layout Containment and Theme Integration --- */
.controls {
  background: rgba(15, 15, 27, 0.98) !important;
  border-top: 1.5px solid rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
  padding: 8px !important;
  box-sizing: border-box !important;
  width: 100% !important;
  flex-shrink: 0 !important;
  z-index: 150 !important;
}

.hand {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 12px !important;
  min-height: 20cqw !important;
  padding: 4px !important;
}

.toggle-hidden {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  border-radius: 8px !important;
  padding: 5px 10px !important;
}

.game-board {
  overflow: hidden !important; /* Strictly lock board area inside its flex cell */
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
}

.play-area {
  height: 100% !important;
  max-height: 100% !important;
  overflow: hidden !important;
}
"""

if "Strict Battle Layout Containment" not in content_app:
    with open(app_css, 'a', encoding='utf-8') as file:
        file.write(final_overlap_prevention)
    print("Success: Appended final overlap prevention styles to App.css.")
else:
    print("Warning: Overlap styles already present in App.css.")

