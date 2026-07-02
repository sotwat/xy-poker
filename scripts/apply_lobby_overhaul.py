import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Read and modify App.tsx
with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content_tsx = file.read()

# Locate the old menu block under phase === 'setup'
# We will target the entire section inside the else: (not matching isQuickMatch)
old_menu_block = """                        <div className="logo-area">
                          <h1>XY Poker</h1>
                          <p>Strategic Card & Dice Battle</p>
                        </div>
                        <div className="setup-actions">
                          <button className="btn-primary" onClick={() => {
                            setIsAutoPlay(false); // Ensure Auto is OFF when manually starting
                            handleStartGame();
                          }}>
                            Start Game
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ marginTop: '1rem', padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => { playClickSound(); setShowSkinStore(true); }}
                          >
                            🎨 Skin Shop
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ marginTop: '1rem', marginLeft: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => { playClickSound(); setShowRules(true); }}
                          >
                            📖 Rules
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ marginTop: '1rem', marginLeft: '10px', padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => { playClickSound(); setShowContactModal(true); }}
                          >
                            📬 Report
                          </button>
                        </div>
                        <div className="beta-disclaimer" style={{
                          marginTop: '2rem',
                          padding: '10px',
                          border: '1px solid #ffcc00',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(255, 204, 0, 0.1)',
                          fontSize: '0.8rem',
                          color: '#ffcc00',
                          maxWidth: '90%',
                          textAlign: 'center'
                        }}>
                          <strong>⚠️ Development Build</strong><br />
                          This game is currently in active development.<br />
                          Please note that data loss or critical bugs may occur.<br />
                          We recommend playing in <strong>fullscreen mode</strong> for the best experience.<br />
                          If you encounter any issues, please let us know via the <a href="https://docs.google.com/forms/d/e/1FAIpQLSf0wN38p8p3iA63j27Z2F1RjLwQjVnJ-2H_a8V57mO3W5J52g/viewform" target="_blank" rel="noopener noreferrer" style={{ color: '#ffcc00', textDecoration: 'underline' }}>Report form</a>.
                        </div>"""

new_menu_block = """                        <div className="lobby-home">
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
                        </div>"""

if old_menu_block in content_tsx:
    content_tsx = content_tsx.replace(old_menu_block, new_menu_block)
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_tsx)
    print("Success: App.tsx lobby screen replaced.")
else:
    # Try normalized spacing
    content_tsx_norm = content_tsx.replace('\r\n', '\n')
    old_menu_block_norm = old_menu_block.replace('\r\n', '\n')
    new_menu_block_norm = new_menu_block.replace('\r\n', '\n')
    if old_menu_block_norm in content_tsx_norm:
        content_tsx_norm = content_tsx_norm.replace(old_menu_block_norm, new_menu_block_norm)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_tsx_norm)
        print("Success: App.tsx lobby screen replaced (normalized).")
    else:
        print("Error: Could not locate old lobby menu block in App.tsx.")

# 2. Append Premium Styles to App.css
lobby_styles = """

/* ======================================================= */
/* Premium Mobile-Game Style Lobby Overhaul (World Flipper) */
/* ======================================================= */

.lobby-home {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  background: radial-gradient(circle at center, #1b1b2f 0%, #0d0d1a 100%);
  padding: 8px;
}

/* 1. Top Status/Resource Bar */
.lobby-top-bar {
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
}

.player-rank-badge {
  background: linear-gradient(135deg, #ff3366, #ff0055);
  border: 2px solid #fff;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-shadow: 0 0 10px rgba(255, 51, 102, 0.6);
}

.rank-label {
  font-size: 0.5rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 800;
  line-height: 1;
}

.rank-value {
  font-size: 1.1rem;
  color: #fff;
  font-weight: 900;
  line-height: 1;
}

.player-meta-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.player-display-name {
  font-size: 0.95rem;
  color: #fff;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.player-display-id {
  font-size: 0.65rem;
  color: #aaa;
}

.rating-resource-box {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.resource-icon {
  font-size: 0.9rem;
}

.resource-value {
  font-size: 0.9rem;
  color: #ffd700;
  font-weight: bold;
}

/* 2. Character & Speech Bubble Area */
.lobby-character-area {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  margin-top: 10px;
}

.lobby-character-image {
  height: 380px;
  object-fit: contain;
  z-index: 2;
  pointer-events: none;
  animation: float-character 6s ease-in-out infinite;
  filter: drop-shadow(0 15px 25px rgba(0, 0, 0, 0.6));
}

@keyframes float-character {
  0% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(0.5deg); }
  100% { transform: translateY(0px) rotate(0deg); }
}

.speech-bubble {
  position: absolute;
  top: 15px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 10px 14px;
  width: 85%;
  box-sizing: border-box;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  z-index: 5;
  border: 2px solid #ff3366;
}

.speech-bubble::after {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 10px 10px 0;
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.95) transparent;
  display: block;
  width: 0;
}

.speaker-name {
  font-size: 0.65rem;
  color: #ff3366;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: 2px;
  letter-spacing: 0.05em;
}

.speech-text {
  font-size: 0.75rem;
  color: #1a1a2e;
  margin: 0;
  line-height: 1.3;
  font-weight: 600;
  text-align: left;
}

/* 3. Bottom Actions Quest Buttons */
.lobby-actions-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 0 8px;
  box-sizing: border-box;
  z-index: 10;
  margin-bottom: 70px; /* Space for fixed navigation tabs */
}

/* Giant Main Quest Button (Tilted & Pulsing) */
.quest-btn-primary {
  width: 100%;
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 50%, #800000 100%);
  border: 3px solid #ffd700;
  border-radius: 12px;
  color: #fff;
  padding: 14px 20px;
  cursor: pointer;
  box-shadow: 0 5px 15px rgba(211, 47, 47, 0.4), inset 0 0 15px rgba(255, 215, 0, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
  transform: skewX(-4deg);
}

.quest-btn-primary:hover {
  transform: skewX(-4deg) scale(1.02);
  box-shadow: 0 8px 25px rgba(211, 47, 47, 0.6), inset 0 0 25px rgba(255, 215, 0, 0.4);
}

.quest-btn-primary:active {
  transform: skewX(-4deg) scale(0.98);
}

.quest-tag {
  font-size: 0.65rem;
  font-weight: 800;
  color: #ffd700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.quest-title {
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-shadow: 0 2px 4px rgba(0,0,0,0.6);
}

.sub-battle-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.quest-btn-secondary {
  background: linear-gradient(135deg, #1f4068 0%, #162447 100%);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  color: #fff;
  padding: 10px;
  font-size: 0.8rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.quest-btn-secondary:hover {
  background: linear-gradient(135deg, #3282b8 0%, #1f4068 100%);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-2px);
}

/* 4. Footer Tab Bar Navigation */
.lobby-footer-tabs {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: rgba(18, 18, 30, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1.5px solid rgba(255, 255, 255, 0.1);
  padding: 6px 0;
  z-index: 20;
}

.tab-item {
  background: none;
  border: none;
  color: #777;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-icon {
  font-size: 1.1rem;
}

.tab-label {
  font-size: 0.6rem;
  font-weight: bold;
}

.tab-item:hover,
.tab-item.active {
  color: #ff3366;
}

.tab-item.active .tab-icon {
  transform: scale(1.1);
  text-shadow: 0 0 10px rgba(255, 51, 102, 0.5);
}
"""

with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

# Only append if not already appended
if "Premium Mobile-Game Style Lobby Overhaul" not in content_css:
    with open(app_css_path, 'a', encoding='utf-8') as file:
        file.write(lobby_styles)
    print("Success: Appended lobby styles to App.css.")
else:
    print("Warning: Lobby styles already present in App.css.")
