import os

lobby_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/components/Lobby.tsx'

with open(lobby_tsx_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Replace Host Room references with Create Room
old_code_block = """                        <div className="action-card-secondary">
                            <h4>Host Room</h4>
                            <p className="card-desc">Create private room and invite a friend.</p>
                            <button 
                                className="quest-btn-secondary" 
                                onClick={() => { playClickSound(); onCreateRoom(); }}
                            >
                                Host Room
                            </button>
                        </div>"""

new_code_block = """                        <div className="action-card-secondary">
                            <h4>Create Room</h4>
                            <p className="card-desc">Create a private room and invite a friend.</p>
                            <button 
                                className="quest-btn-secondary" 
                                onClick={() => { playClickSound(); onCreateRoom(); }}
                            >
                                Create Room
                            </button>
                        </div>"""

if old_code_block in content:
    content = content.replace(old_code_block, new_code_block)
    with open(lobby_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content)
    print("Success: Renamed Host Room to Create Room in Lobby.tsx.")
else:
    # Try normalized spacing
    content_norm = content.replace('\r\n', '\n')
    old_code_block_norm = old_code_block.replace('\r\n', '\n')
    new_code_block_norm = new_code_block.replace('\r\n', '\n')
    if old_code_block_norm in content_norm:
        content_norm = content_norm.replace(old_code_block_norm, new_code_block_norm)
        with open(lobby_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_norm)
        print("Success: Renamed Host Room to Create Room in Lobby.tsx (normalized).")
    else:
        print("Warning: Target host room block not found in Lobby.tsx.")
