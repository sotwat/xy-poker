# XY Poker

A 2-player poker card game with both local and online multiplayer modes, featuring a high-stakes "XY" hand evaluation system and dynamic dice mechanics.

## 🚨 Critical Development Rules (MUST READ)

The following rules are **NON-NEGOTIABLE** and must be followed for every single update.

### 1. Version Update Policy
**バージョンは全てのアップデートで必ず更新すること**
- **Trigger:** Every single code change (no matter how small).
- **Format:** `MMDDHHMM` (Month/Day/Hour/Minute) e.g., `12131558`.
- **Location:** `src/App.tsx` inside `<span className="version">...</span>`.
- **Goal:** Ensure instantaneous verification of deployment status.

### 2. CSS Positioning Rules
**座標移動は必ずtransform translateYを使用すること**
- ❌ **NEVER** use `margin-top` or `top` for vertical offsets in animations/layout adjustments.
- ✅ **ALWAYS** use `transform: translateY(...)`.
- **Reason:** Margins cause reflows and unpredictable layout shifts.

### 3. Deployment Policy (STRICT)
**Sync is Critical.** You must use the unified deployment script:
1.  **Run Unified Deploy Script:**
    ```bash
    npm run deploy
    ```
    *(This runs `./deploy_all.sh`, which enforces Git Commit -> Cloudflare Upload -> Render Push)*
    
*Do not run `wrangler` or `git push` manually unless you know exactly what you are doing.*

### 4. README Maintenance
**全てのアップデートでREADMEを更新すること**
- Update the "Recent Changes" log.
- If logic changes, update the relevant documentation section.

---

## 🏗 System Architecture

```mermaid
graph TD
    User[User / Browser]
    
    subgraph Frontend [Cloudflare Pages]
        React[React 18 App]
        SocketClient[Socket.IO Client]
        SupabaseClient[Supabase Client]
    end
    
    subgraph Backend [Render]
        NodeServer[Node.js Server]
        SocketServer[Socket.IO Server]
    end
    
    subgraph Database [Supabase]
        Postgres[PostgreSQL]
        Auth[Authentication]
    end
    
    User -->|HTTPS| React
    React -->|WebSockets| SocketServer
    React -->|REST| Postgres
    SocketServer <-->|Sync| React
```

---

## ✅ Handover Status

- **Current Version:** `12151330` (2025-12-15 13:30)
- **Status:** **Stable**
- **Last Critical Verification:**
    - Local vs AI: ✅ Working
    - Online Match: ✅ Working
    - Deployment: ✅ Automated via scripts
    - Code Health: ✅ Linting Improved

### Known Issues
- **None.** Codebase cleaned up.

---

## 📜 Recent Changes (Last 10 Updates)

1. **v12151330** (2025-12-15): **Bugfix** - Fixed race condition where Ad Script injected before Premium status was loaded. Added script cleanup logic.
2. **v12151320** (2025-12-15): **Feature** - Implemented **Premium User Support** for Ad Removal.
    - Global Ads disabled for `is_premium` users.
    - Premium users get "Instant Free Gacha" reward without watching ads.
    - Database schema updated (`players.is_premium`).
2. **v12151130** (2025-12-15): **Fix** - Removed deactivated Monetag Vignette Ad Zone (`10310001`) from global script to prevent errors.
2. **v12150120** (2025-12-15): **Feature** - Changed Ad Reward from Coins to a **Free Single Gacha Pull**.
2. **v12150115** (2025-12-15): **Feature** - Enabled Gacha & Coin Rewards for Guest Users! Coins are now saved to local storage for non-signed-in players.
2. **v12150110** (2025-12-15): **Feature/Fix** - Massive Gacha & Shop Polish:
    - **10-Pull:** Unique items guaranteed per batch, grid layout (2x5), adjusted animation speed (0.5s).
    - **Visuals:** Fixed invisible card skins in Shop/Gacha (CSS fix) and ensured "Classic" items never drop from Gacha.
    - **UI:** Force full-screen display for Gacha reveal.
2. **v12142325** (2025-12-14): **Fix** - Gacha Animation now displays in full-screen mode by hiding the Store UI during the sequence.
2. **v12142320** (2025-12-14): **Revert** - Restored Cinematic Gacha Animation ("Summon -> Charge -> Explode") by popular demand, while maintaining support for 10x pulls.
2. **v12142315** (2025-12-14): **Bugfix** - Fixed issue where signed-in users could not use Gacha (missing `userId` prop).
2. **v12142310** (2025-12-14): **Feature** - Implemented In-Game Currency (Coins) & Gacha System, enabling skin unlocks via "Gacha" tab using earned coins.
2. **v12142240** (2025-12-14): **Infrastructure** - Created `deploy_all.sh` to enforced synchronized deployment to Cloudflare and Render with a single command (`npm run deploy`).
2. **v12142235** (2025-12-14): **Feature** - Enhanced My Page: Added "Win Rate" display and "Username" editing functionality.
2. **v12142230** (2025-12-14): **Feature** - Implemented "My Page" with user stats (XP, Level), World Ranking, and Achievements system.
3. **v12142218** (2025-12-14): **Polish** - Unified Auth terminology to "Sign In / Sign Out" for consistency, replacing "Login".
4. **v12142215** (2025-12-14): **Bugfix** - Fixed "localhost" redirection error in email confirmation by explicitly setting the production URL.
5. **v12142210** (2025-12-14): **Polish** - Reverted Auth UI to English per user request and improved "Email Confirmation" feedback during Sign Up.
2. **v12131555** (2025-12-13): **Fix** - Prevented AI and Auto-Play from making moves while the Dice Roll Animation is still visible.
3. **v12131260** (2025-12-13): **Critical Fix** - Fixed "White Screen" crash in Local Battle caused by premature scoring trigger.
4. **v12131255** (2025-12-13): **Fix** - Fixed Local AI inactivity by ensuring AI turn logic reacts to phase transitions.
5. **v12131250** (2025-12-13): **Fix** - Restored missing phase synchronization logic that fixed lobby redirect loops.
6. **v12131240** (2025-12-13): **Fix** - Resolved GameInfo persistence bug and internal syntax errors.
7. **v12131220** (2025-12-13): **Revert** - **Full Revert** to v12131140 state, cancelling Cinematic Scoring features.
8. **v12131140** (2025-12-13): **Fix** - Fixed "FINISH" text overflowing on mobile screens (`clamp`).
9. **v12112356** (2025-12-11): **UI** - Restored "Rules" button in Online Lobby and Local Setup screen.
10. **v12112354** (2025-12-11): **Fix** - Corrected "Pure Straight" detection logic.

---

## 💻 Local Development Setup

### 1. Prerequisites
- Node.js (v18+)
- Supabase Account

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

---

## 📦 Project Structure

```
xy-poker/
├── src/
│   ├── components/      # React components (Board, Dice, UI)
│   ├── logic/          # Core Game Logic (Pure Functions)
│   │   ├── game.ts     # Main Reducer
│   │   ├── evaluation.ts # Hand Evaluation
│   │   └── scoring.ts  # Score Calculation
│   └── App.tsx         # Main Controller & View Integration
├── server/
│   ├── index.js        # Socket.IO Server
│   └── db.js           # Database Client
└── README.md           # This file
```

## 🛠 Tech Stack
- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Vanilla CSS (CSS Variables)
- **Realtime:** Socket.IO
- **Database:** Supabase

---

## 👑 Admin & Operations

### Managing Premium Users
To grant "Premium" status (Ad Removal) to a user, run the following SQL in the **Supabase SQL Editor**:

```sql
-- Option 1: By Email (Recommended)
UPDATE players
SET is_premium = TRUE
WHERE id = (SELECT id FROM auth.users WHERE email = 'target_user@example.com');

-- Option 2: By Username (If unique)
UPDATE players
SET is_premium = TRUE
WHERE username = 'UserDisplayName';
```

To revoke, set `is_premium = FALSE`.

