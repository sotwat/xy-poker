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

#### 5. Deployment Policy (STRICT)
**You MUST perform BOTH steps for every update:**

1.  **Frontend (Cloudflare Pages):**
    *   Command: `npm run deploy`
    *   *Note: This pushes the built assets directly to Cloudflare.*

2.  **Backend/Source (Render & GitHub):**
    *   Command: `git push origin main`
    *   *Note: This triggers the Render build for the backend AND saves your source code.*

**WARNING:** If you only do one, the game will be out of sync (e.g., Code updated but Backend old, or vice versa). **ALWAYS DO BOTH.**

## Current Project State

**Latest Version:** `12122237` (2025-12-12 22:37)

### Recent Changes (Last 10 Updates)
1. **v12130122** (2025-12-13): **Fix** - Fixed bug where GameInfo persisted in lobby after returning from room match (improved room exit handling).
2. **v12130113** (2025-12-13): **Feature** - Added "Auto-Play" button (bottom right) for both Local and Online modes. AI takes over player's turn when active.
3. **v12122215** (2025-12-12): **Feature** - Added "Rematch" functionality for ID-based Room Matches.
3. **v12121500** (2025-12-12): **Content** - Restored detailed game rules text and renamed "人工知能" to "AI".
3. **v12121004** (2025-12-12): **SEO** - Implemented JSON-LD Schema, Canonical Link, and Sitemap.
2. **v12120958** (2025-12-12): **SEO** - Added Japanese keywords and title for "XYポーカー" discovery.
2. **v12112502** (2025-12-11): **Infra** - Enabled DUAL Desktop ads (`nap5k` + `groleegni`).
2. **v12112455** (2025-12-11): **Infra** - Removed Google AdSense; Switched Desktop ad to Zone 10307517.
2. **v12112452** (2025-12-11): **Infra** - Added new Desktop-only ad script (Zone 10310001).
2. **v12112447** (2025-12-11): **Revert** - Removed Desktop ad script.
2. **v12112444** (2025-12-11): **Infra** - Updated Desktop-only ad script with new provider tag.
2. **v12112423** (2025-12-11): **UX** - "Play Again" in Online Match now searches for a new Quick Match instead of a rematch.
2. **v12112420** (2025-12-11): **Critical Fix** - Fixed "Turn Deadlock" by synchronizing initial Deck state from server.
2. **v12112415** (2025-12-11): **Fix** - Addressed "Double Voice" bug by forcing specific voice selection and guarding scoring animation.
2. **v12112404** (2025-12-11): **Fix** - Restricted rate updates to Quick Match only and reset all ratings.
2. **v12112359** (2025-12-11): **Fix** - Corrected "Pure One Pair" detection to be strictly adjacent (Row 0-1 or 1-2).
2. **v12112356** (2025-12-11): **UI** - Restored "Rules" button in Online Lobby and Local Setup screen.
2. **v12112354** (2025-12-11): **Fix** - Corrected "Pure Straight" detection to require strict board order (Row 1->2->3 or 3->2->1).
2. **v12112347** (2025-12-11): **Fix** - Addressed "Left-Side Bias" in AI. Implemented opportunity cost logic and shuffled column evaluation.
2. **v12112342** (2025-12-11): **Fix** - Fixed AI bug allowing 3 hidden cards in one column. Adjusted strategy to spread moves and rush less.
2. **v12112337** (2025-12-11): **Policy** - Enforced strict version timestamping compliance. Re-deployed all environments.
2. **v12112320** (2025-12-11): **Rules** - Removed Jokers entirely and refined "Pure" hand definitions (Positional Order/Adjacency).
2. **v12112317** (2025-12-11): **AI** - Enhanced AI logic with user-provided strategies (Dice context, Low-col sacrifice, Pure hand priority, Early hidden).
3. **v12112310** (2025-12-11): **Audio** - Added Voice Announcements for winning hand names during scoring animation.
3. **v12112305** (2025-12-11): **FX** - Added sequential scoring animation (Cols Right-to-Left → X-Hand Row in Yellow).
3. **v12112245** (2025-12-11): **UI** - Adjusted mobile battle sidebar font sizes (smaller name/bonuses).
3. **v12112240** (2025-12-11): **UI** - Removed redundant "Dice Skin" button from Online Lobby.
3. **v12112235** (2025-12-11): **Feature** - Added 6 new skins (2 Dice, 2 Card, 2 Board) to total 12 per category.
3. **v12112230** (2025-12-11): **Scaling** - Changed Skin Unlock Duration from 24h to 3h.
3. **v12112222** (2025-12-11): **Feature** - Expanded Skin Shop (Added Card & Board Skins).
3. **v12111913** (2025-12-11): **Fix** - Fixed Online Board Flipping Bug (Stabilized Player Perspective).
3. **v12111910** (2025-12-11): **UI** - Repositioned Turn Timer on Mobile (Top-Right, 0.8x Scale).
3. **v12111900** (2025-12-11): **Feature** - Implemented 24h Expiry for Ad-Unlocked Dice Skins.
3. **v12111858** (2025-12-11): **Fix** - Fixed rendering of Dice Face 6 (Added missing dot CSS).
3. **v12111855** (2025-12-11): **Fix** - Added Mobile Close Button & Improved Desktop Ad Reward Flow (Claim Button).
3. **v12111845** (2025-12-11): **Docs Update** - Added Setup Instructions & DB Schema for continuity.
2. **v12111835** (2025-12-11): **Docs Update** - Added Critical Deployment Policy.
3. **v12111830** (2025-12-11): **Docs Update** - Perfected README & added Deployment script.
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

- **Online (Private Room):**
  - Host/Guest role.
  - Room ID sharing.
- **Online (Quick Match):**
  - Auto-matchmaking queue.
  - Auto-start when matched.
  - Rating-based matching (basic queue).

### 3. Monetization & Rewards
- **Dice Skins:** Users can unlock 10 different dice skins by watching Rewarded Ads (Direct Link).
- **Ad Network:** Monetag Integration.
  - **Rewarded Ads:** Used for Skin Unlocks (`RewardAdButton`).
  - **In-Page Push:** PC Only (Global config).
  - **Banner Ads:** Disabled/Removed for UX.

## 💻 Local Developement Setup

### 1. Prerequisites
- Node.js (v18+)
- Supabase Account (for Ratings)

### 2. Environment Variables
Create `.env` in root:
```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_KEY=your_anon_key
```

### 3. Quick Start
```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Start Dev Server (Frontend + Backend)
npm run dev   # Frontend: http://localhost:5173
npm run start # Backend: http://localhost:3000
```

### 4. Database Schema (Supabase)
Table: `ratings`
- `id` (uuid, PK)
- `browser_id` (text, unique) - Anonymous ID stored in localStorage
- `rating` (int4) - Elo rating (Default: 1500)
- `user_id` (uuid, FK, nullable) - Linked Auth ID
- `wins`, `losses`, `games_played` (int4)

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
