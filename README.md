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

**Latest Version:** `12080050` (2025-12-08 00:50)

### Recent Changes (Last 10 Updates)
1. **v12080050** - Added bottom ad banner placeholder (fixed 60px height) for monetization
2. **v12080038** - Updated README with comprehensive infrastructure documentation (GitHub/Vercel/Render)
3. **v12071815** - Applied Red theme for Red Player (Guest): "YOUR TURN" banner and Name Highlight are now Red when active
4. **v12071805** - Fixed X-Hand highlight bug: now correctly lights up the winner's row (Bottom/Top) based on `xWinner` instead of always Bottom
5. **v12071800** - Updated result table to show actual player names in "Winner" column instead of P1/P2
4. **v12071759** - Fixed shared board highlights in online mode: Guest (Red) now sees their own winning columns (bottom) in Red and opponent (top) in Blue
5. **v12071752** - Fixed online result screen bug where Guest (Red) saw swapped names/scores (passed correct `p1Name`/`p2Name` based on role)
6. **v12071742** - Shifted mobile result screen down by ~20px (`scale(0.8) translateY(25px)`)
7. **v12071722** - Fixed CSS syntax error in `GameResult.css` (restored `.winner-col.draw`), confirmed winner glow is global
8. **v12071714** - Mobile UI Polish: Hidden scoring/winner overlay banners on mobile, scaled result screen to 0.8x, added winner glow effect
9. **v12071706** - Reduced mobile field scale to 0.63 (kept `translateY(-115px)`)
10. **v12071703** - Shifted mobile field and controls UP by 5px (`field: translateY(-115px)`, `controls: bottom: 110px`)

10. **v12061243** - Hide header during battle on mobile, keep on lobby

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
  transform: scale(0.65) translateY(-110px);
  transform-origin: center center;
  margin: 0;
  padding: 0;
}
```

**GameInfo:**
- Conditionally rendered: `{phase !== 'setup' && (<GameInfo ... />)}`
- **Layout:** CSS Grid with 3 columns (Left, Center, Right)
  - `display: grid; grid-template-columns: 80px 1fr 80px;`
  - Uses `display: contents` to ignore .status-bar/.scores wrappers
- **Left Sidebar:**
  - Player Name & Score (`grid-column: 1`)
  - "YOUR TURN" Indicator (`margin-top: 150px`)
- **Right Sidebar:**
  - Opponent Name & Score (`grid-column: 3`)
  - "Opponent's Turn" Indicator
  - Cancel Button (Bottom)
- **Styling:** Transparent container, white/semi-transparent element backgrounds

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

## 🏗 Infrastructure & Deployment Status
**Current Architecture (As of Dec 8, 2025)**

### 1. Source Code Management
- **Platform:** **GitHub**
- **Repository:** `sotwat/xy-poker` (Private/Public)
- **Branch Strategy:** `main` branch is production.

### 2. Frontend Hosting
- **Platform:** **Vercel** (Hobby Tier)
- **URL:** [https://xy-poker.vercel.app/](https://xy-poker.vercel.app/)
- **Status:** Active, but restricted for commercial use.
- **Plan:** Migrate to Cloudflare Pages for monetization.

### 3. Backend Hosting (Socket.IO)
- **Primary:** **Render** (Free Tier)
  - Used for stable public access when local tunnel is offline.
  - URL: *(To be confirmed by user - likely on onrender.com)*
- **Dev / Fallback:** **Localhost + Cloudflare Tunnel**
  - Used for low-latency development testing.
  - URL: `https://xy-poker-server.trycloudflare.com`

### 4. Database / Persistence
- **Type:** In-memory (Game State)
- **Status:** No persistent DB currently (State lost on restart).

---

## 💰 Monetization Strategy
- **Goal:** Display banner ads (Google AdSense) for free revenue.
- **Blocker:** Vercel Hobby plan prohibits commercial use.
- **Solution:** Migrate frontend to **Cloudflare Pages** (Free commercial use allowed).

## 🛠 Tech Stack
- **Frontend library:** React 18, TypeScript
- **Build Tool:** Vite
- **Styling:** Vanilla CSS (CSS Variables, Flexbox/Grid) - **No Tailwind**
- **Realtime:** Socket.IO Client/Server (v4)
- **Audio:** Web Audio API (Tone.js free)
