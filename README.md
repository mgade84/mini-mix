# Mini Mix 🎈

iPad-friendly web games for children aged 4–10. No ads, no network calls, no tracking. Works offline once installed.

| Game | Age | What it practises |
| --- | --- | --- |
| 🫧 Bubble Pop | 4+ | Tapping/swiping, cause & effect (multi-touch); collect the 3 animals shown in the corner from the bubbles |
| 🎨 Magic Paint | 4+ | Free drawing: crayon, rainbow, glitter, stamps, eraser, save/share |
| 🎹 Animal Piano | 4+ | Music: 8 keys, 3 instruments, slide for glissando, demo song |
| 🚂 Choo-Choo Train | 4+ | Drive with a speed lever, auto-stop at stations, load cargo to continue, horn |
| 🏎️ Grand Prix | 5+ | Realistic 3D first-person racing: pick a car, 2-lap race vs 3 rivals, optional driving assist |
| 🚙 Cool Cars | 4+ | Real photos of 12 car models in a 4×3 grid; tap one and it zooms up, revs and says its brand and model |
| 🍔 Burger Diner | 4–10 | Cook a meal in any order: stack a burger (10 ingredients), slice and fry fries, mix a soda; set the price, pay with coins (with change), then eat it |
| 🔷 Shape Sorter | 4+ | Shapes & colors via drag-and-drop (later rounds: shape only) |
| 🔢 Count It! | 4–6 | Counting 1–10 with spoken numbers and "count together" help |
| 🃏 Memory Match | 4+ | Memory, 6–24 cards |
| 🎈 Balloon Math | 6–10 | Addition, subtraction, multiplication & division |

Games speak short prompts (Web Speech API) so non-readers can play.

**Settings** (hold ⚙️ on the home menu for 3 seconds, so children don't open it by accident): language, sound on/off, the Save button in Magic Paint, reset stars, and *Refresh app* (clears the offline cache and reloads the newest version).

**Languages:** English and Danish — pick it in ⚙️ Settings (defaults to the device language, remembered per device). Text and speech switch together. Car photos in Cool Cars are from Wikimedia Commons (CC BY / CC BY-SA); the photographers are credited in ⚙️ Settings and in `src/games/cars/cars.ts`. Danish speech is pre-recorded with Piper (a natural Danish voice, ~3 MB, cached for offline use), so it sounds right even on devices without a Danish voice; English uses the device's voice.

## Run it

Everything runs in Docker — no local Node needed.

```bash
# Development (hot reload) → http://localhost:5173
docker compose --profile dev up

# Production (nginx) → http://localhost:8080   (change with PORT=80)
docker compose --profile prod up -d --build
```

Open `http://<your-computer-ip>:5173` (or `:8080`) on an iPad on the same Wi-Fi.
For a full-screen, app-like experience: Safari → Share → **Add to Home Screen**.

> Offline support (service worker) only activates over HTTPS or on `localhost`,
> so put the production container behind a TLS reverse proxy if you want it.

If file edits don't trigger a reload in dev (some Docker Desktop setups):
`WATCH_POLLING=true docker compose --profile dev up`.
After changing `package.json`: `docker compose --profile dev up --build -V`.

## Tech

- **Vite + TypeScript, no UI framework.** Games are drawn on `<canvas>` with a small engine in `src/engine/`:
  - `stage.ts` – DPR-aware canvas (capped at 2×), rAF loop with clamped delta time, pauses when the tab is hidden, multi-touch pointer input.
  - `sprites.ts` – offscreen sprite cache; emoji, gradients and shapes are rendered once and blitted.
  - `particles.ts` – pooled particle system (no allocations per frame).
  - `audio.ts` – all sound effects synthesized with Web Audio (no audio files), iOS unlock handling, speech (recorded clips where available, else the Web Speech API).
- **Grand Prix** uses Three.js (WebGL), loaded only when the game is opened (`src/games/race/`): procedural track, car models and cockpit, synthesized engine sound (rpm-driven oscillators + gearbox), arcade physics with optional steering/brake assist, AI opponents with rubber-banding.
- Menu/HUD/overlays are plain DOM with transform/opacity-only CSS animations (GPU-composited).
- iPad specifics: `touch-action: none`, pinch/double-tap zoom and long-press menus disabled, safe-area insets, opaque canvases, fullscreen PWA manifest + icons.
- Core app is ~22 KB gzipped JS; the race game adds a ~160 KB chunk on demand.

## Translations

`src/i18n.ts` holds the current language and `L()`. Each game keeps a small `{ en, da }` message table next to its code (e.g. `const M: Record<Lang, typeof en>`), so TypeScript flags any missing Danish string. Game titles are `{ en, da }` objects on the `GameDef`.

### Danish speech clips

Danish speech is one MP3 per phrase passed to `say()`, named by a hash of its text (`src/engine/clipkey.ts`), plus `phrases.json` listing them, all in `public/voice/da/`. These files are generated, not committed: the production build (`docker compose --profile prod up -d --build`) records them in the Dockerfile's `phrases` and `voice` stages, and Docker's build cache keeps earlier recordings, so only new or changed phrases are recorded (the first build takes a couple of minutes).

For the dev server, generate them once (and again after changing spoken Danish text):

```bash
scripts/voice/build.sh   # writes public/voice/ (git-ignored); needs only Docker
```

Without the clips, Danish falls back to the device voice and the dev server logs a warning per phrase. When you add or change a spoken Danish phrase, also add it to `scripts/voice/phrases.ts`, which builds the list from the real string tables.

The voice is Piper's `da_DK-talesyntese-medium` (Piper is MIT; the voice is trained on a CC0 dataset).

## Adding a game

Create `src/games/mygame.ts` exporting a `GameDef` (see `src/types.ts`) and add it to `src/games/index.ts`.
`start(ctx)` gets the game area, `ctx.addStars()`, `ctx.celebrate()` and `ctx.choose()`; it returns a cleanup function.
