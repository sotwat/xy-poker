# Progression rewards

v10212228. Apply `supa_schema_v15_progression.sql` after v14.

- Each level grants `50 × reached level` coins, plus 200 on multiples of five. Every crossed level is included. Examples: Lv2 100, Lv3 150, Lv5 450, Lv10 700.
- Newly unlocked achievements grant coins and XP once, inside the match settlement transaction. Standard achievements grant 50 coins / 100 XP; harder milestones use the amounts in `achievement_rewards` and `achievementReward`. Achievement XP counts toward the same match's level ups.
- Existing receipts remain unchanged. Already-earned achievements do not pay again; existing progress does qualify for cosmetics immediately through `sync_progression`.
- AI, ranked, private and guest play use the same progression rules. Guest progress remains browser-local.

## Exclusive cosmetics

| Unlock | Reward |
|---|---|
| Lv5 | Copper dice |
| Lv10 | Cobalt Foil card back |
| Lv20 | Champion Table |
| Five consecutive wins | Ember dice, On Fire title |
| Win every Y hand and the X hand | Crown card back, Flawless title |
| 100 matches | Veteran Table, Veteran title |
| Lv3 / Lv10 / Lv20 | Challenger / Regular / Elite titles |
| First victory | First Blood title |
| Win X with a royal flush | Royal title |

These skins are excluded from all purchase and ad-draw pools. Existing purchased skins remain available. Titles can be equipped in ACCOUNT or SKINS → TITLES, and appear at home and during matches. Authenticated selections are validated and saved by `equip_title`; online opponent titles come from server profiles. Skin ownership is saved in `player_skins`.

Visual source: existing game dice, board and card-back components. Cobalt and Crown reuse the existing Blue Modern and Gold Luxury patterns with palette adjustments. Lucide trophies/coins retain the existing ISC-licensed icon dependency; no new bitmap or generated assets or fonts.

## Verification

- `npm run check`: lint, tests and production build.
- `docs/progression-verification.sql`: rollback fixtures test achievement coins/XP, stacked level rewards, duplicate settlement, six permanent unlocks, legacy eligibility, title selection/restore/locked rejection and privileges.
- `src/logic/progression.test.ts`: catalog/SQL parity and exclusion of earned skins from purchases.
- Browser UI: 320/390px title conditions, guest title equip and reload, exclusive skin previews and eligibility. Temporary QA storage is restored afterward.
