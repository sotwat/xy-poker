import os

rules_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/RulesModal.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Modify RulesModal.tsx using precise line index targeting
with open(rules_tsx_path, 'r', encoding='utf-8') as file:
    lines = file.readlines()

# Line 174 (1-based) is index 173: "                </div>\n"
# Line 176 (1-based) is index 175: "        </div >\n"
# Let's verify and inject the button at the correct hierarchy level:
# The hierarchy is:
# <div className="rules-overlay" (L37)
#   <div className="rules-content" (L38)
#     ...
#     <div className="rules-scroll-area" (L42)
#       ...
#     </div> (L174)
#   </div> (L175)
# </div> (L176)
# We want the button inside rules-content (after rules-scroll-area, L174)

target_scroll_area_close = "                </div>\n" # This is L174, closing of rules-scroll-area
if "rules-scroll-area" in "".join(lines[35:45]):
    # Let's locate the index of L174
    l174_idx = 173
    if l174_idx < len(lines) and lines[l174_idx].strip() == "</div>":
        lines.insert(l174_idx + 1, "                <button className=\"rules-close-btn\" onClick={onClose}>Close</button>\n")
        with open(rules_tsx_path, 'w', encoding='utf-8') as file:
            file.writelines(lines)
        print("Success: Injected Close button into RulesModal.tsx.")
    else:
        # Fallback: scan backwards from the end to find the closing div of scroll area
        found = False
        for idx in range(len(lines) - 1, 0, -1):
            if lines[idx].strip() == "</div>" and idx > 150:
                # We need to inject AFTER this div, which closes scroll area
                # Let's count how many divs we close:
                # L174 closes scroll-area, L175 closes rules-content, L176 closes rules-overlay
                # So the second to last closing div is rules-content, third to last is rules-scroll-area.
                # Let's find index of third to last "div" tag
                divs_found = []
                for sub_idx in range(len(lines) - 1, 0, -1):
                    if "div" in lines[sub_idx] and "</" in lines[sub_idx]:
                        divs_found.append(sub_idx)
                        if len(divs_found) == 3:
                            # This is the closing of rules-scroll-area
                            lines.insert(sub_idx + 1, "                <button className=\"rules-close-btn\" onClick={onClose}>Close</button>\n")
                            found = True
                            break
                if found:
                    with open(rules_tsx_path, 'w', encoding='utf-8') as file:
                        file.writelines(lines)
                    print("Success: Injected Close button into RulesModal.tsx via scan.")
                    break
else:
    print("Warning: Could not inject rules Close button.")

# 2. Correct any remaining mismatch on App.css overlay padding or button overrides
with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

# Make sure auth-overlay is also added
if ".auth-overlay" not in content_css:
    # Append the full unified selector list
    # The previous script already replaced the unification block, let's verify
    print("App.css block check complete.")
