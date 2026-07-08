import os

app_tsx = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
shared_board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/SharedBoard.css'
board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Board.css'

# 1. Modify App.tsx: Make Face Down checkbox always render during playing phase to prevent layout shifts
with open(app_tsx, 'r', encoding='utf-8') as file:
    content_app = file.read()

old_action_bar = """                      {/* Only show action controls during my turn in playing phase */}
                      {phase === 'playing' && currentPlayerIndex === (isOnlineGame && playerRole === 'guest' ? 1 : 0) && (
                        <div className="action-bar">
                          <div className="place-controls">
                            <div className="toggle-hidden">
                              <input
                                type="checkbox"
                                checked={placeHidden}
                                onChange={(e) => setPlaceHidden(e.target.checked)}
                                disabled={!selectedCardId || currentPlayer.hiddenCardsCount >= 3}
                              />
                              <span style={{}}>Face Down ({3 - currentPlayer.hiddenCardsCount} left)</span>
                            </div>
                          </div>
                        </div>
                      )}"""

new_action_bar = """                      {/* Always render the action controls during playing phase to prevent layout height shifting */}
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
                      )}"""

if old_action_bar in content_app:
    content_app = content_app.replace(old_action_bar, new_action_bar)
    with open(app_tsx, 'w', encoding='utf-8') as file:
        file.write(content_app)
    print("Success: Updated Face Down checkbox render condition in App.tsx.")
else:
    # Try normalized spacing
    content_app_norm = content_app.replace('\r\n', '\n')
    old_action_bar_norm = old_action_bar.replace('\r\n', '\n')
    new_action_bar_norm = new_action_bar.replace('\r\n', '\n')
    if old_action_bar_norm in content_app_norm:
        content_app_norm = content_app_norm.replace(old_action_bar_norm, new_action_bar_norm)
        with open(app_tsx, 'w', encoding='utf-8') as file:
            file.write(content_app_norm)
        print("Success: Updated Face Down checkbox render condition in App.tsx (normalized).")
    else:
        print("Error: Could not locate action-bar block in App.tsx.")

# 2. Modify SharedBoard.css: Shrink mobile slots to 7.8cqw and scale down board to 0.70 with translateY(-32px)
with open(shared_board_css, 'r', encoding='utf-8') as file:
    content_shared = file.read()

# Overwrite board scaling to 70% and lift up to -32px
content_shared = content_shared.replace(
    "transform: scale(0.76) translateY(-22px) !important; /* Strictly scale down to 76% and lift up by 22px to clear controls */",
    "transform: scale(0.70) translateY(-32px) !important; /* Scale board down to 70% and lift up by 32px to guarantee no overlap */"
)

# Shrink card slot in mobile/container view
content_shared = content_shared.replace(
    "width: 8.4cqw !important;\n        height: 12.6cqw !important;",
    "width: 7.8cqw !important;\n        height: 11.7cqw !important;"
)

with open(shared_board_css, 'w', encoding='utf-8') as file:
    file.write(content_shared)
print("Success: Scaled SharedBoard to 0.70 and shifted up to -32px.")

# 3. Modify Board.css: Make sure standard board card slot is also 7.8cqw
with open(board_css, 'r', encoding='utf-8') as file:
    content_board = file.read()

content_board = content_board.replace("width: 9.2cqw !important;", "width: 7.8cqw !important;")
content_board = content_board.replace("height: 13.8cqw !important;", "height: 11.7cqw !important;")

with open(board_css, 'w', encoding='utf-8') as file:
    file.write(content_board)
print("Success: Updated Board.css slot sizes.")

