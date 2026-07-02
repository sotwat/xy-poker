import os

lobby_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Lobby.tsx'
app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'

# 1. Read and clean Lobby.tsx
with open(lobby_tsx_path, 'r', encoding='utf-8') as file:
    content_lobby = file.read()

# Remove from interface LobbyProps
old_interface = """    rating?: number | null;
    onShowRules: () => void;
    onShowMyPage: () => void;
    onBack?: () => void;"""

new_interface = """    rating?: number | null;
    onBack?: () => void;"""

if old_interface in content_lobby:
    content_lobby = content_lobby.replace(old_interface, new_interface)

# Remove from destructuring arguments
old_args = """    rating,
    onShowRules,
    onShowMyPage,
    onBack"""

new_args = """    rating,
    onBack"""

if old_args in content_lobby:
    content_lobby = content_lobby.replace(old_args, new_args)

with open(lobby_tsx_path, 'w', encoding='utf-8') as file:
    file.write(content_lobby)

print("Success: Removed unused rule/mypage props from Lobby.tsx.")

# 2. Read and clean App.tsx
with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content_app = file.read()

# Remove props from Lobby instantiation in App.tsx
old_app_props = """              playerName={playerName}
              onPlayerNameChange={setPlayerName}
              rating={myRating}
              onShowRules={() => { playClickSound(); setShowRules(true); }}
              onShowMyPage={() => { playClickSound(); setShowMyPage(true); }}
              onBack={() => {"""

new_app_props = """              playerName={playerName}
              onPlayerNameChange={setPlayerName}
              rating={myRating}
              onBack={() => {"""

if old_app_props in content_app:
    content_app = content_app.replace(old_app_props, new_app_props)
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_app)
    print("Success: Removed unused rule/mypage props from App.tsx.")
else:
    # Normalized spacing
    content_app_norm = content_app.replace('\r\n', '\n')
    old_app_props_norm = old_app_props.replace('\r\n', '\n')
    new_app_props_norm = new_app_props.replace('\r\n', '\n')
    if old_app_props_norm in content_app_norm:
        content_app_norm = content_app_norm.replace(old_app_props_norm, new_app_props_norm)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_app_norm)
        print("Success: Removed unused props in App.tsx (normalized).")
    else:
        print("Warning: Target props not found in App.tsx.")

