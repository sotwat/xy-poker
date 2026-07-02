file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

with open(file_path, 'r') as file:
    content = file.read()

# Target old animation definitions with overshoot cubic-bezier
old_anim_block = """.coin.flipping.winner-0 {
  animation: coin-spin-blue 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.coin.flipping.winner-1 {
  animation: coin-spin-red 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}"""

# New animation block with smooth deceleration (easeOutExpo) and disabled transitions to prevent snapping
new_anim_block = """.coin.flipping,
.coin.flipped {
  transition: none !important;
}

.coin.flipping.winner-0 {
  animation: coin-spin-blue 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.coin.flipping.winner-1 {
  animation: coin-spin-red 2.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}"""

if old_anim_block in content:
    content = content.replace(old_anim_block, new_anim_block)
    with open(file_path, 'w') as file:
        file.write(content)
    print("Success: Smooth easing and transition bypass applied.")
else:
    # Try normalized newlines
    content_norm = content.replace('\r\n', '\n')
    old_anim_block_norm = old_anim_block.replace('\r\n', '\n')
    new_anim_block_norm = new_anim_block.replace('\r\n', '\n')
    if old_anim_block_norm in content_norm:
        content_norm = content_norm.replace(old_anim_block_norm, new_anim_block_norm)
        with open(file_path, 'w') as file:
            file.write(content_norm)
        print("Success: Smooth easing and transition bypass applied (normalized).")
    else:
        print("Error: Could not locate coin flipping animation blocks in App.css.")
