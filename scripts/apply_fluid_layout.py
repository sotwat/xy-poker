import os
from pathlib import Path

# Define the correct paths to the CSS files
app_css_path = Path('/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css')
card_css_path = Path('/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Card.css')
board_css_path = Path('/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Board.css')

# Function to update App.css
def update_app_css(file_path):
    with open(file_path, 'r+') as file:
        lines = file.readlines()
        new_lines = []
        in_play_area = False
        in_game_board = False
        in_controls = False

        for line in lines:
            # Update container-type and other styles
            if '.app {' in line:
                new_lines.append('.app {\n')
                new_lines.append('  container-type: inline-size;\n')
                continue

            # Update .play-area styles
            if '.play-area {' in line:
                in_play_area = True
                new_lines.append(line)
                continue

            if in_play_area and '}' in line:
                in_play_area = False
                new_lines.append('  transform: none;\n')
                new_lines.append('  height: 100%;\n')
                new_lines.append('  width: 100%;\n')
                new_lines.append('  display: flex;\n')
                new_lines.append('  flex-direction: column;\n')
                new_lines.append('  justify-content: space-around;\n')
                new_lines.append('  align-items: center;\n')
                new_lines.append('  gap: 1.5vh;\n')
                new_lines.append('}\n')
                continue

            if in_play_area:
                # Skip any existing property within the block to overwrite it cleanly
                continue

            # Update .game-board styles
            if '.game-board {' in line:
                in_game_board = True
                new_lines.append(line)
                continue

            if in_game_board and '}' in line:
                in_game_board = False
                new_lines.append('  flex: 1;\n')
                new_lines.append('  min-height: 0;\n')
                new_lines.append('  padding: 10px;\n')
                new_lines.append('  display: flex;\n')
                new_lines.append('  flex-direction: column;\n')
                new_lines.append('  justify-content: center;\n')
                new_lines.append('  align-items: center;\n')
                new_lines.append('}\n')
                continue

            if in_game_board:
                continue

            # Update .controls styles
            if '.controls {' in line:
                in_controls = True
                new_lines.append(line)
                continue

            if in_controls and '}' in line:
                in_controls = False
                # Remove absolute positioning and sticky bottom rules to prevent overlap
                new_lines.append('  padding: 8px;\n')
                new_lines.append('  box-sizing: border-box;\n')
                new_lines.append('  background: rgba(255, 255, 255, 0.95);\n')
                new_lines.append('  width: 100%;\n')
                new_lines.append('  flex-shrink: 0;\n')
                new_lines.append('  z-index: 10;\n')
                new_lines.append('}\n')
                continue

            if in_controls:
                continue

            new_lines.append(line)

        file.seek(0)
        file.writelines(new_lines)
        file.truncate()

# Function to update Card.css
def update_card_css(file_path):
    with open(file_path, 'r+') as file:
        lines = file.readlines()
        new_lines = []

        for line in lines:
            # Update .card styles
            if '.card {' in line:
                new_lines.append(line)
                continue

            if 'width: 60px;' in line:
                new_lines.append('  width: 12.5cqw;\n')
                continue

            if 'height: 90px;' in line:
                new_lines.append('  height: 18.75cqw;\n')
                continue

            new_lines.append(line)

        file.seek(0)
        file.writelines(new_lines)
        file.truncate()

# Function to update Board.css
def update_board_css(file_path):
    with open(file_path, 'r+') as file:
        lines = file.readlines()
        new_lines = []

        for line in lines:
            # Update .board styles
            if '.board {' in line:
                new_lines.append(line)
                continue

            if 'gap: 16px;' in line:
                new_lines.append('  gap: 2.5cqw;\n')
                continue

            if 'padding: 20px;' in line:
                new_lines.append('  padding: 3cqw;\n')
                continue

            # Update .board-column styles
            if '.board-column {' in line:
                new_lines.append(line)
                continue

            if 'gap: 12px;' in line:
                new_lines.append('  gap: 2cqw;\n')
                continue

            # Update .card-slots styles
            if '.card-slots {' in line:
                new_lines.append(line)
                continue

            if 'gap: 8px;' in line:
                new_lines.append('  gap: 1.5cqw;\n')
                continue

            # Update .card-slot styles
            if '.card-slot {' in line:
                new_lines.append(line)
                continue

            if 'width: 60px;' in line:
                new_lines.append('  width: 12.5cqw;\n')
                continue

            if 'height: 90px;' in line:
                new_lines.append('  height: 18.75cqw;\n')
                continue

            new_lines.append(line)

        file.seek(0)
        file.writelines(new_lines)
        file.truncate()

# Apply updates to the CSS files
update_app_css(app_css_path)
update_card_css(card_css_path)
update_board_css(board_css_path)

print("Fluid layout modifications applied successfully using Container Queries.")
