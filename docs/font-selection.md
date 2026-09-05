# Home lettering

The user supplied `160K-AnnivPack-FREE` by YutaONE and requested replacing the type used for XY POKER, AI MATCH and ONLINE MATCH. All 32 font files were rendered with those strings before selecting ten options. PixelationSerif was subsequently added at the user's request, bringing the comparison to eleven:

- A: ToyWriterMarker. Sharp, irregular hand lettering.
- B: RevForge. Clean angular lettering with open cuts.
- C: BattleSansSerif. Wide, heavy lettering with distressed details.
- D: GaenSansserif. Heavy angular lettering.
- E: NanoLine Regular Display. Thin, rounded lettering.
- F: Vectura. Wide, rectangular lettering. Selected by the user.
- G: YomiyasuSansSerif. Bold, square lettering.
- H: BunanMarker. Rounded marker lettering.
- I: Macaronium. Wide, rounded lettering with horizontal cuts.
- J: FullmoonMarch. Angular lettering with serifs.
- K: PixelationSerif. Pixelated outlines with serifs; requested by the user.

Vectura is now the default, following the user's selection. `/docs/font-review.html` retains all eleven options at the same 320 × 568 viewport, with links to open each variant at full size. Development-only `?lettering=` values are `marker`, `revforge`, `battle`, `gaen`, `nanoline`, `vectura`, `yomiyasu`, `bunan`, `macaronium`, `fullmoon`, and `pixelation`. Production fixed-word images also use Vectura. The Japanese subtitles “AIと対戦” and “オンライン対戦” were removed; the buttons retain accessible English names.

`scripts/render_home_lettering.py` uses Pillow and the supplied local font pack to generate complete fixed-word PNGs. Source OTF files are not included or served. The images are large enough for the existing desktop and mobile display sizes. The logo, both match headings, the compact game header, all four home menu labels, and RATING use the same option. Artificial font bolding, skewing and the previous extruded title shadow were removed. For each option the four menu labels are rendered at the same font size and baseline on identically sized canvases, so short words are not enlarged relative to ACCOUNT and CONTACT.

Rating numerals in the local comparison use the same selected font. `scripts/fontPreviewPlugin.ts` renders the current complete numeric value with the Python script and caches the PNG. Its text endpoint also renders the English parts of the home player name, account ID, version, and support text. It accepts at most 64 printable ASCII characters, preserving Japanese text in the existing typeface. It reads `XYPOKER_FONT_PACK` and `XYPOKER_FONT_PYTHON` from the ignored local environment file; neither private path is exposed to the client. No font file or digit atlas is served. `HomeRating` and `LetteringText` preserve the actual values as accessible text and keep them visible if image loading fails. Text masks inherit the surrounding color.

Production uses `functions/api/lettering/[kind].js` and `@resvg/resvg-wasm` to render complete PNGs for card ranks, ratings, and English home text. The source font is a private Worker binary module prepared from the local pack by `scripts/prepare_lettering.ts`; `.private/` is ignored and never copied to public assets. The endpoint bounds input to known ranks, six-digit integer ratings, and 32 printable ASCII characters. XML characters are escaped before rendering. Original text stays accessible and remains visible if an image fails to load. Render proxies this endpoint to Pages when it serves the frontend directly.

`npm run deploy` prepares the private font before the unified checks/upload/push. For local production rendering, run `npm run prepare:lettering`, `npm run build`, and `npx wrangler pages dev dist`. Plain Vite preview does not execute Pages Functions. Only Vectura fixed-word PNGs are committed and bundled; the other ten studies remain local and can be regenerated from the supplied pack. The WebAssembly renderer runs only on the server and does not increase the browser bundle.

The local card preview also uses Vectura for A–2. The card-rank endpoint restricts its input to known ranks and renders them at one font size with a shared baseline and canvas, keeping 10 consistent with single-character ranks. Card faces, suit colors, accessible names, hidden states, and play handlers are retained.

The new Vectura suits use original SVG paths with wide, angular silhouettes. The user selected the solid version, which is now the default in development and production. It shares exactly the same outer paths as the outlined version and omits the inner cutouts. `/docs/card-font-review.html` retains both versions at hand and board sizes and marks the solid version as selected; its expandable section retains the earlier card font comparison. Local `?suit=outline` explicitly previews the alternative, while the ordinary URL and `?suit=filled` use the selected solid suits. The selected suits and Vectura ranks are both available in production.

The rules examples no longer display “順番どおり”, “順不同”, “隣接”, or “離れたペア”. The rule explanations retain the distinction between pure and ordinary hands.

The home menu uses SKINS, RULES, ACCOUNT, and CONTACT in either language, and the rating label is RATING. The local-guest subtitle and the Japanese online-lobby heading were removed. Signed-in players retain their account ID.

Source: each font's bundled readme and [YutaONE font terms](https://docs.google.com/document/d/1jzKjcBY7Kni8GaGqFhJaeS2VThokrYWUysKsHnFCxhQ/edit), retrieved 2026-09-05 (document states last update 2024-10-19). The terms allow closed/private use without a follow, require the creator's stated SNS follows for public/commercial use, prohibit redistribution of font data, and discuss use of fixed word graphics. The user confirmed on 2026-09-05 that they followed the creator, satisfying the publication follow condition.

GaenSansserif additionally requires following 火消魂 under its bundled `Y1_Collaboration_Fonts/GaenSansserif/readme.txt`; it must not be presented as an official 火消魂 product.

Validation: all eleven variants were visually inspected in the comparison, including matching rating numerals and removed Japanese subtitles. The rules dialog was checked in the browser. The four menu images have identical canvas dimensions for each font, and share the same size and baseline. The Vectura card ranks and both suit variants were inspected at normal and 30 × 45 board sizes. Dynamic names beginning with a hyphen were checked through the local endpoint. `npm run check` passed all 70 tests during the initial UI work; lint, TypeScript, and production builds were rerun successfully after the font and suit changes.

Release validation: English game UI and Japanese rules are independent; 74 tests pass, including input bounds, XML-sensitive text rendering, matching card-rank canvases, and PNG output. Production-runtime browser checks cover home, rules, skins, contact, sign-in, and AI placement at 320px. The built browser assets contain only the chosen lettering images, with no OTF, binary font, glyph atlas, or renderer WASM.

A complete AI match was played through the final build at 320 × 740: all placements, AI replies, bonuses, the full showdown sequence, and the English result dialog completed. The final score was 4–18 in this UI test. Skin draw controls fit without internal overflow, and the rules selector clears the close button by 13px. Local Pages requests returned PNG for valid lettering, 400 for an invalid rank, and 405 for POST; requesting the private font path returned the SPA HTML, not font data. The user confirmed the creator follow before deployment on 2026-09-05.
