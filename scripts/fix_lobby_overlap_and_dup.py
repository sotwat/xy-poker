import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Read and modify App.tsx: Remove the duplicated Skin Shop button from sub-battle-actions
with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content_tsx = file.read()

# Replace the sub-battle-actions block to only contain the Online Room button (Skin Shop is managed by footer tabs)
old_sub_actions = """                            <div className="sub-battle-actions">
                              <button 
                                className="quest-btn-secondary" 
                                onClick={() => {
                                  playClickSound();
                                  setMode('online');
                                  setIsOnlineGame(false);
                                  setIsQuickMatch(false);
                                }}
                              >
                                ⚔️ Online Room
                              </button>
                              <button 
                                className="quest-btn-secondary" 
                                onClick={() => {
                                  playClickSound();
                                  setShowSkinStore(true);
                                }}
                              >
                                🎨 Skin Shop
                              </button>
                            </div>"""

new_sub_actions = """                            <div className="sub-battle-actions">
                              <button 
                                className="quest-btn-secondary" 
                                style={{ width: '100%' }}
                                onClick={() => {
                                  playClickSound();
                                  setMode('online');
                                  setIsOnlineGame(false);
                                  setIsQuickMatch(false);
                                }}
                              >
                                ⚔️ Online Multiplayer Room
                              </button>
                            </div>"""

if old_sub_actions in content_tsx:
    content_tsx = content_tsx.replace(old_sub_actions, new_sub_actions)
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_tsx)
    print("Success: Removed duplicated Skin Shop button from App.tsx.")
else:
    # Try normalized spacing version
    content_tsx_norm = content_tsx.replace('\r\n', '\n')
    old_sub_actions_norm = old_sub_actions.replace('\r\n', '\n')
    new_sub_actions_norm = new_sub_actions.replace('\r\n', '\n')
    if old_sub_actions_norm in content_tsx_norm:
        content_tsx_norm = content_tsx_norm.replace(old_sub_actions_norm, new_sub_actions_norm)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_tsx_norm)
        print("Success: Removed duplicated Skin Shop button from App.tsx (normalized).")
    else:
        print("Warning: Could not find sub-battle-actions block in App.tsx.")

# 2. Append Styles to App.css to hide the old global header during lobby display and style single sub-action button
header_hide_styles = """

/* Hide the old global app header when displaying the new mobile lobby home */
.app:has(.lobby-home) .app-header {
  display: none !important;
}

/* Adjust layout when only 1 sub-action button is present */
.lobby-home .sub-battle-actions {
  display: flex !important;
  justify-content: center !important;
  width: 100% !important;
}
"""

with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

if "Hide the old global app header when displaying the new mobile lobby home" not in content_css:
    with open(app_css_path, 'a', encoding='utf-8') as file:
        file.write(header_hide_styles)
    print("Success: Appended header hide styles to App.css.")
else:
    print("Warning: Header hide styles already present in App.css.")
