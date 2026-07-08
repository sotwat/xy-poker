import os

app_tsx_path = '/Users/watanabesotaro/Documents/antigravity/xy-poker/src/App.tsx'

with open(app_tsx_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Target block to remove from footer
target_remove_block = """                  {phase === 'ended' && showResultsModal && (
                    <GameResult
                      gameState={gameState}
                      p1Name={p1DisplayName}
                      p2Name={p2DisplayName}
                      ratingUpdates={ratingUpdates}
                      onRestart={handleRestart}
                      onViewBoard={() => setShowResultsModal(false)}
                      onClose={() => {
                        if (isOnlineGame) {
                          if (phase === 'ended') returnToLobby();
                          else handleCancelMatchmaking();
                        } else {
                          // Local mode reset - Keep local mode, just reset phase to setup
                          setPhase('setup');
                        }
                        setShowResultsModal(false);
                      }}
                    />
                  )}"""

# Check if target block exists
if target_remove_block in content:
    # Remove it from the footer scope
    content_new = content.replace(target_remove_block, "")
    
    # We want to insert it near the other global modals (e.g. right before showFinishAnimation overlay or SkinStore)
    insert_target = """      <SkinStore
        isOpen={showSkinStore}"""
    
    insertion_block = """      {phase === 'ended' && showResultsModal && (
        <GameResult
          gameState={gameState}
          p1Name={p1DisplayName}
          p2Name={p2DisplayName}
          ratingUpdates={ratingUpdates}
          onRestart={handleRestart}
          onViewBoard={() => setShowResultsModal(false)}
          onClose={() => {
            if (isOnlineGame) {
              if (phase === 'ended') returnToLobby();
              else handleCancelMatchmaking();
            } else {
              setPhase('setup');
            }
            setShowResultsModal(false);
          }}
        />
      )}

"""
    
    content_new = content_new.replace(insert_target, insertion_block + insert_target)
    
    with open(app_tsx_path, 'w', encoding='utf-8') as file:
        file.write(content_new)
    print("Success: Relocated GameResult to global App scope.")
else:
    # Try normalized spacing
    content_norm = content.replace('\r\n', '\n')
    target_remove_block_norm = target_remove_block.replace('\r\n', '\n')
    
    if target_remove_block_norm in content_norm:
        content_new = content_norm.replace(target_remove_block_norm, "")
        
        insert_target = """      <SkinStore\n        isOpen={showSkinStore}"""
        insertion_block = """      {phase === 'ended' && showResultsModal && (
        <GameResult
          gameState={gameState}
          p1Name={p1DisplayName}
          p2Name={p2DisplayName}
          ratingUpdates={ratingUpdates}
          onRestart={handleRestart}
          onViewBoard={() => setShowResultsModal(false)}
          onClose={() => {
            if (isOnlineGame) {
              if (phase === 'ended') returnToLobby();
              else handleCancelMatchmaking();
            } else {
              setPhase('setup');
            }
            setShowResultsModal(false);
          }}
        />
      )}\n\n"""
        
        content_new = content_new.replace(insert_target, insertion_block + insert_target)
        with open(app_tsx_path, 'w', encoding='utf-8') as file:
            file.write(content_new)
        print("Success: Relocated GameResult to global App scope (normalized).")
    else:
        print("Error: Could not locate the GameResult block in App.tsx.")
