import os

app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'

modal_unification_styles = """

/* ------------------------------------------------------------- */
/* Global Design System - Modal Overlay Size & Style Unification */
/* ------------------------------------------------------------- */

/* 1. Modal Overlays Absolute containment (Forces matching .app dimension) */
.rules-overlay,
.modal-overlay,
.skin-store-overlay,
.mypage-overlay {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: radial-gradient(circle at center, #1b1b2f 0%, #0d0d1a 100%) !important;
  z-index: 2000 !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 16px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  animation: modalFadeIn 0.2s ease-out !important;
}

@keyframes modalFadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

/* 2. Glassmorphism Content Panels unification */
.rules-content,
.contact-modal,
.skin-store-modal,
.mypage-content,
.auth-modal {
  flex: 1 !important;
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(8px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 20px !important;
  padding: 16px !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  overflow-y: auto !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* 3. Header title style unification */
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
  text-transform: uppercase !important;
  border-bottom: 2px solid rgba(255, 51, 102, 0.2) !important;
  padding-bottom: 6px !important;
  text-align: left !important;
}

/* 4. Hide redundant top-right close-x buttons (Use bottom unified Close/Back button) */
.rules-content .close-btn,
.contact-modal .close-btn,
.skin-store-modal .btn-close-x,
.mypage-content .close-btn {
  display: none !important;
}

/* 5. Standardized Unified Bottom Close Button */
.btn-close,
.rules-overlay .btn-secondary,
.contact-modal form .btn-secondary,
.mypage-footer button,
.auth-modal .btn-secondary,
.modal-actions button:first-child {
  background: linear-gradient(135deg, #333 0%, #111 100%) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  border-radius: 10px !important;
  color: #ff3366 !important;
  font-size: 0.85rem !important;
  font-weight: bold !important;
  padding: 10px !important;
  width: 100% !important;
  cursor: pointer !important;
  margin-top: auto !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2) !important;
  transition: all 0.2s !important;
}

.btn-close:hover,
.rules-overlay .btn-secondary:hover,
.contact-modal form .btn-secondary:hover,
.mypage-footer button:hover,
.auth-modal .btn-secondary:hover {
  background: linear-gradient(135deg, #444 0%, #222 100%) !important;
  transform: translateY(-2px) !important;
}
"""

with open(app_css_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Only append if not already appended
if "Global Design System - Modal Overlay Size & Style Unification" not in content:
    with open(app_css_path, 'a', encoding='utf-8') as file:
        file.write(modal_unification_styles)
    print("Success: Appended modal unification styles to App.css.")
else:
    print("Warning: Modal unification styles already present in App.css.")
