import os

lobby_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Lobby.tsx'
app_css_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.css'
server_index_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/server/index.js'

# 1. Modify Lobby.tsx: Remove the bg character watermark (removes the "shadow character" behind lobby)
with open(lobby_tsx_path, 'r', encoding='utf-8') as file:
    content_lobby = file.read()

bg_char_block = """            {/* Card dealer watermark overlay in background */}
            <div className="online-lobby-bg-character">
                <img src="/assets/images/lobby_character.png" alt="Queen of Hearts" />
            </div>"""

if bg_char_block in content_lobby:
    content_lobby = content_lobby.replace(bg_char_block, "")
    with open(lobby_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_lobby)
    print("Success: Removed bg character watermark from Lobby.tsx.")
else:
    # Try normalized spacing
    content_lobby_norm = content_lobby.replace('\r\n', '\n')
    bg_char_block_norm = bg_char_block.replace('\r\n', '\n')
    if bg_char_block_norm in content_lobby_norm:
        content_lobby_norm = content_lobby_norm.replace(bg_char_block_norm, "")
        with open(lobby_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_lobby_norm)
        print("Success: Removed bg character watermark from Lobby.tsx (normalized).")
    else:
        print("Warning: BG character watermark block not found in Lobby.tsx.")

# 2. Modify App.css: Extend global header hiding to include .online-lobby
with open(app_css_path, 'r', encoding='utf-8') as file:
    content_css = file.read()

old_hide_rule = """.app:has(.lobby-home) .app-header {
  display: none !important;
}"""

new_hide_rule = """.app:has(.lobby-home) .app-header,
.app:has(.online-lobby) .app-header {
  display: none !important;
}"""

if old_hide_rule in content_css:
    content_css = content_css.replace(old_hide_rule, new_hide_rule)
    with open(app_css_path, 'w', encoding='utf-8') as file:
        file.write(content_css)
    print("Success: Updated App.css to hide global header for online lobby too.")
else:
    print("Warning: Old hide rule not found in App.css.")

# 3. Modify server/index.js: Change UUID room ID generator to 4-character random string generator
with open(server_index_path, 'r', encoding='utf-8') as file:
    content_server = file.read()

# We will define the unique room ID generator helper functions and replace the UUID call
unique_id_helpers = """
// Helper to generate a 4-character random uppercase alphanumeric room ID (avoiding O, 0, I, 1)
function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateUniqueRoomId() {
    let id;
    do {
        id = generateRoomId();
    } while (rooms[id]);
    return id;
}
"""

# Let's insert the helpers before connection events or create_room
# We can find `const roomId = crypto.randomUUID();` and replace it
target_old = "        const roomId = crypto.randomUUID();"
target_new = "        const roomId = generateUniqueRoomId();"

if target_old in content_server:
    # Let's prepend the helper functions right before the io.on('connection') block or just at the replace area
    # First, replace the UUID call
    content_server = content_server.replace(target_old, target_new)
    # Then insert the helper functions if not already present
    if "function generateRoomId()" not in content_server:
        # Insert it before the `socket.on('create_room'` line
        create_room_sig = "    socket.on('create_room'"
        content_server = content_server.replace(create_room_sig, unique_id_helpers + "\n" + create_room_sig)
    with open(server_index_path, 'w', encoding='utf-8') as file:
        file.write(content_server)
    print("Success: Changed room ID generator in server/index.js to 4-character uppercase alphanumeric.")
else:
    print("Error: Could not find crypto.randomUUID() call inside server/index.js.")
