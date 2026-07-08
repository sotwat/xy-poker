import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'
gameresult_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/GameResult.css'

# 1. Modify App.tsx: Replace player-rank-badge with player-rating-badge and remove the redundant rating-resource-box
with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content_tsx = file.read()

old_top_bar = """                          {/* Top Status Panel (Glassmorphic Resource Panel) */}
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
                          </div>"""

new_top_bar = """                          {/* Top Status Panel (Glassmorphic Resource Panel - Rating Focus) */}
                          <div className="lobby-top-bar">
                            <div className="player-rating-badge">
                              <span className="rating-label">RATE</span>
                              <span className="rating-value">{myRating || 1500}</span>
                            </div>
                            <div className="player-meta-info" style={{ marginLeft: '12px', flex: 1, textAlign: 'left' }}>
                              <span className="player-display-name">{playerName || 'Guest'}</span>
                              <span className="player-display-id">ID: {session?.user?.id?.slice(0, 8) || 'GuestID'}</span>
                            </div>
                          </div>"""

if old_top_bar in content_tsx:
    content_tsx = content_tsx.replace(old_top_bar, new_top_bar)
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_tsx)
    print("Success: Updated top bar rating display in App.tsx.")
else:
    # Try normalized spacing
    content_tsx_norm = content_tsx.replace('\r\n', '\n')
    old_top_bar_norm = old_top_bar.replace('\r\n', '\n')
    new_top_bar_norm = new_top_bar.replace('\r\n', '\n')
    if old_top_bar_norm in content_tsx_norm:
        content_tsx_norm = content_tsx_norm.replace(old_top_bar_norm, new_top_bar_norm)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_tsx_norm)
        print("Success: Updated top bar rating display in App.tsx (normalized).")
    else:
        print("Warning: Could not find lobby-top-bar block in App.tsx.")

# 2. Modify App.css: Add styling for .player-rating-badge to display rate values elegantly
with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

rating_badge_styles = """
/* Rating Badge (Replaces Rank Badge) */
.player-rating-badge {
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  border: 2px solid #fff;
  border-radius: 12px;
  min-width: 60px;
  height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
  padding: 0 6px;
  box-sizing: border-box;
}

.rating-label {
  font-size: 0.55rem;
  color: #111;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.05em;
}

.rating-value {
  font-size: 0.95rem;
  color: #111;
  font-weight: 900;
  line-height: 1.1;
}
"""

if "player-rating-badge" not in content_css:
    with open(app_css_path, 'a', encoding='utf-8') as file:
        file.write(rating_badge_styles)
    print("Success: Appended player-rating-badge styles to App.css.")
else:
    print("Warning: player-rating-badge styles already present in App.css.")

# 3. Modify GameResult.css: Confine .game-result-overlay inside .app strictly and align styling
with open(gameresult_css_path, 'r', encoding='utf-8') as file:
    content_result = file.read()

result_unification_styles = """

/* --- Premium Structural Unification (Game Result Containment) --- */
.game-result-overlay {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: radial-gradient(circle at center, #1b1b2f 0%, #0d0d1a 100%) !important;
    z-index: 2500 !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 12px !important; /* Unified padding matching other overlays */
    box-sizing: border-box !important;
    overflow: hidden !important;
}

.game-result-modal {
    flex: 1 !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    background: none !important; /* Flat canvas structure */
    backdrop-filter: none !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    overflow-y: auto !important; /* Ensure internal scrolling on small screens */
    box-sizing: border-box !important;
}

/* Scroll area container inside result modal */
.results-table {
    overflow-y: auto !important;
    max-height: 250px !important; /* Prevent table from pushing buttons out of view */
}

/* Button Group Styling Unification */
.button-group {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    width: 100% !important;
    margin-top: auto !important; /* Always push to bottom */
}

.button-group button {
    width: 100% !important;
    padding: 12px !important;
    border-radius: 12px !important;
    font-weight: bold !important;
    font-size: 0.9rem !important;
    cursor: pointer !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    transition: all 0.2s !important;
    margin: 0 !important;
}

/* Play Again Button (Red Gradient) */
.button-group .restart-btn {
    background: linear-gradient(135deg, #ff3366 0%, #ff0055 100%) !important;
    border: 1px solid #fff !important;
    color: #fff !important;
    box-shadow: 0 4px 15px rgba(255, 51, 102, 0.3) !important;
}

.button-group .restart-btn:hover {
    background: linear-gradient(135deg, #ff5588 0%, #ff2277 100%) !important;
    transform: translateY(-2px) !important;
}

/* Secondary Actions (Dark Style) */
.button-group .view-board-btn,
.button-group .quit-btn {
    background: linear-gradient(135deg, #333 0%, #111 100%) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    color: #ff3366 !important;
}

.button-group .view-board-btn:hover,
.button-group .quit-btn:hover {
    background: linear-gradient(135deg, #444 0%, #222 100%) !important;
    transform: translateY(-2px) !important;
}
"""

if "Premium Structural Unification" not in content_result:
    with open(gameresult_css_path, 'a', encoding='utf-8') as file:
        file.write(result_unification_styles)
    print("Success: Unified GameResult styling and containment in GameResult.css.")
else:
    print("Warning: GameResult styles already unified in GameResult.css.")

