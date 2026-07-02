file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Hand.css'

with open(file_path, 'r') as file:
    content = file.read()

# Replace gap/padding with fluid cqw and widen media query
content = content.replace("gap: 12px;", "gap: 2cqw;")
content = content.replace("padding: 16px;", "padding: 3cqw;")
content = content.replace("@media (max-width: 600px)", "@media (max-width: 9999px)")

with open(file_path, 'w') as file:
    file.write(content)

print("Success: Hand.css relative conversions applied.")
