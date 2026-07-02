# /Users/watanabesotaro/Documents/antigravity/xy-poker/scripts/modify_css_exact.py

def modify_css(file_path):
    # Read all lines from the CSS file
    with open(file_path, 'r') as file:
        lines = file.readlines()

    # Lines to be replaced or commented out (0-indexed equivalent of 275, 280, 293, 414, 500, 517)
    lines_to_replace = [274, 279, 292, 413, 499, 516]

    # Replace the specified lines
    for line_number in lines_to_replace:
        if line_number < len(lines):
            lines[line_number] = '/* removed media query border */\n'

    # Prepend new body styling for screen centering and backdrop gradient
    new_body_styling = (
        "body {\n"
        "    background: linear-gradient(135deg, #1f4068, #162447, #1b1b2f);\n"
        "    display: flex;\n"
        "    justify-content: center;\n"
        "    align-items: center;\n"
        "    min-height: 100vh;\n"
        "    overflow: hidden;\n"
        "    margin: 0;\n"
        "}\n\n"
    )
    lines.insert(0, new_body_styling)

    # Append or update .app styling
    app_class_index = -1
    for i, line in enumerate(lines):
        if '.app {' in line:
            app_class_index = i
            break

    updated_app_styling = (
        ".app {\n"
        "    max-width: 480px;\n"
        "    width: 100%;\n"
        "    margin: 0 auto;\n"
        "    height: 100dvh;\n"
        "    box-shadow: 0 0 30px rgba(0, 0, 0, 0.6);\n"
        "    border-radius: 12px;\n"
        "    overflow: hidden;\n"
        "    position: relative;\n"
        "    background: #121212;\n"
        "}\n"
    )

    if app_class_index != -1:
        # Search for closing brace of the original .app and replace the whole block
        # To keep it robust, we'll replace the block starting at app_class_index up to its closing brace
        brace_count = 0
        end_index = app_class_index
        for j in range(app_class_index, len(lines)):
            brace_count += lines[j].count('{')
            brace_count -= lines[j].count('}')
            if brace_count == 0 and j > app_class_index:
                end_index = j
                break
        
        # Replace the entire block with updated app styling
        del lines[app_class_index:end_index + 1]
        lines.insert(app_class_index, updated_app_styling)
    else:
        # If .app class is not found, append it at the end of the file
        lines.append("\n" + updated_app_styling)

    # Write the modified lines back to the CSS file
    with open(file_path, 'w') as file:
        file.writelines(lines)

# Path to the App.css file
css_file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# Call the function to modify the CSS file
modify_css(css_file_path)
print("CSS modification successfully executed on lines 275, 280, 293, 414, 500, 517.")
