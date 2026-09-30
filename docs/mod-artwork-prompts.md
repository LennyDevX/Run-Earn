# Airen workshop item artwork — generation prompts

Prompts for the mod and consumable artwork used across `/workshop`, `/collection`,
`/game`, and `/my-nfts`. Every item shares one visual system so the set reads as a
single product line.

## Where the assets go

All artwork lives in `public/items/` as 500×500 PNG with a transparent background.

**File naming convention:**

```text
item<N>_<Slot><EffectField><Tier>.png
```

- `N` — sequential global index across the whole line.
- `Slot` — `Sole` · `Upper` · `Lining` · `Skin` · `Core` · `Boost` · `Skill`.
- `EffectField` — the contract field the item drives, e.g. `WearReductionBps`.
- `Tier` — empty for Common, then `Rare` · `Epic` · `Mythic`.

**Status:**

| Slot | Common | Rare | Epic | Mythic |
| --- | --- | --- | --- | --- |
| Sole | ✅ `item1_SoleWearReductionBps.png` | ✅ `item2_…Rare.png` | ✅ `item3_…Epic.png` | ✅ `item4_…Mythic.png` |
| Upper | ✅ `Item2_…Common.png` | ✅ `Item2_…Rare.png` | ✅ `Item2_…Epic.png` | ✅ `Item1_…Mythic.png` |
| Lining | ✅ `Item1_LiningRepairDiscountBps.png` | ✅ `Item1_…Rare.png` | ✅ `Item1_…Epic.png` | ✅ `Item1_…Mythic.png` |
| Skin | ✅ `Item1_SkinAppraisalBonusBpsCosmeticOverride.png` | ✅ `Item2_…Rare.png` | ✅ `Item3_…Epic.png` | ✅ `Item4_…Mythic.png` |
| Core | ✅ `Item1_CoreAutoActive.png` | ✅ `Item2_…Rare.png` | ✅ `Item3_…Epic.png` | ✅ `Item4_…Mythic.png` |
| Boost | — | — | — | — |
| Skill | — | — | — | — |
| Consumables (7) | — | — | — | — |
| Passive skills (3) | — | — | — | — |

**20 of 28 equippable artworks are done** (5 slots × 4 tiers). Boost and Skill
remain, plus the 7 consumables and 3 passive skill chips.

> **Naming note:** the later batches use a capital `Item<N>_` prefix while the
> Sole batch uses lowercase `item<N>_`. Both are referenced by their exact
> on-disk paths, so nothing breaks — but normalise to the lowercase convention
> for the remaining slots.

Register new items in `MOD_ITEMS` (`src/lib/mod-items.ts`) — the gallery at
`/workshop` renders them automatically once the file exists, and flips the buy
button on as soon as `ModStore.addDesign` registers a matching `slot` + `tier`.

**Reusing the approved Sole line:** the four Sole files are the visual reference.
Generate the remaining slots by keeping the exact same base style block, swapping
only the item-specific paragraph in section 2, and applying the tier escalation
modifier from section 1.

---

## 1. Base style prompt

Prepend this block to **every** item prompt. It is what makes the set coherent.

```text
Retro-futuristic pixel art game item icon, 32-bit SNES-era sprite aesthetic,
crisp hard-edged pixels with zero anti-aliasing, clean isometric three-quarter
view, one single object centered in frame, floating slightly above a soft
elliptical drop shadow, thick dark navy outline, tight palette of midnight navy
#060d17, electric cyan #48d5ff, neon mint #4ce5c0, astral violet #c17aff and
solar gold #ffc84d, cyan rim light on the top-left edges, faint horizontal
scanline texture across the surface, subtle holographic sheen, high contrast and
clearly readable at 64x64 pixels, clean transparent background, sticker-style
game asset, no text
```

### Negative prompt

```text
anti-aliasing, blurry, soft gradients, airbrush, photorealistic, 3D render,
octane render, glossy plastic, subsurface scattering, text, letters, numbers,
watermark, signature, logo, frame, border, multiple objects, clutter, busy
background, scenery, environment, character, hands, low contrast, muddy palette,
oversaturated, jpeg artifacts
```

### Technical spec

- **Aspect:** 1:1 square.
- **Master:** 1024×1024 PNG, transparent background.
- **Ship:** 512×512 (`@1x`) and 1024×1024 (`@2x`); export a 128×128 chip for the
  slot picker.
- **Safe area:** keep the object inside the central 84% so nothing clips when the
  card crops.
- **Lighting:** single key light from the top-left, matching the site's cyan rim.
- **Background rule:** transparent PNG. The app already supplies the dark panel,
  the pixel grid, and the holographic sheen — do not bake those in.

### Tier escalation (append one line)

Every equippable mod exists at four tiers. Use the same base item and escalate:

| Tier | Append this modifier |
| --- | --- |
| Common (0) | `matte worn finish, scuffed edges, single cyan accent, muted grays` |
| Rare (1) | `polished shell, glowing cyan seams, thin light accents, cleaner silhouette` |
| Epic (2) | `violet plasma core, floating detached plates, strong inner glow, energy conduits` |
| Mythic (3) | `gold trim, orbiting light motes, cracked-plasma surface, levitating fragments, most elaborate silhouette` |

---

## 2. Equippable mods (7 slots)

### 2.1 Sole — `wearReductionBps`

> Reduces durability wear per activation. Slot 0.

```text
A rugged high-tech sneaker outsole plate seen from a three-quarter angle:
layered carbon-fiber tread block with deep glowing traction grooves, a chunky
reinforced heel shock absorber, small cyan status lights along the midsole edge,
and a hexagonal grip pattern underneath.
```

- **Common:** plain gray rubber tread, one cyan strip.
- **Rare:** cyan-lit grooves running the full length, brushed metal heel plate.
- **Epic:** violet energy channels between the tread blocks, floating midsole segment.
- **Mythic:** gold-trimmed levitating sole plate with a plasma cushion humming underneath.

### 2.2 Upper — `earnBonusBps`

> Raises the veRUNE earn rate. Slot 1.

```text
A lightweight sneaker upper shell panel: an aerodynamic woven mesh body with
luminous filament threads running through it, a lace-lock mechanism at the
collar, and a small vent grille with cyan light escaping between the weave.
```

- **Common:** flat gray mesh, no glow.
- **Rare:** cyan filament weave glowing at the seams.
- **Epic:** violet self-lacing lattice, threads visibly tightening.
- **Mythic:** gold-threaded nano-mesh with light motes drifting off the surface.

### 2.3 Lining — `repairDiscountBps`

> Discounts the veRUNE repair cost. Slot 2.

```text
A plush sneaker interior lining module: a rolled quilted padding panel with
visible cross-stitching, soft mint light seeping out between the seams, and a
small woven repair sigil stitched into the center.
```

- **Common:** plain cream quilting, faint stitch marks.
- **Rare:** mint glow between the seams, denser quilted padding.
- **Epic:** violet stitch-work forming a rune, padding visibly self-knitting.
- **Mythic:** gold-trimmed padding with a floating mint sigil hovering above it.

### 2.4 Skin — `appraisalBonusBps` + cosmetic override

> Raises the appraiser valuation and restyles the sneaker. Slot 3.

```text
A colorway paint module: a floating holographic paint chip fan — three
overlapping swatches in violet, cyan and mint — beside a sleek pixel-art spray
nozzle releasing a ribbon of pigment that curls into a small sneaker silhouette.
```

- **Common:** two flat matte swatches, dull nozzle.
- **Rare:** three glossy cyan-toned swatches, crisp pigment ribbon.
- **Epic:** five iridescent swatches, violet pigment forming a full sneaker outline.
- **Mythic:** a full holographic palette wheel, gold nozzle, pigment ribbon spiraling with sparkles.

### 2.5 Core — `autoActive`

> Keeps the sneaker earning without manual activation. Slot 4.

```text
A circular reactor module: a spinning gyroscopic core with a bright pulsing
center, two orbiting metal rings at different angles, exposed cyan energy coils
around the rim, and small bolt heads on the outer casing.
```

- **Common:** single static ring, dim center.
- **Rare:** two rings, bright cyan center, visible motion arcs.
- **Epic:** three counter-rotating rings, violet plasma heart, energy arcs between rings.
- **Mythic:** gold housing, four rings, a blinding white-mint core throwing off sparks.

### 2.6 Boost — `stakingBoostBps`

> Adds staking APY while the sneaker is locked. Slot 5.

```text
A compact rocket booster pod: a stubby thruster cylinder with a glowing mint
exhaust cone at the bottom, three stabilizer fins, a fuel gauge window on the
side, and a small cyan ignition coil on top.
```

- **Common:** scuffed metal canister, no flame.
- **Rare:** lit mint exhaust cone, clean casing, visible gauge.
- **Epic:** violet flame with shockwave rings, fin tips glowing.
- **Mythic:** gold-plated pod, dual exhaust plumes, floating thrust ring, most detailed.

### 2.7 Skill — `skillBonusBps`

> Permanent earn bonus from a level-unlocked skill NFT. Slot 6.

```text
A crystalline skill chip: a hexagonal wafer with a star-shaped circuit etched
into its face, level pips arranged along the bottom edge, a beveled rim catching
the light, and a faint holographic projection of a star hovering just above it.
```

- **Common:** dull gray wafer, one lit pip.
- **Rare:** cyan crystal, three lit pips, faint projection.
- **Epic:** violet crystal, five lit pips, solid star projection.
- **Mythic:** gold-rimmed crystal, all pips lit, large radiant star projection with motes.

---

## 3. Consumables (7 abilities)

Consumables burn on use, so their art should read as **single-use and sealed** —
foil, caps, seals, gauges — unlike the reusable slot mods.

### 3.1 Repair Kit — `aux 0 / 255`

> Full health restore. No energy cost.

```text
A compact field repair canister: a metal tool case with a latched lid open to
reveal a wrench, a curved needle, and a glowing mint gel tube, with a small
cross emblem stamped on the case and a rolled patch of sneaker fabric beside it.
```

### 3.2 Surge — `aux 1`

> Instant activation, bypasses the 24h cooldown. Costs 2 energy.

```text
A lightning-bolt energy cell: a small glass vial with copper terminals at both
ends, a cyan electric arc crackling between the poles, a foil seal on the cap,
and tiny lightning glyphs etched into the glass.
```

### 3.3 Boost Capsule — `aux 2`

> Temporary earn-rate boost for 24h. Costs 1 energy.

```text
A pill-shaped boost capsule: a half-transparent gel capsule revealing swirling
mint energy inside, a chrome band around the middle, and a small analog timer
dial on the side showing a 24-hour arc.
```

### 3.4 Service Kit — `aux 3`

> Restores a worn veSneaker to pristine condition. No energy cost.

```text
A sneaker care kit: a folded microfibre cloth beside a slim maintenance
canister, a soft-bristle brush, and a small glowing mint vial of conditioner,
arranged on a compact hexagonal tray with a stitch-pattern emblem.
```

### 3.5 Overdrive — `aux 4`

> Stronger earn-rate boost for 48h. Costs 3 energy.

```text
An oversized power cell: a heavy ribbed canister with a violet plasma core
visible through a reinforced window, diagonal hazard stripes on the shoulder,
heat vents along the side, and a pressure gauge reading near maximum.
```

### 3.6 Stim Pack — `aux 5`

> Instantly refills energy to max. No energy cost.

```text
A medical injector ampoule: a sleek syringe-shaped vial filled with luminous
mint fluid, a chrome plunger, a pressure gauge on the barrel, and a small
lightning-plus emblem etched near the needle guard.
```

### 3.7 Lucky Repair — `aux 6`

> Full health restore plus a temporary earn boost. Costs 1 energy.

```text
A four-leaf clover repair charm fused with a miniature wrench: the clover made
of glowing mint metal, a golden halo ring around it, tiny sparkles orbiting,
and a small crossed-wrench emblem at the stem.
```

---

## 4. Passive skill chips (level-gated)

These are the non-consumable Skill-slot NFTs seeded by `scripts/seed-skills.ts`.
The consumable skill seeds (`Overdrive Cell`, `Stim Pack`, `Lucky Repair`) reuse
the consumable artwork from section 3 — do not draw them twice.

### 4.1 Focus Chip — level 2, tier 0, `+2%` earn

```text
A small processor chip: a square silicon die on a green-gray substrate with a
single glowing cyan targeting reticle etched into the face, gold contact pins
along two edges, and one lit indicator dot in the corner.
```

### 4.2 Momentum Core — level 6, tier 2, `+4%` earn

```text
A spinning flywheel core: concentric violet light rings rotating around a bright
center hub, visible motion-blur arcs trailing behind each ring, and a brushed
metal housing with three mounting lugs.
```

### 4.3 Apex Instinct — level 8, tier 3, `+8%` earn

```text
A crowned apex module: a golden hexagonal core crowned with a five-point star,
radiating concentric light rings in mint and cyan, tiny orbiting motes, and
engraved chevron marks around the rim.
```

---

## 5. Generation checklist

1. Generate the **Common** tier first and lock the silhouette — every other tier
   is that same silhouette with more detail.
2. Keep one object per image. If the model adds scenery, regenerate rather than crop.
3. Verify readability at 64×64 before approving; if the effect is unreadable at
   that size, simplify rather than adding detail.
4. Check the set side by side: palette should feel identical across all items.
5. Export transparent PNGs, then run them through the existing icon pipeline
   pattern (`scripts/generate-icons.mjs`) if a flat raster is needed.
6. Keep the 512×512 `@1x` under ~120 KB each so the workshop grid stays light.

## 6. Palette reference

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--color-ink` | `#060d17` | `#060d17` | Outlines, drop shadows |
| `--color-brand` | `#48d5ff` | `#007b9e` | Primary rim light, Rare accents |
| `--color-mint` | `#4ce5c0` | `#0d9488` | Healing, energy, positive effects |
| `--color-astra` | `#c17aff` | `#7835b8` | Epic accents, plasma |
| `--color-sol` | `#ffc84d` | `#875000` | Mythic trim, solar gold |
| `--color-magma` | `#ff705e` | `#ff705e` | Consumable danger, Overdrive |
