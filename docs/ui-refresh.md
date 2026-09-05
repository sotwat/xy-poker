# UI reference lock: Poker Chase

The user's explicit reference is Poker Chase. It supersedes the previous printed-card-box direction and the old weighting in design.md. Remove the marketing tagline, explanatory home copy, X/Y captions, decorative suit row, hand heading and repeated placement instructions. Keep turn state in the existing timer, selection in the hand, and legal placement on the board.

Inspected full-size reference screenshots in the browser:
- [Home and tutorial screenshots](https://pokerapp.jp/1480): player information across the top, large silver-edged diamond match menus on the right, functional toolbar at the bottom, saturated blue/purple scene, yellow accents, forceful title lettering.
- [Unobscured match screenshot](https://www.gaming-city.com/games/4011): dark silver-edged player panels, central felt table, bold score numerals, yellow action buttons, purple scene around the table.

Use those spatial and visual roles directly. The game's own card and dice components replace character art; do not copy Poker Chase character imagery or branding. The user selected Vectura lettering for the title and home labels, and filled angular suits and square geometry for cards, dice, and icons. Blue/red continue to identify players. Purple/black are interface surfaces, yellow identifies actions, silver describes control edges. Green is confined to the existing selectable felt skin, as in the match reference, and is no longer the app palette. Other selected skins remain available.

Keep the existing flashy showdown and sound timing. No additional engine or dependency. The revised home stays still except for pointer feedback. Dialog focus, keyboard card placement, timing and game rules remain intact.

Verify home at 320, 390, 768 and 1440px, selected placement, English wrapping, and dialogs against these actual references. Do not treat removing generic patterns as a substitute for matching the reference.

Verified on the revised UI: home at 320×568, 390×844, 768×900 and 1440×900; no horizontal home overflow at 768/1440. Played an AI turn using face-down placement and Enter, confirming the remaining count changes from 3 to 2. Inspected the game at 320/390, rules at 320, and Japanese/English home and online menus at 320. Confirmed that entering four room-code characters enables joining without submitting a match request. Removed repeated online descriptions and nested create/join headings. All 70 existing tests, lint, TypeScript and production build passed. Showdown logic, rendering and sound timing were not changed in this correction.

The released interface now uses simple English in game controls, results, account/skin screens, and replays. Rules default to Japanese independently of the interface and retain an in-dialog language selector. The selected lettering also renders in the production Pages runtime. QA found and fixed a turn-announcement cleanup bug: changing player index during the opening banner cancelled its hide timer and could hold the AI. The announcement lifecycle now follows the playing phase, so placing the first card cannot cancel that timer.
