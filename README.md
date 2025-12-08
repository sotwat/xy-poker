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

#### 3. README Maintenance Policy 
**全てのアップデートでREADMEを更新すること**

- README.md must be updated with EVERY code change
- Document what changed, why it changed, and current state
- Other AIs must be able to perfectly understand project state from README alone

#### 4. Git Commit Messages
- Always in Japanese
- Include version number in commit message
- Example: `fix: translateYで座標を40px上に移動 v12061302`

## Current Project State

**Latest Version:** `12081145` (2025-12-08 11:45)

### Recent Changes (Last 10 Updates)
1. **v12081145** - **Deployment Verification:**
   - **Version Bump:** Updated to current time to verify deployment propagation.
   - **Previous:** Quick Match Bot Fallback (v12081130).
2. **v12080225** - **UI Restoration:**
   - Removed Ad Banner (reverted unrequested layout change).
   - Removed Opponent Hand display (reverted unrequested UI).
   - Fixed "Local (vs AI)" button not working (logic fix).
   - Restored layout to match `v12071815` quality.
3. **v12080217** - Updated version timestamp and fix deployment.
4. **v12080112** - (Reverted) Added Google AdSense global script.
5. **v12080050** - (Reverted) Added bottom ad banner placeholder.
6. **v12071815** - Applied Red theme for Red Player (Guest).
7. **v12071805** - Fixed X-Hand highlight bug.
8. **v12071800** - Updated result table player names.
9. **v12071759** - Fixed shared board highlights in online mode.
10. **v12071752** - Fixed online result screen swapped names bug.

### Current Features

#### 1. Rating System (Elo)
- **Persistence:** Browser-based ID (`localStorage`).
- **Backend:** Supabase stores player ratings.
- **Display:** Shown in Lobby and Game Result screen.
- **Logic:** Server calculates Elo change after every game.

#### 2. Game Modes
- **Local (vs AI):** 
  - Instant start.
  - Player vs AI logic.
  - Game state resets on entry.
- **Online (Private Room):**
  - Host/Guest role.
  - Room ID sharing.
- **Online (Quick Match):**
  - Auto-matchmaking queue.
  - Auto-start when matched.
  - Rating-based matching (basic queue).

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
│   ├── index.js        # Socket.IO server (ES Modules)
│   └── db.js           # Supabase client
└── README.md
```

## 🏗 Infrastructure & Deployment Status
**Current Architecture (As of Dec 8, 2025)**

### 1. Frontend Hosting
- **Primary:** **Cloudflare Pages**
  - **URL:** [https://xy-poker.pages.dev/](https://xy-poker.pages.dev/)
  - **Status:** **Active (Live)**

### 2. Backend Hosting (Socket.IO)
- **Primary:** **Render** (Free Tier)
  - URL: `https://xy-poker-server.onrender.com`
- **Database:** **Supabase** (PostgreSQL)
  - Stores: Player ratings, Browser IDs.

### 3. Monetization
- **Status:** **Disabled/Removed** (AdSense and banners removed at user request).

## 🛠 Tech Stack
- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Vanilla CSS (CSS Variables) - **No Tailwind**
- **Realtime:** Socket.IO Client/Server (v4)
- **Database:** Supabase (@supabase/supabase-js)
- **Audio:** Custom sound utilities
