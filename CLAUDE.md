# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Mini Mix is a set of offline-capable, iPad-first web games for children aged 4–10, built with Vite and TypeScript and no UI framework. It makes no network calls and has no ads or tracking. Keep it that way.

## Commands

Docker is the supported workflow, so you don't need Node installed locally:

```bash
docker compose --profile dev up            # Vite dev server, hot reload → http://localhost:5173
docker compose --profile prod up -d --build  # nginx static build → http://localhost:8080 (PORT=… to change)
WATCH_POLLING=true docker compose --profile dev up   # if edits don't trigger reloads
docker compose --profile dev up --build -V           # after changing package.json
```

With Node installed locally (`npm ci` first):

```bash
npm run typecheck   # tsc --noEmit (strict, noUnusedLocals/Parameters)
npm run build       # typecheck + vite build → dist/
npm run dev
```

The project has no test suite and no linter. `npm run typecheck` is the main correctness check. The build targets `es2020`/`safari14` (iPadOS 14+ Safari), so don't use newer runtime APIs without a fallback.

## Architecture

- **Routing** (`src/main.ts`): hash-based routing. `#/` is the menu (`menu.ts`), `#/settings` is the grown-up settings page (`settings.ts`), and `#/<game.id>` mounts a game through `shell.ts`. Each mount returns an unmount function, and `route()` calls it before mounting the next view. Changing the language re-runs `route()`, so views read strings when they mount and don't react to changes afterwards.
- **Game contract** (`src/types.ts`): every game is a `GameDef` registered in `src/games/index.ts`, and the array order is the menu order. `start(ctx: GameContext)` must return a cleanup function that tears down everything the game created: canvases, listeners, timers, audio loops and speech. The shell (`shell.ts`) owns the HUD (home button, star counter), the `celebrate()` and `choose()` overlays, and adds stars to the stored total. Games draw inside `ctx.area` and can put extra DOM in `ctx.shell`. They must leave `ctx.topInset` free for the HUD.
- **Engine** (`src/engine/`), shared by the canvas games:
  - `Stage`: DPR-aware canvas capped at 2×, rAF loop with clamped `dt`, pauses when the tab is hidden, multi-touch pointer callbacks (`down/move/up(x, y, id)`), `onResize`.
  - `sprites.ts`: `cached(key, w, h, draw)`. Pre-render emoji, gradients and shapes once, then blit them each frame.
  - `Particles`: a pooled particle system.
  - `Timers` (in `util.ts`): timers that advance with game time.
  - `audio.ts`: every sound is synthesized with Web Audio; the project has no audio files. It also has `say()` for speech (Web Speech API, using the current language's voice) and handles iOS audio unlocking, which `main.ts` wires up globally.

  The hot render path should not allocate per frame.
- **Multi-file games** keep each game in its own folder:
  - `burger/` is a scene machine. `index.ts` owns the Stage, Particles and Timers and switches between `Scene` objects from `core.ts` (hub, build, fries, soda, price, pay, eat) using `go(name)`. Scenes share the current `Meal` through `Env`.
  - `race/` is the only game that uses Three.js/WebGL. `index.ts` lazy-loads `./game` with dynamic `import()`, so Three.js lands in a separate chunk loaded on demand. Keep any Three.js import out of the eager graph.
- **Storage** (`engine/storage.ts`): `load`/`save` wrap localStorage with the `minimix:` prefix and swallow errors, so private mode doesn't break anything. Settings and the total star count are stored there.
- **Offline**: `public/sw.js` is registered only in production builds. Navigations are network-first and other same-origin GETs are cache-first. The service worker only runs over HTTPS or on localhost.

## Conventions

- **i18n**: supports English and Danish (`src/i18n.ts`). `Txt = Record<Lang, string>`, and `L(x)` picks the current language. Shell and menu strings live in `UI`. Each game keeps its own `{ en, da }` message table next to its code (for example `burger/strings.ts` and `race/strings.ts`), typed as `Record<Lang, typeof en>` so TypeScript flags any missing Danish string. Every new user-facing string, including spoken prompts, needs both languages.
- **Non-readers**: games speak short prompts with `say()`, and gameplay must not depend on reading.
- **iPad/touch**: the page sets `touch-action: none`, blocks pinch-zoom and long-press menus, respects safe-area insets and uses opaque canvases. DOM UI (menu, HUD, overlays) animates with `transform` and `opacity` only, so the GPU can composite it. Support multi-touch through pointer ids.
- **Grown-up gating**: the settings page opens only after holding ⚙️ on the menu for 3 seconds, so children don't open it by accident. Any new grown-up-only option belongs on that page.
- **Bundle size**: the core app is about 22 KB of gzipped JS. Keep heavy dependencies out of the core chunk.
