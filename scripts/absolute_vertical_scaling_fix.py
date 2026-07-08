import os

shared_board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/SharedBoard.css'
board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Board.css'
app_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Update SharedBoard.css to scale down to 0.78, translateY slightly up, and shrink card-slot to 8.2cqw width
with open(shared_board_css, 'r', encoding='utf-8') as file:
    content_shared = file.read()

# Replace the transform in mobile media query with a much safer, non-overlapping scale
content_shared = content_shared.replace(
    "transform: scale(0.9) translateY(0px) !important; /* Scale board down to 90% */ /* Prevent board pushing down into hand */",
    "transform: scale(0.76) translateY(-22px) !important; /* Strictly scale down to 76% and lift up by 22px to clear controls */"
)

# Shrink slot size further in mobile view
content_shared = content_shared.replace(
    "width: 9.2cqw !important;\n        height: 13.8cqw !important;",
    "width: 8.4cqw !important;\n        height: 12.6cqw !important;"
)

with open(shared_board_css, 'w', encoding='utf-8') as file:
    file.write(content_shared)
print("Success: Scaled SharedBoard down to 0.76 and shifted up by 22px.")

# 2. Update Board.css to align standard slot width to 8.4cqw
with open(board_css, 'r', encoding='utf-8') as file:
    content_board = file.read()

content_board = content_board.replace("width: 9.2cqw !important;", "width: 8.4cqw !important;")
content_board = content_board.replace("height: 13.8cqw !important;", "height: 12.6cqw !important;")

with open(board_css, 'w', encoding='utf-8') as file:
    file.write(content_board)
print("Success: Updated Board.css slot sizes.")

# 3. Update App.css: Set .play-area gap to 0.2vh, and adjust padding-bottom to create more physical buffer
with open(app_css, 'r', encoding='utf-8') as file:
    content_app = file.read()

content_app = content_app.replace("gap: 0.5vh !important;", "gap: 0.2vh !important;")

# Modify overlap prevention styling in App.css to guarantee gap buffer
old_prevention = """/* Board and Hand overlap prevention */
.play-area {
  padding-bottom: 5px !important;
  box-sizing: border-box !important;
}"""

new_prevention = """/* Board and Hand overlap prevention */
.play-area {
  padding-bottom: 25px !important; /* Inject 25px safe buffer zone at bottom of board */
  box-sizing: border-box !important;
}"""

content_app = content_app.replace(old_prevention, new_prevention)

with open(app_css, 'w', encoding='utf-8') as file:
    file.write(content_app)
print("Success: Adjusted play area padding and gap in App.css.")

