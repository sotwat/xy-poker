import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Modify App.tsx: Remove speech bubble, convert all text to English, prevent wrapping
with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content_tsx = file.read()

# Locate the lobby-home block inside App.tsx and replace it with clean English and no speech bubble
old_lobby_home = """                        <div className="lobby-home">
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
                        </div>"""

new_lobby_home = """                        <div className="lobby-home">
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

                          {/* Central Character Standee (No speech bubble, fully visible) */}
                          <div className="lobby-character-area">
                            <img 
                              src="/assets/images/lobby_character.png" 
                              alt="Queen of Hearts" 
                              className="lobby-character-image"
                            />
                          </div>

                          {/* Action Panel: Main Quest and Support Battles (Clean English, No wrap) */}
                          <div className="lobby-actions-panel">
                            <button 
                              className="quest-btn-primary" 
                              onClick={() => {
                                setIsAutoPlay(false);
                                playClickSound();
                                handleStartGame();
                              }}
                            >
                              <span className="quest-tag">SINGLE PLAY</span>
                              <span className="quest-title">Local Match (vs AI)</span>
                            </button>

                            <div className="sub-battle-actions">
                              <button 
                                className="quest-btn-secondary" 
                                style={{ width: '100%', whiteSpace: 'nowrap' }}
                                onClick={() => {
                                  playClickSound();
                                  setMode('online');
                                  setIsOnlineGame(false);
                                  setIsQuickMatch(false);
                                }}
                              >
                                ⚔️ Online Match
                              </button>
                            </div>
                          </div>

                          {/* Footer Tab Navigation Bar (All English) */}
                          <div className="lobby-footer-tabs">
                            <button className="tab-item active" onClick={() => playClickSound()}>
                              <span className="tab-icon">🏠</span>
                              <span className="tab-label">Home</span>
                            </button>
                            <button 
                              className="tab-item" 
                              onClick={() => {
                                playClickSound();
                                setShowSkinStore(true);
                              }}
                            >
                              <span className="tab-icon">🎨</span>
                              <span className="tab-label">Skins</span>
                            </button>
                            <button 
                              className="tab-item" 
                              onClick={() => {
                                playClickSound();
                                setShowRules(true);
                              }}
                            >
                              <span className="tab-icon">📖</span>
                              <span className="tab-label">Rules</span>
                            </button>
                            <button 
                              className="tab-item" 
                              onClick={() => {
                                playClickSound();
                                setShowContactModal(true);
                              }}
                            >
                              <span className="tab-icon">📬</span>
                              <span className="tab-label">Report</span>
                            </button>
                          </div>
                        </div>"""

if old_lobby_home in content_tsx:
    content_tsx = content_tsx.replace(old_lobby_home, new_lobby_home)
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_tsx)
    print("Success: App.tsx lobby overhaul text cleaned and English conversion applied.")
else:
    # Try normalized spacing
    content_tsx_norm = content_tsx.replace('\r\n', '\n')
    old_lobby_home_norm = old_lobby_home.replace('\r\n', '\n')
    new_lobby_home_norm = new_lobby_home.replace('\r\n', '\n')
    if old_lobby_home_norm in content_tsx_norm:
        content_tsx_norm = content_tsx_norm.replace(old_lobby_home_norm, new_lobby_home_norm)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_tsx_norm)
        print("Success: App.tsx lobby overhaul text cleaned and English conversion applied (normalized).")
    else:
        print("Error: Could not locate old lobby home block in App.tsx.")

# 2. Modify App.css to reduce vertical spacing and increase character image scale slightly
with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

# Update character area styles to reduce padding, margins and grow standee slightly
old_char_styles = """.lobby-character-image {
  height: 380px;
  object-fit: contain;
  z-index: 2;
  pointer-events: none;
  animation: float-character 6s ease-in-out infinite;
  filter: drop-shadow(0 15px 25px rgba(0, 0, 0, 0.6));
}"""

new_char_styles = """.lobby-character-image {
  height: 440px; /* Scaled up character since bubble is gone */
  object-fit: contain;
  z-index: 2;
  pointer-events: none;
  animation: float-character 6s ease-in-out infinite;
  filter: drop-shadow(0 15px 25px rgba(0, 0, 0, 0.6));
  margin-top: -10px; /* Reduce extra top spacing */
}"""

# Update top bar margin space to pull layout upwards slightly
old_top_bar = """.lobby-top-bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 8px 16px;
  margin-top: 50px; /* Leave space for fullscreen/my page absolute header elements */
  z-index: 10;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}"""

new_top_bar = """.lobby-top-bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 8px 16px;
  margin-top: 25px; /* Pull header closer to top */
  z-index: 10;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}"""

if old_char_styles in content_css:
    content_css = content_css.replace(old_char_styles, new_char_styles)
if old_top_bar in content_css:
    content_css = content_css.replace(old_top_bar, new_top_bar)

with open(app_css_path, 'w', encoding='utf-8') as file:
    file.write(content_css)

print("CSS space adjustments applied successfully.")
