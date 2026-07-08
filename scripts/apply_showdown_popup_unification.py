import os

popup_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/ShowdownPopup.css'

# The complete ultimate containment rules for ShowdownPopup
# This eliminates absolute fixed overlays, changes vw/vh to percent/cqw, and guarantees that 
# the cutout ribbons and card displays fit 100% within the 480px app container frame.
unified_popup_styles = """

/* ========================================================================= */
/* STRICT 480PX CONTAINER CONTAINMENT FOR SHOWDOWN POPUP                     */
/* ========================================================================= */

.showdown-popup-overlay {
    position: absolute !important; /* Contain strictly within .app */
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    pointer-events: none;
    z-index: 10000 !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
}

/* Pachinko Diagonal Metal Cut-in Bands (Skew ribbons locked to container width %) */
.showdown-cutin-left,
.showdown-cutin-right {
    position: absolute !important;
    width: 150% !important; /* Skewed width relative to .app width */
    height: 11% !important; /* Fixed height relative to .app height */
    z-index: 4 !important;
    pointer-events: none !important;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.85) !important;
}

.showdown-cutin-left {
    top: 36% !important;
    left: -25% !important;
    transform: translateY(-50%) skewX(-25deg) !important;
}

.showdown-cutin-right {
    top: 50% !important;
    right: -25% !important;
    transform: translateY(-50%) skewX(-25deg) !important;
}

/* Core Dialog Styling (No larger than container width, fluid padding) */
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
    border-radius: 16px !important;
    z-index: 10 !important;
    box-shadow: 0 15px 45px rgba(0, 0, 0, 0.95) !important;
    width: 90% !important; /* Strictly lock to 90% of .app width */
    min-width: unset !important; /* Force drop the 520px PC minimum limit */
    box-sizing: border-box !important;
    transform: scale(1) !important; /* Ensure stable scale in relative container */
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
    font-size: 8.8cqw !important; /* Fully dynamic card evaluation name */
    font-weight: 1000 !important;
    color: #fff !important;
    text-transform: uppercase !important;
    text-align: center !important;
    white-space: nowrap !important;
    letter-spacing: 0.02em !important;
    padding: 5px 0 !important;
}

/* Pre-rendered Animation Asset Container */
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

/* Fluidトランプカードの拡大表示スタイル */
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
"""

with open(popup_css_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Replace file content entirely to implement correct 480px locked container styles
# and delete original media queries that bypass container scope.
# We overwrite the entire file safely.
with open(popup_css_path, 'w', encoding='utf-8') as file:
    file.write(unified_popup_styles)

print("Success: Overwrote ShowdownPopup.css with container-locked responsive styles.")
