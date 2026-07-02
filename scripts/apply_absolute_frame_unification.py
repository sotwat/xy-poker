import os

app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

# Absolute frame unification CSS to be appended to App.css
# This forces the .app size to be strictly locked, removes double inner frames of modals,
# and lays out all sub-screens flat on the identical outer canvas to match lobby-home.
frame_unification_styles = """

/* ------------------------------------------------------------- */
/* Ultimate Absolute Frame and Border Unification (Canvas Style) */
/* ------------------------------------------------------------- */

/* Strict Lock on .app Outer Container to prevent any child element from pushing its width/height */
.app {
  width: 100vw !important;
  max-width: 480px !important;
  height: 100dvh !important;
  max-height: 850px !important;
  position: relative !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

/* Force ALL overlays (Lobby, Online Lobby, Skins, Rules, Contact, MyPage, Auth) to have IDENTICAL dimensions and padding */
.lobby-home,
.lobby-container.online-lobby,
.rules-overlay,
.modal-overlay,
.skin-store-overlay,
.mypage-overlay,
.auth-overlay {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 480px !important;
  max-height: 850px !important;
  background: radial-gradient(circle at center, #1b1b2f 0%, #0d0d1a 100%) !important;
  z-index: 2000 !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 12px !important; /* Unified padding for all screens */
  box-sizing: border-box !important;
  overflow: hidden !important;
}

/* Ensure lobby home doesn't get duplicate styling but fits the 12px padding layout */
.lobby-home {
  z-index: 1 !important; /* Keep home under modals */
  padding: 12px !important;
}

/* Eliminate distinct inner glass borders/backgrounds for modals to merge them flat onto the canvas outer frame */
.rules-content,
.contact-modal,
.skin-store-modal,
.mypage-content,
.auth-modal {
  flex: 1 !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
  background: none !important; /* Remove inner card background */
  backdrop-filter: none !important; /* Remove blur to keep flat canvas feel */
  border: none !important; /* Remove inner border to eliminate double frame size mismatch */
  box-shadow: none !important;
  padding: 0 !important; /* Inner elements space flatly on overlay padding */
  margin: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  overflow: hidden !important; /* Handled by scrollable sub-components */
}

/* Header Titles - Uniform style matching the top header bar concept */
.rules-content h2,
.contact-modal h2,
.contact-modal h3,
.store-header h2,
.mypage-header .username,
.auth-modal h2 {
  font-size: 1.15rem !important;
  font-weight: 800 !important;
  color: #ff3366 !important;
  letter-spacing: 0.05em !important;
  margin: 0 !important;
  margin-top: 15px !important; /* Give spacing for safe area at top */
  text-transform: uppercase !important;
  border-bottom: 2px solid rgba(255, 51, 102, 0.2) !important;
  padding-bottom: 8px !important;
  text-align: left !important;
}

/* Correct scroll containers inside modals so they don't break outer box height */
.rules-scroll-area,
.mypage-body,
.skins-grid,
.contact-modal form {
  flex: 1 !important;
  overflow-y: auto !important;
  padding-right: 4px !important;
  box-sizing: border-box !important;
}

/* Hide top-right close crosses completely */
.rules-content .close-btn,
.contact-modal .close-btn,
.skin-store-modal .btn-close-x,
.mypage-content .close-btn {
  display: none !important;
}

/* Global Unified Bottom Close Buttons (Placed consistently at the very bottom of the outer overlay space) */
.btn-close,
.rules-close-btn,
.rules-overlay .btn-secondary,
.contact-modal form .btn-secondary,
.mypage-footer button,
.auth-modal .btn-secondary {
  background: linear-gradient(135deg, #ff3366 0%, #ff0055 100%) !important; /* Red/pink premium theme */
  border: 1px solid #fff !important;
  border-radius: 12px !important;
  color: #fff !important;
  font-size: 0.9rem !important;
  font-weight: bold !important;
  padding: 12px !important;
  width: 100% !important;
  cursor: pointer !important;
  margin-top: 10px !important; /* Separation space */
  box-shadow: 0 4px 15px rgba(255, 51, 102, 0.3) !important;
  transition: all 0.2s !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
}

.btn-close:hover,
.rules-close-btn:hover,
.rules-overlay .btn-secondary:hover,
.contact-modal form .btn-secondary:hover,
.mypage-footer button:hover,
.auth-modal .btn-secondary:hover {
  background: linear-gradient(135deg, #ff5588 0%, #ff2277 100%) !important;
  transform: translateY(-2px) !important;
}

.btn-close:active,
.rules-close-btn:active {
  transform: translateY(0px) !important;
}
"""

with open(app_css_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Append the absolute frame unification styles
if "Ultimate Absolute Frame and Border Unification" not in content:
    with open(app_css_path, 'a', encoding='utf-8') as file:
        file.write(frame_unification_styles)
    print("Success: Appended ultimate frame unification styles to App.css.")
else:
    # If already exists, replace it with updated version
    print("Warning: Already appended. Overwriting with the updated styles.")
    # For safety, let's just append it again at the very end to guarantee override
    with open(app_css_path, 'a', encoding='utf-8') as file:
        file.write(frame_unification_styles)
