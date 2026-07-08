import os

app_tsx = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'

with open(app_tsx, 'r', encoding='utf-8') as file:
    lines = file.readlines()

# We want to replace lines 1828 to 1842 (0-indexed indices: 1827 to 1841)
# Let's inspect the target lines to make sure
start_line = 1827
end_line = 1841

print("Target lines to replace:")
for i in range(start_line, end_line + 1):
    print(f"{i+1}: {lines[i]}", end="")

# The replacement markup
replacement = """                      {/* Always render the action controls during playing phase to prevent layout height shifting */}
                      {phase === 'playing' && (
                        <div className="action-bar" style={{ minHeight: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <div className="place-controls">
                            <div className="toggle-hidden" style={{ opacity: (currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)) ? 1 : 0.5, pointerEvents: (currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0)) ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                              <input
                                type="checkbox"
                                checked={placeHidden}
                                onChange={(e) => setPlaceHidden(e.target.checked)}
                                disabled={
                                  currentPlayerIndex !== (isOnlineGame && playerRole === 'guest' ? 1 : 0) ||
                                  !selectedCardId || 
                                  currentPlayer.hiddenCardsCount >= 3
                                }
                              />
                              <span style={{ marginLeft: '4px' }}>Face Down ({3 - currentPlayer.hiddenCardsCount} left)</span>
                            </div>
                          </div>
                        </div>
                      )}
"""

# Replace the lines from 1827 to 1841 (inclusive, which is 14 lines)
# Let's find the exact indices by matching the content dynamically to avoid line number mismatch
found_start = -1
found_end = -1

for i in range(len(lines)):
    if "Only show action controls during my turn in playing phase" in lines[i]:
        found_start = i
    if found_start != -1 and "disabled={!selectedCardId || currentPlayer.hiddenCardsCount >= 3}" in lines[i]:
        # The closing tag of this condition is a few lines below. Let's find the first "}" and "渲染) ||"
        # It closes with:
        #                       )}
        # right after the closing </div> of action-bar
        for j in range(i, len(lines)):
            if lines[j].strip() == ")}":
                # Find if it is the closing of this action controls block
                # Looking at layout, it goes:
                #                             />
                #                             <span style={{}}>Face Down ({3 - currentPlayer.hiddenCardsCount} left)</span>
                #                           </div>
                #                         </div>
                #                       </div>
                #                     )}
                # So we can search for the first ")}" after "Face Down"
                if "Face Down" in lines[j-2] or "Face Down" in lines[j-3] or "Face Down" in lines[j-4] or "Face Down" in lines[j-5]:
                    found_end = j
                    break

if found_start != -1 and found_end != -1:
    print(f"Dynamic Match found! Replacing lines {found_start+1} to {found_end+1}.")
    del lines[found_start:found_end+1]
    lines.insert(found_start, replacement)
    
    with open(app_tsx, 'w', encoding='utf-8') as file:
        file.writelines(lines)
    print("Success: Dynamically replaced action controls in App.tsx.")
else:
    print("Error: Could not dynamically find target block.")
