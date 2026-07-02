import re

file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

with open(file_path, 'r') as file:
    content = file.read()

# Using re.search to find the dynamic start and end markers in App.css safely
match_start = re.search(r'\.coin\.flipping\s*\{', content)
# We want to replace everything from .coin.flipping up to and including the @keyframes coin-spin-3d block
match_end = re.search(r'@keyframes coin-spin-3d\s*\{[^}]*\}', content)

if match_start and match_end:
    start_index = match_start.start()
    end_index = match_end.end()
    
    new_css_rules = """
.coin.flipping.winner-0 {
  animation: coin-spin-blue 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.coin.flipping.winner-1 {
  animation: coin-spin-red 2.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.coin.flipped.winner-0 {
  transform: rotateY(1080deg);
}

.coin.flipped.winner-1 {
  transform: rotateY(900deg);
}

@keyframes coin-spin-blue {
  0% {
    transform: rotateY(0deg);
  }
  100% {
    transform: rotateY(1080deg);
  }
}

@keyframes coin-spin-red {
  0% {
    transform: rotateY(0deg);
  }
  100% {
    transform: rotateY(900deg);
  }
}
"""
    updated_content = content[:start_index] + new_css_rules.strip() + "\n\n" + content[end_index:]
    with open(file_path, 'w') as file:
        file.write(updated_content)
    print("Success: App.css coin animation updated correctly.")
else:
    print("Error: Could not locate coin anim markers in App.css.")
