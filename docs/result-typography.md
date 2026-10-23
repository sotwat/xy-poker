# Results: type by role (2026-10-24)

The user explicitly replaced the earlier instruction to use Vectura everywhere: small result text and quantities must be readable. Match typography within a role, rather than forcing display lettering onto every role.

## Screen observations

These are observations of published screenshots, not identifications of proprietary font families. Reference images are not imported as game assets.

| Game and source | Display treatment | Reading / functional treatment | Applied principle |
| --- | --- | --- | --- |
| [NIKKE](https://gameui.matme.info/blog/archives/97115) | Tall, condensed OPERATION COMPLETE; stage identifier | Compact, ordinary letterforms for level/EXP/rewards, dialogue and battle-history numbers | A victory treatment need not dictate the reward list's font |
| [Blue Archive](https://gameui.matme.info/blog/archives/76328) | Large italic VICTORY and Battle Complete | Upright Japanese text and simple numerals in the damage-history dialog; short OK action | Preserve the celebratory headline; read precise values in a simpler face |
| [Arknights](https://gameui.matme.info/blog/archives/63707) | Product logo, faction mark and illustrated recruitment presentation | Consistent compact text for operator stats, skill description and tutorial dialogue | Unify repeated operational roles; do not imitate the logo in body text |

## XY Poker

- Vectura stays on the existing home identity and card ranks. In results, it stays on the large YOU WIN / YOU LOSE / DRAW and transient celebration headings.
- Results names, bonuses, hand comparisons, rewards, achievements, progress, buttons and status/error messages use the existing system UI font stack. No new font assets or dependencies.
- Result digits use native tabular numerals, including the rolling score/reward counters. The existing GSAP sequence, audio, skip and reduced-motion behavior remain.
- The scroll region reserves 20px on its right even with overlay scrollbars. `scrollbar-gutter: stable` additionally handles conventional scrollbars. Footer controls remain outside it.
- Long achievements wrap; progress fractions and counts stay together. Result hand rows use readable sizes on small screens.

## Verification

Temporary local fixture uses the actual GameResult / MatchRewards components, with Japanese and English names, a long achievement name, level-up/unlock and up to +999999. It does not submit rewards to the backend and is removed before release.

BrowserOS Chromium emulated layouts: 320×568, 390×844, 844×390, 768×1024, 1024×768 and 1440×900. Actual viewport dimensions must be measured, not inferred from requested screenshot dimensions. Scrollbar visibility, right clearance, horizontal overflow and footer visibility are checked alongside screenshots. This is not physical iPhone/Android/Safari testing.
