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

#### 3. Git Commit Messages
- Always in Japanese
- Include version number in commit message
- Example: `fix: translateYで座標を40px上に移動 v12061302`

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
