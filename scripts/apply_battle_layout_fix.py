import os

game_info_tsx = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/GameInfo.tsx'
app_tsx = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
board_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Board.css'
hand_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Hand.css'
app_css = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Modify GameInfo.tsx: Accept isAutoPlay and onToggleAuto, render Auto button in status-bar
with open(game_info_tsx, 'r', encoding='utf-8') as file:
    content = file.read()

# Add to props interface
old_interface = """    onSurrender?: () => void;
    isPremium?: boolean; // Prop named isPremium to match App.tsx usage
}"""

new_interface = """    onSurrender?: () => void;
    isPremium?: boolean; // Prop named isPremium to match App.tsx usage
    isAutoPlay?: boolean;
    onToggleAuto?: () => void;
}"""

content = content.replace(old_interface, new_interface)

# Add to destructuring args
old_destruct = """    onSurrender,
    isPremium = false
}) => {"""

new_destruct = """    onSurrender,
    isPremium = false,
    isAutoPlay = false,
    onToggleAuto
}) => {"""

content = content.replace(old_destruct, new_destruct)

# Insert Auto Button next to Cancel/Surrender button in YOUR TURN bar
old_turn_bar = """                            {onSurrender && (
                                <button className="surrender-btn" onClick={onSurrender}>
                                    Cancel
                                </button>
                            )}"""

new_turn_bar = """                            {isPremium && onToggleAuto && (
                                <button
                                    className={`auto-toggle-btn ${isAutoPlay ? 'active' : ''}`}
                                    onClick={onToggleAuto}
                                    style={{
                                        marginRight: '8px',
                                        padding: '4px 10px',
                                        fontSize: '0.75rem',
                                        borderRadius: '8px',
                                        background: isAutoPlay ? '#ff3366' : '#555',
                                        color: '#fff',
                                        border: isAutoPlay ? '1px solid #fff' : 'none',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        boxShadow: isAutoPlay ? '0 0 8px rgba(255, 51, 102, 0.4)' : 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    AUTO: {isAutoPlay ? 'ON' : 'OFF'}
                                </button>
                            )}
                            {onSurrender && (
                                <button className="surrender-btn" onClick={onSurrender}>
                                    Cancel
                                </button>
                            )}"""

content = content.replace(old_turn_bar, new_turn_bar)

with open(game_info_tsx, 'w', encoding='utf-8') as file:
    file.write(content)
print("Success: Updated GameInfo.tsx with Auto toggle button integration.")

# 2. Modify App.tsx: Pass props to GameInfo and delete the old absolute Auto button
with open(app_tsx, 'r', encoding='utf-8') as file:
    content_app = file.read()

# Modify GameInfo instantiation in App.tsx
old_gameinfo_inst = """        <GameInfo
          gameState={gameState}
          isOnlineMode={mode === 'online'}
          playerRole={playerRole}
          playerName={playerName}
          opponentName={opponentName}
          onSurrender={handleSurrender}
          isPremium={isPremium}
        />"""

new_gameinfo_inst = """        <GameInfo
          gameState={gameState}
          isOnlineMode={mode === 'online'}
          playerRole={playerRole}
          playerName={playerName}
          opponentName={opponentName}
          onSurrender={handleSurrender}
          isPremium={isPremium}
          isAutoPlay={isAutoPlay}
          onToggleAuto={() => setIsAutoPlay(!isAutoPlay)}
        />"""

content_app = content_app.replace(old_gameinfo_inst, new_gameinfo_inst)

# Remove the old Auto button block from App.tsx (near L1838)
old_auto_btn_block = """                      {isPremium && (
                        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                          <button
                            className={`btn-secondary ${isAutoPlay ? 'active-auto' : ''}`}
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.8rem',
                              background: isAutoPlay ? '#e91e63' : '#666',
                              color: 'white',
                              border: isAutoPlay ? '2px solid white' : 'none'
                            }}
                            onClick={() => {
                              playClickSound();
                              setIsAutoPlay(!isAutoPlay);
                            }}
                          >
                            <span style={{ marginLeft: '4px' }}>Auto: {isAutoPlay ? 'ON' : 'OFF'}</span>
                          </button>
                        </div>
                      )}"""

content_app = content_app.replace(old_auto_btn_block, "")

with open(app_tsx, 'w', encoding='utf-8') as file:
    file.write(content_app)
print("Success: Updated App.tsx GameInfo props and removed old Auto button block.")

# 3. Modify Board.css: Make board smaller
with open(board_css, 'r', encoding='utf-8') as file:
    content_board = file.read()

content_board = content_board.replace("width: 12.5cqw;", "width: 11cqw !important;")
content_board = content_board.replace("height: 18.75cqw;", "height: 16.5cqw !important;")
content_board = content_board.replace("gap: 2.5cqw;", "gap: 2cqw !important;")
content_board = content_board.replace("padding: 3cqw;", "padding: 2cqw !important;")
content_board = content_board.replace("gap: 1.5cqw;", "gap: 1cqw !important;")

with open(board_css, 'w', encoding='utf-8') as file:
    file.write(content_board)
print("Success: Updated Board.css with smaller board slots.")

# 4. Modify Hand.css & App.css: Remove hand height limit and scale hand cards larger
with open(hand_css, 'r', encoding='utf-8') as file:
    content_hand = file.read()

# Eliminate the height: 50px restriction from hand
content_hand = content_hand.replace("height: 50px;", "min-height: 23cqw !important;")

with open(hand_css, 'w', encoding='utf-8') as file:
    file.write(content_hand)

# Append specific Hand Card override to App.css to scale hand cards up to 14.5cqw
with open(app_css, 'r', encoding='utf-8') as file:
    content_css = file.read()

hand_card_scale_css = """
/* Hand Card Scale Up */
.hand .card {
  width: 14.5cqw !important;
  height: 21.75cqw !important;
}
.hand-card-wrapper {
  margin: 0 1px !important;
}
"""

if "Hand Card Scale Up" not in content_css:
    with open(app_css, 'a', encoding='utf-8') as file:
        file.write(hand_card_scale_css)
    print("Success: Appended Hand Card Scale styles to App.css.")
else:
    print("Warning: Hand Card styles already appended to App.css.")
