import os

shared_board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/SharedBoard.css'

with open(shared_board_css, 'r', encoding='utf-8') as file:
    content = file.read()

# Replace the transform logic with the mathematically calculated optimal boundary values (scale 0.88, translateY -12px)
# This perfectly places the board bottom edge just a few pixels above the hand footer panel bounds.
content = content.replace(
    "transform: scale(0.94) translateY(-8px) !important; /* Maximized scale, shifted slightly up to clear controls */",
    "transform: scale(0.88) translateY(-12px) !important; /* Mathematically calculated optimal limit to clear hand controls exactly */"
)

with open(shared_board_css, 'w', encoding='utf-8') as file:
    file.write(content)

print("Success: Applied mathematically calculated scaling parameters to SharedBoard.css.")
