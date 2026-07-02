import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'

with open(app_tsx_path, 'r', encoding='utf-8') as file:
    lines = file.readlines()

# Target line indices based on viewed file lines
# Line 1615 (1-based) is index 1614: "                      <>\n"
# Line 1674 (1-based) is index 1673: "                      </>\n"
# Let's verify the content at index 1614 and find the closing tag

start_idx = -1
end_idx = -1

for idx, line in enumerate(lines):
    if idx >= 1600 and idx <= 1625:
        if "<>" in line and "                      <>" in line:
            start_idx = idx
            break

if start_idx != -1:
    # Now find the matching closing tag </>, which should be around index 1673
    for idx in range(start_idx + 1, len(lines)):
        if "</>" in lines[idx] and "                      </>" in lines[idx]:
            end_idx = idx
            break

if start_idx != -1 and end_idx != -1:
    new_html = """                        <div className="lobby-home">
                          {/* Top Status Panel (Glassmorphic Resource Panel) */}
                          <div className="lobby-top-bar">
                            <div className="player-rank-badge">
                              <span className="rank-label">RANK</span>
                              <span className="rank-value">{myRating ? Math.floor(myRating / 100) : 15}</span>
                            </div>
                            <div className="player-meta-info">
                              <span className="player-display-name">{playerName || 'Guest'}</span>
                              <span className="player-display-id">ID: {session?.user?.id?.slice(0, 8) || 'GuestID'}</span>
                            </div>
                            <div className="rating-resource-box">
                              <span className="resource-icon">🏆</span>
                              <span className="resource-value">{myRating || 1500}</span>
                            </div>
                          </div>

                          {/* Central Character & Interactive Dialog Area */}
                          <div className="lobby-character-area">
                            <div className="speech-bubble">
                              <div className="speaker-name">Queen of Hearts</div>
                              <p className="speech-text">
                                XY Pokerへようこそ。カードとダイスの配置が勝負の鍵よ。まずはAI対戦で腕を磨きなさい。
                              </p>
                            </div>
                            <img 
                              src="/assets/images/lobby_character.png" 
                              alt="Queen of Hearts" 
                              className="lobby-character-image"
                            />
                          </div>

                          {/* Action Panel: Main Quest and Support Battles */}
                          <div className="lobby-actions-panel">
                            <button 
                              className="quest-btn-primary" 
                              onClick={() => {
                                setIsAutoPlay(false);
                                playClickSound();
                                handleStartGame();
                              }}
                            >
                              <span className="quest-tag">Local Quest</span>
                              <span className="quest-title">Local Match (vs AI)</span>
                            </button>

                            <div className="sub-battle-actions">
                              <button 
                                className="quest-btn-secondary" 
                                onClick={() => {
                                  playClickSound();
                                  setMode('online');
                                  setIsOnlineGame(false);
                                  setIsLobbyView(true);
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
                            </div>
                          </div>

                          {/* Footer Tab Navigation Bar */}
                          <div className="lobby-footer-tabs">
                            <button className="tab-item active" onClick={() => playClickSound()}>
                              <span className="tab-icon">🏠</span>
                              <span className="tab-label">ホーム</span>
                            </button>
                            <button 
                              className="tab-item" 
                              onClick={() => {
                                playClickSound();
                                setShowSkinStore(true);
                              }}
                            >
                              <span className="tab-icon">🎨</span>
                              <span className="tab-label">ショップ</span>
                            </button>
                            <button 
                              className="tab-item" 
                              onClick={() => {
                                playClickSound();
                                setShowRules(true);
                              }}
                            >
                              <span className="tab-icon">📖</span>
                              <span className="tab-label">ルール</span>
                            </button>
                            <button 
                              className="tab-item" 
                              onClick={() => {
                                playClickSound();
                                setShowContactModal(true);
                              }}
                            >
                              <span className="tab-icon">📬</span>
                              <span className="tab-label">報告</span>
                            </button>
                          </div>
                        </div>
"""
    # Replace the lines slice with the new HTML content
    lines[start_idx:end_idx + 1] = [new_html]
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.writelines(lines)
    print(f"Success: Lobby HTML successfully replaced from line {start_idx + 1} to {end_idx + 1}.")
else:
    print(f"Error: Indices could not be determined. start_idx={start_idx}, end_idx={end_idx}")
