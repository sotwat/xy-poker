import os

# Define file paths
css_file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'
temp_file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css.tmp'

# Step 1: Prepend body styles
body_styles = """
body {
    background: linear-gradient(135deg, #1f4068, #162447, #1b1b2f);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    overflow: hidden;
    margin: 0;
}
"""

# Step 2: Modify the first .app style block
first_app_style = """
.app {
    text-align: center;
    min-height: 100vh;
    max-width: 480px;
    width: 100%;
    height: 100dvh;
    max-height: 850px;
    margin: auto;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.6);
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    background: #121212;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
"""

# Step 3: Force Mobile Styles globally
media_query_replacement = '@media (max-width: 9999px)'

# Read the original CSS file
with open(css_file_path, 'r') as file:
    css_content = file.read()

# Prepend body styles
css_content = body_styles + '\n' + css_content

# Modify the first .app style block (Corrected to avoid nesting syntax error)
first_app_index = css_content.find('.app {')
if first_app_index != -1:
    end_index = css_content.find('}', first_app_index)
    if end_index != -1:
        css_content = css_content[:first_app_index] + first_app_style.strip() + '\n' + css_content[end_index + 1:]

# Replace media queries
css_content = css_content.replace('@media (max-width: 900px)', media_query_replacement)

# Write the modified content to a temporary file
with open(temp_file_path, 'w') as temp_file:
    temp_file.write(css_content)

# Replace the original CSS file with the modified one
os.replace(temp_file_path, css_file_path)
print("CSS replacement completed successfully.")
