import os

lobby_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Lobby.tsx'
rules_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/RulesModal.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Modify RulesModal.tsx: Append a unified close button at the bottom of rules-content
with open(rules_tsx_path, 'r', encoding='utf-8') as file:
    content_rules = file.read()

# Locate the end of the rules-scroll-area and rules-content
old_rules_end = """                </div>
            </div>
        </div>"""

new_rules_end = """                </div>
                <button className="rules-close-btn" onClick={onClose}>Close</button>
            </div>
        </div>"""

if old_rules_end in content_rules:
    content_rules = content_rules.replace(old_rules_end, new_rules_end)
    with open(rules_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_rules)
    print("Success: Appended close button to RulesModal.tsx.")
else:
    # Try normalized spacing
    content_rules_norm = content_rules.replace('\r\n', '\n')
    old_rules_end_norm = old_rules_end.replace('\r\n', '\n')
    new_rules_end_norm = new_rules_end.replace('\r\n', '\n')
    if old_rules_end_norm in content_rules_norm:
        content_rules_norm = content_rules_norm.replace(old_rules_end_norm, new_rules_end_norm)
        with open(rules_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_rules_norm)
        print("Success: Appended close button to RulesModal.tsx (normalized).")
    else:
        print("Warning: Could not find end markers in RulesModal.tsx.")

# 2. Modify App.css: Correct modal margins, paddings, and button style overrides to align perfectly with lobby-home
with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

# Replace the previous modal unification block with an updated one that uses padding: 8px (identical to lobby-home)
old_unification_block = """/* 1. Modal Overlays Absolute containment (Forces matching .app dimension) */
.rules-overlay,
.modal-overlay,
.skin-store-overlay,
.mypage-overlay {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: radial-gradient(circle at center, #1b1b2f 0%, #0d0d1a 100%) !important;
  z-index: 2000 !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  animation: modalFadeIn 0.2s ease-out !important;
}"""

new_unification_block = """/* 1. Modal Overlays Absolute containment (Forces matching .app dimension with padding: 8px to align with lobby-home) */
.rules-overlay,
.modal-overlay,
.skin-store-overlay,
.mypage-overlay,
.auth-overlay {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: radial-gradient(circle at center, #1b1b2f 0%, #0d0d1a 100%) !important;
  z-index: 2000 !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 8px !important; /* Unified to 8px, identical to .lobby-home padding */
  box-sizing: border-box !important;
  overflow: hidden !important;
  animation: modalFadeIn 0.2s ease-out !important;
}"""

if old_unification_block in content_css:
    content_css = content_css.replace(old_unification_block, new_unification_block)
else:
    # Try normalized spacing
    content_css_norm = content_css.replace('\r\n', '\n')
    old_unification_block_norm = old_unification_block.replace('\r\n', '\n')
    new_unification_block_norm = new_unification_block.replace('\r\n', '\n')
    if old_unification_block_norm in content_css_norm:
        content_css_norm = content_css_norm.replace(old_unification_block_norm, new_unification_block_norm)
        content_css = content_css_norm

# Also ensure that .rules-close-btn is styled exactly like the unified close buttons
close_btn_rules_override = """
/* Rules Close button styling */
.rules-close-btn {
  background: linear-gradient(135deg, #333 0%, #111 100%) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  border-radius: 10px !important;
  color: #ff3366 !important;
  font-size: 0.85rem !important;
  font-weight: bold !important;
  padding: 10px !important;
  width: 100% !important;
  cursor: pointer !important;
  margin-top: auto !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2) !important;
  transition: all 0.2s !important;
}
.rules-close-btn:hover {
  background: linear-gradient(135deg, #444 0%, #222 100%) !important;
  transform: translateY(-2px) !important;
}
"""

if "Rules Close button styling" not in content_css:
    content_css += close_btn_rules_override

with open(app_css_path, 'w', encoding='utf-8') as file:
    file.write(content_css)
print("Success: Updated App.css with rules close button styles and padding alignment.")
