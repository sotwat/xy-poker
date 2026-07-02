import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Modify App.tsx: remove the hardcoded inline style on .auth-status
with open(app_tsx_path, 'r') as file:
    content_tsx = file.read()

# Exact target string to replace
target_style = " style={{ position: 'absolute', top: 10, right: 10, zIndex: 50 }}"
if target_style in content_tsx:
    content_tsx = content_tsx.replace(target_style, "")
    with open(app_tsx_path, 'w') as file:
        file.write(content_tsx)
    print("Success: Removed inline style from App.tsx.")
else:
    # Alternative check for slightly different spacing/quotes
    content_tsx_norm = content_tsx.replace('style={{position:\'absolute\',top:10,right:10,zIndex:50}}', '')
    if len(content_tsx_norm) != len(content_tsx):
        with open(app_tsx_path, 'w') as file:
            file.write(content_tsx_norm)
        print("Success: Removed inline style from App.tsx (normalized).")
    else:
        print("Warning: Could not find inline style target in App.tsx (may already be removed).")

# 2. Append layout fixes to the bottom of App.css to override previous buggy styles cleanly
header_fix_css = """

/* ======================================================= */
/* Header Layout Fix for Unified UI (Lobby Overlap Bug)    */
/* ======================================================= */
.app-header {
  position: relative !important;
  min-height: 52px !important;
  padding: 8px !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
}

.header-title-row h1 {
  font-size: 1.2rem !important;
  padding: 0 45px !important;
  margin: 0 !important;
  line-height: 1.2 !important;
}

.btn-fullscreen {
  position: absolute !important;
  left: 8px !important;
  top: 8px !important;
  width: 32px !important;
  height: 32px !important;
  margin: 0 !important;
}

.auth-status {
  position: absolute !important;
  right: 8px !important;
  top: 8px !important;
  margin: 0 !important;
  z-index: 100 !important;
}

.auth-status button {
  padding: 4px 8px !important;
  font-size: 0.65rem !important;
}

/* User logged-in info text styling to fit mobile container size */
.auth-status span {
  font-size: 0.65rem !important;
}
"""

with open(app_css_path, 'r') as file:
    content_css = file.read()

# To prevent duplicate appends, check if the comment header already exists
if "Header Layout Fix for Unified UI" not in content_css:
    with open(app_css_path, 'a') as file:
        file.write(header_fix_css)
    print("Success: Appended header layout fixes to App.css.")
else:
    print("Warning: Header fixes already appended in App.css.")
