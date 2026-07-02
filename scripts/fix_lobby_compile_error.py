file_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'

with open(file_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Replace the incorrect state setter with the proper state assignments
old_code = """                                  setMode('online');
                                  setIsOnlineGame(false);
                                  setIsLobbyView(true);"""

new_code = """                                  setMode('online');
                                  setIsOnlineGame(false);
                                  setIsQuickMatch(false);"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(content)
    print("Success: Corrected state setting function logic in App.tsx.")
else:
    # Normalized spacing
    content_norm = content.replace('\r\n', '\n')
    old_code_norm = old_code.replace('\r\n', '\n')
    new_code_norm = new_code.replace('\r\n', '\n')
    if old_code_norm in content_norm:
        content_norm = content_norm.replace(old_code_norm, new_code_norm)
        with open(file_path, 'w', encoding='utf-8') as file:
            file.write(content_norm)
        print("Success: Corrected state setting function logic in App.tsx (normalized).")
    else:
        print("Warning: Target code for fixing compile error could not be found.")
