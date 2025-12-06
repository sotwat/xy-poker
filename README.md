# XY Poker

A 2-player poker card game with both local and online multiplayer modes.

## Development Guidelines

### 🔴 CRITICAL RULES - MUST FOLLOW

#### 1. Version Update Policy
**バージョンは全てのアップデートで必ず更新すること**

- Every single code change MUST update the version number in `App.tsx`
- Format: `MMDDHHMM` (月日時分)
- Example: `12061302` = December 6, 13:02
- Update location: `<span className="version">MMDDHHMM</span>`
- This is NON-NEGOTIABLE - never skip version updates

#### 2. CSS Positioning Rules
**座標移動は必ずtransform translateYを使用すること**

- ❌ **NEVER use `margin` to move elements vertically**
  - Margins do not actually move coordinates
  - User explicitly stated margins don't work multiple times
  
- ✅ **ALWAYS use `transform: translateY()` for coordinate movement**
  ```css
  /* Correct way to move element up 40px */
  transform: scale(0.7) translateY(-40px);
  
  /* Wrong - does not move coordinates */
  margin-top: -40px;
  ```

- When user says "move X up/down by Npx", use `translateY(-Npx)` or `translateY(Npx)`
- Multiple transforms can be combined: `transform: scale(X) translateY(Y)`

#### 3. README Maintenance Policy 
**全てのアップデートでREADMEを更新すること**

- README.md must be updated with EVERY code change
- Document what changed, why it changed, and current state
- Other AIs must be able to perfectly understand project state from README alone
- Include:
  - Current version number
  - Recent changes (keep last 5-10 updates)
  - Current mobile/desktop UI specifications
  - Known issues or workarounds
- This is as critical as updating version numbers

#### 4. Git Commit Messages
- Always in Japanese
- Include version number in commit message
- Example: `fix: translateYで座標を40px上に移動 v12061302`

## Current Project State

**Latest Version:** `12062107` (2025-12-06 21:07)

### Recent Changes (Last 10 Updates)
1. **v12062107** - Shifted mobile field up by 50px (total `translateY(-90px)`)
2. **v12061302** - Fixed field positioning using `transform: translateY(-40px)` instead of margin
3. **v12061259** - Adjusted mobile field: scale 0.7, 40px up (attempted with margin - didn't work)
3. **v12061252** - Removed score display from lobby, field scale to 0.75, moved up 20px
4. **v12061249** - Removed grid layout, centered content with flexbox
5. **v12061246** - Centered Start Game and battle field after header removal
6. **v12061243** - Hide header during battle on mobile, keep on lobby
7. **v12061238** - Made app-header background transparent on mobile
8. **v12061232** - Removed backgrounds from GameInfo elements
9. **v12061230** - Set field z-index above GameInfo
10. **v12061227** - Reverted bad vertical text layout

### Current Mobile UI Specifications

**Header:**
- Lobby (phase === 'setup'): Visible with #2c3e50 background
  - Title, version, Local/Online toggle shown
  - GameInfo hidden
- Battle (phase === 'playing' || 'scoring'): Completely hidden
  - Uses `battle-mode` class: `display: none !important`

**Game Field:**
```css
.play-area {
  transform: scale(0.7) translateY(-40px);
  transform-origin: center center;
  margin: 0;
  padding: 0;
}
```

**GameInfo:**
- Conditionally rendered: `{phase !== 'setup' && (<GameInfo ... />)}`
- Grid layout on mobile (1fr 1fr)
- YOUR TURN left, Cancel button right
- Player scores left column, opponent right column
- Transparent backgrounds with colored borders

## Project Structure

```
xy-poker/
├── src/
│   ├── components/      # React components
│   │   ├── SharedBoard.tsx/.css
│   │   ├── GameInfo.tsx/.css
│   │   ├── Hand.tsx/.css
│   │   ├── Lobby.tsx/.css
│   │   └── GameResult.tsx/.css
│   ├── logic/          # Game logic
│   │   ├── game.ts     # Game state reducer
│   │   ├── evaluation.ts
│   │   ├── scoring.ts
│   │   └── online.ts   # Socket.IO client
│   ├── utils/
│   │   └── sound.ts    # Audio utilities
│   ├── App.tsx
│   └── App.css
├── server/
│   └── index.js        # Socket.IO server
└── README.md
```

## Mobile UI Specifics

### Header Behavior
- **Lobby Screen**: Header visible with background #2c3e50
  - Shows title, version, Local/Online toggle
  - GameInfo (scores) hidden during setup phase
  
- **Battle Screen**: Header completely hidden
  - Conditional class: `battle-mode` when `phase === 'playing' || 'scoring'`
  - CSS: `.app-header.battle-mode { display: none !important; }`

### Field Positioning
Current mobile settings (as of v12061302):
```css
.play-area {
  transform: scale(0.7) translateY(-40px);
  transform-origin: center center;
}
```

## Important Lessons Learned

### What Doesn't Work
1. ❌ Using `margin-top` to move field position (coordinates don't change)
2. ❌ Forgetting to update version number on changes
3. ❌ Using grid layout for simple centering (overly complex)

### What Works
1. ✅ `transform: translateY()` for coordinate movement
2. ✅ Simple flexbox centering for mobile layouts
3. ✅ Conditional rendering with `phase !== 'setup'` for GameInfo
4. ✅ Transform combining: `scale() translateY()`

## Running the Project

### Development
```bash
# Frontend (Vite)
npm run dev

# Backend (Socket.IO server)
node server/index.js
```

### Production
Frontend is deployed to Vercel.
Backend requires a separate Node.js server with Socket.IO support.

## Technologies
- **Frontend**: React, TypeScript, Vite
- **Backend**: Node.js, Socket.IO
- **Styling**: Vanilla CSS
- **Audio**: Web Audio API
