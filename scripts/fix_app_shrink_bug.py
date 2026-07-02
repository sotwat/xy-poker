app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

with open(app_css_path, 'r') as file:
    content = file.read()

# Replace first .app definition (around line 12)
old_app_block = """.app {
  container-type: inline-size;
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
}"""

new_app_block = """.app {
  container-type: inline-size;
  flex-shrink: 0; /* Prevent flex container from collapsing width to 0 */
  text-align: center;
  min-height: 100vh;
  max-width: 480px;
  width: 100vw; /* Use viewport width as base to ensure scaling works */
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
}"""

if old_app_block in content:
    content = content.replace(old_app_block, new_app_block)
    print("Success: Updated global .app block with flex-shrink: 0 and width: 100vw.")
else:
    # Normalized newline alternative
    old_app_block_norm = old_app_block.replace('\r\n', '\n')
    new_app_block_norm = new_app_block.replace('\r\n', '\n')
    if old_app_block_norm in content:
        content = content.replace(old_app_block_norm, new_app_block_norm)
        print("Success: Updated global .app block (normalized).")
    else:
        print("Warning: Could not locate global .app block in App.css.")

# Also replace the media query version of .app definition
old_mq_app = """.app {
  container-type: inline-size;
    height: 100dvh;
    /* Force full viewport height */
    overflow: hidden;
    /* Prevent scrolling */
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* Center content */
    gap: 0;
  }"""

new_mq_app = """.app {
  container-type: inline-size;
  flex-shrink: 0;
  width: 100vw;
  max-width: 480px;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
}"""

if old_mq_app in content:
    content = content.replace(old_mq_app, new_mq_app)
    print("Success: Updated media query .app block.")
else:
    old_mq_app_norm = old_mq_app.replace('\r\n', '\n')
    new_mq_app_norm = new_mq_app.replace('\r\n', '\n')
    if old_mq_app_norm in content:
        content = content.replace(old_mq_app_norm, new_mq_app_norm)
        print("Success: Updated media query .app block (normalized).")
    else:
        print("Warning: Could not locate media query .app block in App.css.")

with open(app_css_path, 'w') as file:
    file.write(content)

print("CSS adjustments complete.")
