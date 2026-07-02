import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'
mypage_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/MyPage.tsx'

# 1. Modify App.tsx: Add Profile tab to the footer (5 tabs total)
with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content_app = file.read()

old_footer_tabs = """                          {/* Footer Tab Navigation Bar (All English) */}
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
                          </div>"""

new_footer_tabs = """                          {/* Footer Tab Navigation Bar (All English - 5 Tabs) */}
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
                                setShowMyPage(true);
                              }}
                            >
                              <span className="tab-icon">👤</span>
                              <span className="tab-label">Profile</span>
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
                          </div>"""

if old_footer_tabs in content_app:
    content_app = content_app.replace(old_footer_tabs, new_footer_tabs)
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_app)
    print("Success: Appended Profile tab to App.tsx.")
else:
    # Try normalized spacing
    content_app_norm = content_app.replace('\r\n', '\n')
    old_footer_tabs_norm = old_footer_tabs.replace('\r\n', '\n')
    new_footer_tabs_norm = new_footer_tabs.replace('\r\n', '\n')
    if old_footer_tabs_norm in content_app_norm:
        content_app_norm = content_app_norm.replace(old_footer_tabs_norm, new_footer_tabs_norm)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_app_norm)
        print("Success: Appended Profile tab to App.tsx (normalized).")
    else:
        print("Warning: Could not find footer tabs block in App.tsx.")

# 2. Modify App.css: Set lobby-footer-tabs column layout from repeat(4, 1fr) to repeat(5, 1fr)
with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

# Replace column layout for footer tabs
content_css = content_css.replace("grid-template-columns: repeat(4, 1fr);", "grid-template-columns: repeat(5, 1fr) !important;")

with open(app_css_path, 'w', encoding='utf-8') as file:
    file.write(content_css)
print("Success: Extended App.css footer layout to 5 grid columns.")

# 3. Modify MyPage.tsx: Make Sign Out button look clean and styled, separate it from close logic
with open(mypage_tsx_path, 'r', encoding='utf-8') as file:
    content_mypage = file.read()

old_mypage_footer = """                <div className="mypage-footer" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px', display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={() => {
                            supabase.auth.signOut();
                            onClose();
                        }}
                        style={{
                            padding: '8px 16px',
                            background: '#ff4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        Sign Out
                    </button>
                </div>"""

# Replace it with a unified custom action button style and remove inline hardcoded colors
new_mypage_footer = """                <div className="mypage-footer" style={{ marginTop: 'auto', display: 'flex', gap: '10px', width: '100%' }}>
                    <button
                        className="btn-sign-out"
                        onClick={() => {
                            supabase.auth.signOut();
                            onClose();
                        }}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: 'linear-gradient(135deg, #555 0%, #222 100%)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '12px',
                            color: '#ccc',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                        }}
                    >
                        Sign Out
                    </button>
                    <button className="btn-close" onClick={onClose} style={{ flex: 1, margin: 0 }}>Close</button>
                </div>"""

if old_mypage_footer in content_mypage:
    content_mypage = content_mypage.replace(old_mypage_footer, new_mypage_footer)
    with open(mypage_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_mypage)
    print("Success: Refactored MyPage.tsx footer buttons.")
else:
    # Try normalized spacing
    content_mypage_norm = content_mypage.replace('\r\n', '\n')
    old_mypage_footer_norm = old_mypage_footer.replace('\r\n', '\n')
    new_mypage_footer_norm = new_mypage_footer.replace('\r\n', '\n')
    if old_mypage_footer_norm in content_mypage_norm:
        content_mypage_norm = content_mypage_norm.replace(old_mypage_footer_norm, new_mypage_footer_norm)
        with open(mypage_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_mypage_norm)
        print("Success: Refactored MyPage.tsx footer buttons (normalized).")
    else:
        print("Warning: Target mypage-footer block not found in MyPage.tsx.")
