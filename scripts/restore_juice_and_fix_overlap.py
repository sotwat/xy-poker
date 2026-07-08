import os

popup_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/ShowdownPopup.css'
shared_board_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/SharedBoard.css'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# 1. Rebuild ShowdownPopup.css: Restore all color/neon glow styling while locking dimensions inside 480px app container.
rich_contained_popup_css = """
/* ========================================================================= */
/* Contained Premium Showdown Popup (Restored Rich Neons & Metalglow)         */
/* ========================================================================= */

.showdown-popup-overlay {
    position: absolute !important; /* Contain strictly within .app container */
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    pointer-events: none;
    z-index: 10000 !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
}

/* Pachinko Diagonal Metal Cut-in Bands (Contained Ribbons) */
.showdown-cutin-left,
.showdown-cutin-right {
    position: absolute !important;
    width: 150% !important; /* locked relative to container width */
    height: 11% !important;
    z-index: 4 !important;
    pointer-events: none !important;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.85) !important;
}

.showdown-cutin-left {
    top: 36% !important;
    left: -25% !important;
    transform: translateY(-50%) skewX(-25deg) !important;
    border-bottom: 4px solid rgba(255, 255, 255, 0.9) !important;
}

.showdown-cutin-right {
    top: 50% !important;
    right: -25% !important;
    transform: translateY(-50%) skewX(-25deg) !important;
    border-top: 4px solid rgba(255, 255, 255, 0.9) !important;
}

/* Metal Gradient Themes (RESTORED ORIGINAL GLOWS) */
.cutin-p1 {
    background: linear-gradient(90deg, #051c30 0%, #0052d4 25%, #00f2fe 50%, #0052d4 75%, #051c30 100%) !important;
}

.cutin-p2 {
    background: linear-gradient(90deg, #2a080c 0%, #b20a2c 25%, #ff0844 50%, #b20a2c 75%, #2a080c 100%) !important;
}

.cutin-draw {
    background: linear-gradient(90deg, #111 0%, #444 25%, #e0e0e0 50%, #888 75%, #111 100%) !important;
}

/* Gold + Player Color Themes for X-Hand (RESTORED ORIGINAL GLOWS) */
.cutin-xhand-p1 {
    background: linear-gradient(90deg, #051c30 0%, #00f2fe 25%, #ffd700 50%, #00f2fe 75%, #051c30 100%) !important;
    border-top: 3px solid #ffd700 !important;
    border-bottom: 5px solid #ffd700 !important;
}

.cutin-xhand-p2 {
    background: linear-gradient(90deg, #2a080c 0%, #ff0844 25%, #ffd700 50%, #ff0844 75%, #2a080c 100%) !important;
    border-top: 5px solid #ffd700 !important;
    border-bottom: 3px solid #ffd700 !important;
}

/* Background Impact Flash */
.showdown-flash {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.7) 40%, rgba(255,255,255,0) 80%);
    z-index: 6;
    pointer-events: none;
    mix-blend-mode: overlay;
}

/* Core Dialog Styling (Fluid size, locked inside container, RESTORED ORIGINAL NEONS) */
.showdown-popup-content {
    position: relative !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(4, 4, 8, 0.96) !important;
    backdrop-filter: blur(12px) !important;
    border: 3px solid #fff !important;
    padding: 20px 15px !important;
    border-radius: 18px !important;
    z-index: 10 !important;
    box-shadow: 0 15px 45px rgba(0, 0, 0, 0.95) !important;
    width: 92% !important; /* Lock inside container */
    min-width: unset !important; /* Kill the 520px limit */
    box-sizing: border-box !important;
}

/* Restored Neon Glowing States matching P1 / P2 / Draw / XHand */
.popup-p1 {
    border-color: #00f2fe !important;
    box-shadow: 0 0 35px rgba(0, 242, 254, 0.5) !important;
}
.popup-p1 .popup-title {
    color: #ffffff !important;
    text-shadow: 0 0 10px #00f2fe, 0 0 25px #0052d4, 0 0 45px #00f2fe !important;
}
.popup-p1 .popup-subtitle {
    color: #00f2fe !important;
    text-shadow: 0 0 8px rgba(0, 242, 254, 0.85) !important;
}

.popup-p2 {
    border-color: #ff0844 !important;
    box-shadow: 0 0 35px rgba(255, 8, 68, 0.5) !important;
}
.popup-p2 .popup-title {
    color: #ffffff !important;
    text-shadow: 0 0 10px #ff0844, 0 0 25px #b20a2c, 0 0 45px #ff0844 !important;
}
.popup-p2 .popup-subtitle {
    color: #ff0844 !important;
    text-shadow: 0 0 8px rgba(255, 8, 68, 0.85) !important;
}

.popup-draw {
    border-color: #cccccc !important;
    box-shadow: 0 0 25px rgba(204, 204, 204, 0.3) !important;
}
.popup-draw .popup-title {
    color: #ffffff !important;
    text-shadow: 0 0 8px #ffffff, 0 0 20px #888888 !important;
}
.popup-draw .popup-subtitle {
    color: #cccccc !important;
}

.popup-xhand-p1 {
    border-color: #ffd700 !important;
    box-shadow: 0 0 45px rgba(255, 215, 0, 0.7), inset 0 0 20px rgba(0, 242, 254, 0.3) !important;
}
.popup-xhand-p1 .popup-title {
    color: #ffffff !important;
    text-shadow: 0 0 10px #ffd700, 0 0 25px #00f2fe, 0 0 45px #ffd700 !important;
}
.popup-xhand-p1 .popup-subtitle {
    color: #ffd700 !important;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.95) !important;
}

.popup-xhand-p2 {
    border-color: #ffd700 !important;
    box-shadow: 0 0 45px rgba(255, 215, 0, 0.7), inset 0 0 20px rgba(255, 8, 68, 0.3) !important;
}
.popup-xhand-p2 .popup-title {
    color: #ffffff !important;
    text-shadow: 0 0 10px #ffd700, 0 0 25px #ff0844, 0 0 45px #ffd700 !important;
}
.popup-xhand-p2 .popup-subtitle {
    color: #ffd700 !important;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.95) !important;
}

/* Fluid typography based on container inline-size (cqw) */
.popup-subtitle {
    font-size: 4.8cqw !important;
    font-weight: 900 !important;
    letter-spacing: 0.15em !important;
    margin-bottom: 8px !important;
    text-transform: uppercase !important;
    text-align: center !important;
}

.popup-title {
    font-weight: 1000 !important;
    text-transform: uppercase !important;
    text-align: center !important;
    white-space: nowrap !important;
    letter-spacing: 0.02em !important;
    padding: 5px 0 !important;
}

/* Dynamic Cards container for showdown popup */
.showdown-cards-container {
    display: flex !important;
    justify-content: center !important;
    gap: 2cqw !important;
    margin-top: 15px !important;
    width: 100% !important;
    box-sizing: border-box !important;
}

.showdown-card-wrapper {
    margin: 0 !important;
}

/* Fluid card sizes */
.showdown-card-wrapper .card {
    width: 14cqw !important;
    height: 21cqw !important;
    border-radius: 6px !important;
    padding: 3px !important;
    box-sizing: border-box !important;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4) !important;
}

.showdown-card-wrapper .card .rank {
    font-size: 2.2cqw !important;
}

.showdown-card-wrapper .card .suit {
    font-size: 2.2cqw !important;
}

.showdown-card-wrapper .card .card-center {
    font-size: 5.5cqw !important;
}

/* Animation assets styling */
.showdown-asset-container {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    margin: 10px 0 !important;
    max-height: 25% !important;
    width: 100% !important;
}

.showdown-asset-effect {
    max-height: 20vh !important;
    max-width: 90% !important;
    object-fit: contain !important;
}
"""

with open(popup_css_path, 'w', encoding='utf-8') as file:
    file.write(rich_contained_popup_css)
print("Success: Restored rich color/neon glows to ShowdownPopup.css and kept container locking.")

# 2. Modify SharedBoard.css: Prevent scale(1.25) on mobile which pushes the board into the hand/controls
with open(shared_board_css_path, 'r', encoding='utf-8') as file:
    content_board = file.read()

# Replace the scale(1.25) translateY(10px) with scale(0.95) to prevent overlapping
old_scale_block = "transform: scale(1.25) translateY(10px);"
new_scale_block = "transform: scale(0.95) translateY(0px) !important; /* Prevent board pushing down into hand */"

if old_scale_block in content_board:
    content_board = content_board.replace(old_scale_block, new_scale_block)
    with open(shared_board_css_path, 'w', encoding='utf-8') as file:
        file.write(content_board)
    print("Success: Prevented scale expansion on SharedBoard.css.")
else:
    print("Warning: Scale target not found in SharedBoard.css.")

# 3. Modify App.css: Add safe separation margin to controls and compress play-area gap
with open(app_css_path, 'r', encoding='utf-8') as file:
    content_app_css = file.read()

# Make play-area gap smaller to keep elements inside screen bounds
content_app_css = content_app_css.replace("gap: 1.5vh;", "gap: 0.5vh !important;")

# Append additional safe separation CSS rules
overlap_prevention_styles = """
/* Board and Hand overlap prevention */
.play-area {
  padding-bottom: 5px !important;
  box-sizing: border-box !important;
}
.controls {
  margin-top: auto !important; /* Push it strictly down */
  position: relative !important;
  z-index: 100 !important;
  box-shadow: 0 -5px 15px rgba(0,0,0,0.3) !important;
}
"""

if "overlap prevention" not in content_app_css:
    with open(app_css_path, 'a', encoding='utf-8') as file:
        file.write(overlap_prevention_styles)
    print("Success: Appended overlap prevention styling to App.css.")
else:
    print("Warning: Overlap styles already in App.css.")
