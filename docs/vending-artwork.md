# Vending artwork

Generated with the built-in image generation tool from the two user-supplied visual references. The source reference images are not shipped as production artwork.

## Final files

- public/vending/machine-white-tall-v3.png — taller white pixel vending cabinet with a larger showcase, no ground, alpha background. Twenty-five slots are overlaid in the app.
- public/vending/machine-white-wide-v2.png — retained previous wide cabinet artwork.
- public/vending/machine-white-v1.png — retained previous cabinet artwork.
- public/vending/cans-1.png — reference cans 1–20.
- public/vending/cans-2.png — reference cans 21–40.
- public/vending/cans-3.png — reference cans 41–60.
- public/vending/cans-4.png — reference cans 61–78, two final cells empty.
- app/components/vending-sprites.json — measured per-can viewports; no raster edits.
- lib/monster-catalog.ts — names and stable cosmetic assignments.

## Current tall cabinet edit prompt

Use case: precise-object-edit. Edit target: attached white pixel-art vending machine. Make this SAME wide cabinet substantially TALLER, about 30–35% more height at the SAME width. Add almost all the extra height to the large EMPTY dark glass display so the display can fit FIVE full rows of game cans. Do not vertically stretch the sleeping cat, controls, feet or buttons; redraw/extend only the central cabinet and its display. The result must still be WIDE enough for five columns. Portrait 3:5 canvas, full machine visible, no clipping. Keep clean WHITE enamel, neutral light grey metal shading, graphite frame, warm amber lamps, small sleeping white cat on roof left, compact right-side keypad and coin slot. The main glass is now the dominant area, beginning around y17% and ending y76%, spanning approximately x15% to x82% of canvas. Glass must be a SINGLE completely EMPTY rectangular window: no cans, no shelves, no words, no symbols. Reduce unused solid panels above and below the glass. Blank small lit header above glass at y13%. Wide dispensing hatch below glass around y81% to y89%. Metal feet near y94%. Keep the same near-front-facing view with a narrow left side visible, vertical/horizontal front edges, crisp detailed square-pixel game art. Fully transparent alpha outside the machine. NO background, NO ground, NO grass or dirt, NO island, NO floor, NO glow behind it, NO loose fragments. Preserve white and grey colors, no pink/lavender panels. No text or watermark.

## Previous wide cabinet edit prompt

Use case: precise-object-edit. Edit target: the attached generated white pixel-art vending machine. Make this SAME machine about 25% WIDER while keeping its height and all details the same size; extend the central glass showcase and the white roof/front horizontally to create significantly more usable shelf space. Do not simply stretch the cat, feet, keypad or lights. Keep the sleeping white cat on the left of the roof, neutral WHITE enamel and light grey metal body, graphite trim, tiny amber lamps, right-side keypad, coin slot, and wide dispensing hatch below glass. The main showcase should occupy most of the front width, with a narrow left frame and the same narrow right controls strip; aim for a large EMPTY rectangular dark glass window x17%–78% of full canvas and y20%–66%. Keep all glass shelves EMPTY (no cans, no shelves, no text; game overlays are added in the app). Widen the output hatch under it. Nearly front facing, narrow left side panel, straight vertical and horizontal edges. Preserve crisp detailed pixel-art style. Full machine including metal feet must fit. Use a 4:5 portrait canvas (wider than the old 2:3 canvas). Completely transparent alpha background, no ground, no grass or dirt or base island, no floor, no background glow. Keep the cabinet white, no pink or purple surfaces. Blank lit header, no words, no watermark.

## Previous cabinet edit prompt

Use case: precise-object-edit. Edit target: generated pixel-art vending machine. Change the cabinet to clean WHITE enamel with neutral light grey shading and graphite dark trim. Absolutely no lavender, purple, pink, or burgundy cabinet surfaces. Keep tiny warm amber lights, sleeping white cat, keypad, empty large glass display, blank lit header, empty dispensing hatch, same front-facing geometry and proportions. REMOVE the entire grassy island, dirt, flowers, stones and all ground. Keep only the machine and its four small metal feet. Remove the entire dark gradient background and glow: actual alpha transparency outside the machine, no scene, no ground, no drop shadow, no colored backdrop. Preserve crisp detailed pixel-art edges, transparent portrait 2:3 canvas. Display and hatch must stay EMPTY for game UI overlays. No text.

## Can atlas prompt template

Use case: stylized-concept. Asset type: game sprite atlas. Generate an ORIGINAL crisp pixel-art sprite sheet of Monster Energy drink cans, using the attached checklist ONLY as packaging/color reference. NOT a screenshot/copy of the poster. Exactly N separate upright front-facing slim drink cans in a STRICT FIVE COLUMNS by FOUR ROWS regular grid, read left to right, top to bottom. Portrait 2:3 image. Each can is centered in its cell with generous clear margin on every side, no object touches another cell. All cans same height and width, approx 1:2.5 can width:height. Detailed square pixel artwork, metallic silver rim and tab, recognizable three-claw Monster emblem, distinct packaging color and small flavor motifs, clean black pixel outline. No labels outside cans, no cell boxes, NO ground or shadow, NO background, TRUE TRANSPARENT ALPHA surroundings and gutters. Cans are solid objects, not semi-transparent. Tiny can lettering can be decorative; the web app supplies exact flavor labels separately. No loose fragments or extra objects. Apply the ordered cell descriptions below. For sheet 4 leave row 4 columns 4 and 5 transparent. Keep every row and column perfectly aligned and keep all cans intact. Each cell contains one single connected can sprite.

### Sheet 1

- Row 1, column 1: Original Monster, black lime green.
- Row 1, column 2: Monster Ultra, white silver.
- Row 1, column 3: Juice Monster, orange gold.
- Row 1, column 4: Rehab Monster, black yellow.
- Row 1, column 5: Java Monster, tan brown.
- Row 2, column 1: Monster Reserve, black red.
- Row 2, column 2: Monster Nitro, lime green black.
- Row 2, column 3: Monster Import, black purple.
- Row 2, column 4: Punch Monster, pink black.
- Row 2, column 5: Hydro Monster, bright blue silver.
- Row 3, column 1: Dragon Tea, blue orange.
- Row 3, column 2: Killer Brew, black beige.
- Row 3, column 3: Espresso Monster, brown copper.
- Row 3, column 4: Muscle Monster, black white.
- Row 3, column 5: Original Green OG, black bright green.
- Row 4, column 1: Lo-Carb, black ice blue.
- Row 4, column 2: Zero Sugar, black light blue.
- Row 4, column 3: Absolutely Zero, black cyan.
- Row 4, column 4: Import, black cream.
- Row 4, column 5: Nitro Super Dry, bright green black.

### Sheet 2

- Row 1, column 1: Nitro Cosmic Peach, black peach.
- Row 1, column 2: Orange Dreamsicle, orange cream.
- Row 1, column 3: Peaches n’ Creme, peach cream.
- Row 1, column 4: White Pineapple, white gold.
- Row 1, column 5: Watermelon, watermelon red green.
- Row 2, column 1: Assault, black red.
- Row 2, column 2: The Doctor, yellow black.
- Row 2, column 3: Lime, lime yellow black.
- Row 2, column 4: Lando Norris, black orange.
- Row 2, column 5: Electric Blue, blue silver.
- Row 3, column 1: Ultra Zero White, white silver.
- Row 3, column 2: Ultra Blue, sky blue silver.
- Row 3, column 3: Ultra Red, red silver.
- Row 3, column 4: Ultra Black, black silver.
- Row 3, column 5: Ultra Violet, purple silver.
- Row 4, column 1: Ultra Sunrise, orange yellow.
- Row 4, column 2: Ultra Paradise, lime green silver.
- Row 4, column 3: Ultra Fiesta Mango, turquoise silver.
- Row 4, column 4: Ultra Rosa, pink silver.
- Row 4, column 5: Ultra Watermelon, watermelon red green.

### Sheet 3

- Row 1, column 1: Ultra Peachy Keen, peach pink.
- Row 1, column 2: Ultra Strawberry Dreams, pale pink silver.
- Row 1, column 3: Ultra Fantasy Ruby Red, ruby red silver.
- Row 1, column 4: Ultra Vice Guava, coral red silver.
- Row 1, column 5: Ultra Blue Hawaiian, ocean blue silver.
- Row 2, column 1: Ultra Wild Passion, violet magenta.
- Row 2, column 2: Ultra Punch, red pink.
- Row 2, column 3: Ultra Red White Blue, blue red white.
- Row 2, column 4: Mango Loco, turquoise orange.
- Row 2, column 5: Pacific Punch, cream red.
- Row 3, column 1: Pipeline Punch, coral pink.
- Row 3, column 2: Rio Punch, purple green.
- Row 3, column 3: Aussie Lemonade, blue yellow.
- Row 3, column 4: Khaotic, orange cyan.
- Row 3, column 5: Viking Berry, purple red.
- Row 4, column 1: Bad Apple, black gold red.
- Row 4, column 2: Voodoo Grape, purple silver.
- Row 4, column 3: Strawberry Lemonade, pink yellow.
- Row 4, column 4: Ripper, yellow green.
- Row 4, column 5: M-80, black yellow.

### Sheet 4

- Row 1, column 1: Khaos, orange gold.
- Row 1, column 2: Mixxd, black magenta.
- Row 1, column 3: Tea + Lemonade, black yellow.
- Row 1, column 4: Peach Tea, black peach.
- Row 1, column 5: Green Tea, black green.
- Row 2, column 1: Wild Berry Tea, black purple.
- Row 2, column 2: Strawberry Lemonade Rehab, black red.
- Row 2, column 3: Watermelon Rehab, black lime.
- Row 2, column 4: Orangeade, black orange.
- Row 2, column 5: Mean Bean, tan brown.
- Row 3, column 1: Loca Moca, dark brown cream.
- Row 3, column 2: Salted Caramel, caramel brown.
- Row 3, column 3: Café Latte, cream brown.
- Row 3, column 4: Irish Crème, olive cream.
- Row 3, column 5: French Vanilla, cream gold.
- Row 4, column 1: Mocha, brown tan.
- Row 4, column 2: Kona Blend, coffee brown.
- Row 4, column 3: Vanilla Light, cream beige.
