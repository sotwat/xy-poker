import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'

with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Target player name container inside lobby-top-bar to add the version badge
old_name_section = """                            <div className="player-meta-info" style={{ marginLeft: '12px', flex: 1, textAlign: 'left' }}>
                              <span className="player-display-name">{playerName || 'Guest'}</span>
                              <span className="player-display-id">ID: {session?.user?.id?.slice(0, 8) || 'GuestID'}</span>
                            </div>"""

new_name_section = """                            <div className="player-meta-info" style={{ marginLeft: '12px', flex: 1, textAlign: 'left' }}>
                              <span className="player-display-name">
                                {playerName || 'Guest'}
                                <span className="lobby-version-badge" style={{ marginLeft: '6px', fontSize: '0.62rem', background: 'rgba(255,255,255,0.15)', padding: '2px 5px', borderRadius: '4px', color: '#ccc', fontWeight: 'normal', verticalAlign: 'middle', border: '1px solid rgba(255,255,255,0.1)' }}>
                                  v07081737
                                </span>
                              </span>
                              <span className="player-display-id">ID: {session?.user?.id?.slice(0, 8) || 'GuestID'}</span>
                            </div>"""

if old_name_section in content:
    content = content.replace(old_name_section, new_name_section)
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content)
    print("Success: Appended lobby version badge to App.tsx.")
else:
    # Try normalized spacing
    content_norm = content.replace('\r\n', '\n')
    old_name_section_norm = old_name_section.replace('\r\n', '\n')
    new_name_section_norm = new_name_section.replace('\r\n', '\n')
    if old_name_section_norm in content_norm:
        content_new = content_norm.replace(old_name_section_norm, new_name_section_norm)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_new)
        print("Success: Appended lobby version badge to App.tsx (normalized).")
    else:
        print("Error: Could not locate the target meta info block in App.tsx.")
