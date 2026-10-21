# Match rewards

Migration: `supa_schema_v13_match_rewards.sql`, applied on 2026-10-21 to xy-poker-v2. Run before deploying the matching backend. Reward and purchase RPCs are service-role only; account receipts and owned skins use owner-only SELECT policies.

| Result | Coins | XP |
| --- | ---: | ---: |
| Win | 30 | 100 |
| Draw | 20 | 60 |
| Loss | 10 | 40 |

Wins add 2 coins and 3 XP per score-margin point, capped at 20 points. Each consecutive win after the first adds 5 coins and 10 XP, capped at the sixth win. Every third cumulative win adds 25 coins and 50 XP; losses do not reset this three-win progress. Losses and draws reset the consecutive-win streak. Rewards are the same for AI, ranked and private online matches. Surrender/disconnect outcomes receive base/streak rewards without a score-margin bonus.

Elo uses K=32 and the result/opponent rating, independently of coin/XP bonuses. AI rating is stored separately against a fixed 1500 AI opponent. Private online rooms do not change rating. Existing ranked rating remains the leaderboard rating.

The result shows the saved receipt, newly unlocked achievements, and the nearest unfinished milestone for each advancing stat. All newly unlocked achievements remain visible. The three-win reward repeats. Level thresholds follow the existing cumulative XP formula, `100*level + 50*level²`.

Online outcomes are scored from server-validated moves. AI rewards require a server-issued deal and a legal complete record matching its dice, starting hands and draw order. This validates legality/outcome, not that a modified browser actually ran the shipped AI policy. A reward is keyed by account + server match ID and persisted atomically with balances, stats, Elo and achievements. Purchases are keyed by account + request UUID; item ownership and coin deduction share one transaction.

Guest AI rewards persist only in the current browser. Account rewards persist in Supabase. Guest progress is not migrated into an account on sign-in. A lost connection before the AI record is saved can invalidate its in-memory game session; RETRY can recover a receipt already stored or retry the record while that session survives. Online recovery reads the saved receipt.

Paid skins are permanent. A chosen locked skin costs 300 coins; random unowned skins cost 100 each (up to ten per purchase). Paid account purchases restore through player_skins. Existing browser-only/ad unlocks remain browser-only; this change does not migrate them to cloud ownership. Random draws skip account-owned skins.

Verification: `npm run check`; exhaustive parity of all 132,600 ordered three-card hands; wheel Straight Flush parity; 100 legal complete reducer games checked against server scores/record validation; guest idempotence, streak/reset and achievement progress; server catalog selection and duplicate-free purchases. `docs/match-rewards-verification.sql` exercises real RPCs, duplicate protection, Elo, five-win achievement, level, insufficient funds, atomic purchase and RLS, then rolls back all synthetic data. Its production run passed on 2026-10-21. Browser validation uses the existing Vectura, INK and angular presentation with 320/390/1440 px layouts.

Rollback: redeploy the preceding frontend/backend together. Keep the additive tables/columns and receipts for reconciliation; do not delete awarded balances or purchase ownership. Older clients' legacy update_player_stats event is rejected to prevent duplicate credits after this release; refresh them.
