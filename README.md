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

#### 5. Deployment Policy
**AI Agent must ALWAYS run the deployment command manually**
- Do NOT assume Git Push triggers deployment (it does not for this project).
- **Procedure:**
  1. Commit & Push changes to Git.
  2. Run `npm run deploy`.
  3. Verify the output says "Success".

## Current Project State

**Latest Version:** `12111835` (2025-12-11 18:35)

### Recent Changes (Last 10 Updates)
1. **v12111830** (2025-12-11): **Docs Update** - Perfected README & added Deployment script.
2. **v12111800** (2025-12-11): **Feature** - Added Dice Skin Reward System (10 skins, Unlock via Ads).
3. **v12111750** (2025-12-11): **Fix** - Corrected version numbering. Reverted to PC-only Global Ads.
4. **v12111740** (2025-12-11): **Fix** - Hotfixed Ad Iframe Sandbox permissions.
5. **v12082250** (2025-12-08): **Fix** - Fixed stubborn ad persistence via Service Worker unregistration.
6. **v12082245** (2025-12-08): **Fix** - Improved Ad Isolation (Iframe + Local HTML).
7. **v12082240** (2025-12-08): **Config** - Added Google Search Console verification.
8. **v12082235** (2025-12-08): **Config** - Added SEO Meta Tags & Robots.txt.
9. **v12082225** (2025-12-08): **Config** - Configured In-Page Push (Global) & Disabled Banner temporary.
10. **v12082220** (2025-12-08): **Config** - Mobile Optimization (Bottom Ad 0px) & Sandbox Fix.

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

#### 3. Monetization & Rewards
- **Dice Skins:** Users can unlock 10 different dice skins by watching Rewarded Ads (Direct Link).
- **Ad Network:** Monetag Integration.
  - **Rewarded Ads:** Used for Skin Unlocks (`RewardAdButton`).
  - **In-Page Push:** PC Only (Global config).
  - **Banner Ads:** Disabled/Removed for UX.

## Project Structure

```
xy-poker/
├── src/
│   ├── components/      # React components
│   │   ├── SharedBoard.tsx/.css
│   │   ├── DiceSkinStore.tsx/.css  # Skin Shop UI
│   │   ├── GameInfo.tsx/.css
│   │   ├── Hand.tsx/.css
│   │   ├── Lobby.tsx/.css
│   │   └── GameResult.tsx/.css
│   ├── logic/          # Game logic
│   │   ├── types.ts    # Game Types (Card, Skin, etc)
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
**Current Architecture (As of Dec 11, 2025)**

### 1. Frontend Hosting
- **Primary:** **Cloudflare Pages**
- **URL:** [https://xy-poker.pages.dev/](https://xy-poker.pages.dev/)
- **Status:** **Active (Live)**
- **Deployment Method:** **Manual / CLI**
  - **Reason:** Project is not linked to Git Provider in Cloudflare Dashboard.
  - **Command:** `npm run deploy` (requires Wrangler auth).

### 2. Backend Hosting (Socket.IO)
- **Primary:** **Render** (Free Tier)
- **URL:** `https://xy-poker-server.onrender.com`
- **Database:** **Supabase** (PostgreSQL)
  - Stores: Player ratings, Browser IDs.

## 🛠 Tech Stack
- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Vanilla CSS (CSS Variables) - **No Tailwind**
- **Realtime:** Socket.IO Client/Server (v4)
- **Database:** Supabase (@supabase/supabase-js)
- **Audio:** Custom sound utilities
- **Monetization:** Monetag (Direct Link, In-Page Push)
