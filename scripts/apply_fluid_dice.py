file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Dice.css'

with open(file_path, 'r') as file:
    content = file.read()

# Replace hardcoded font-sizes with fluid container-query font-sizes
replacements = {
    "font-size: 10px;": "font-size: 2.1cqw;",
    "font-size: 7px;": "font-size: 1.45cqw;",
    "font-size: 20px;": "font-size: 4.2cqw;"
}

replaced = False
for old, new in replacements.items():
    if old in content:
        content = content.replace(old, new)
        replaced = True

if replaced:
    with open(file_path, 'w') as file:
        file.write(content)
    print("Success: Dice font-sizes converted to fluid cqw units.")
else:
    print("Warning: Could not find target font-sizes in Dice.css.")
