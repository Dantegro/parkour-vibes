# AGENTS.md

Instructions for coding agents working in this repository.

## Overview

Browser-based **parkour / vibe game** built with **Three.js**, bundled by **Vite**, written in **TypeScript**. The first major version targets chill, flowy movement across a procedural world — parkour over stacked obstacles toward a goal — with **multiple game modes** (e.g. free open-world exploration, timed runs to a landmark, and a hunted variant with AI pursuit). Scope and PRD are still evolving; treat mode details as directional, not final spec.

The current prototype has a **main menu** (game-mode selection, volume slider) and lazy world init: the 3D scene and player controls are created only after the user starts the game. In-world: pointer-lock camera, WASD movement, jumping, procedural uneven terrain with vertex-colored grass, and placeholder obstacles (buildings, jumpable crates, a spinning debug cube as the eventual goal marker). Collision is custom AABB/capsule-style logic in `src/player/` — not a physics engine yet. **Background music** (`audio.ts`) plays from menu onward. Timed objectives, AI hunters, networking, and real 3D assets are not implemented yet.

## Commands

Use **pnpm** (lockfile: `pnpm-lock.yaml`).

| Action | Command |
|--------|---------|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` |
| Typecheck + build | `pnpm build` |
| Preview production build | `pnpm preview` |

There is no test runner or linter script configured yet. After meaningful changes, run `pnpm build` to verify TypeScript and the Vite bundle.

## Project layout

```
index.html                        # Canvas mount point (#game)
accessibility-devtools.config.yml # BrowserStack a11y component mappings for ui/*.ts
public/
  favicon.svg, icons.svg          # Static icons
  sounds/                         # Audio served at /sounds/... (e.g. lofi-ambient.mp3)
src/
  main.ts           # Entry: renderer, main menu, lazy game start, audio, loop, HMR
  scene.ts          # World setup (lights, terrain, collidable props)
  controls.ts       # FPS camera, input, PointerLockControls; wires player/ + game overlay
  audio.ts          # Background music (HTMLAudioElement, volume, toggle)
  player/
    constants.ts    # Movement/collision tuning (gravity, speed, radii, tolerances)
    movement.ts     # Horizontal move, gravity, jump; calls collision resolvers
    collision.ts    # Wall sliding, floor/landing, ground height sampling
  ui/
    mainMenu.ts     # Home screen (game mode, start, volume slider)
    gameOverlay.ts  # Full-screen “click to start” pointer-lock overlay
    a11y.ts         # ARIA helpers and screen-reader-only styles
dist/               # Build output (gitignored)
personal/           # Private notes (gitignored — do not read or commit)
```

Prefer **small modules** under `src/player/` and `src/ui/` rather than growing `main.ts` or `controls.ts`. `controls.ts` should stay a thin integration layer (camera, PointerLockControls, key state, spawn placement).

## Architecture

### Entry and loop

- `main.ts` owns the **WebGLRenderer**, **main menu**, **background music**, lazy `createWorld()` / `initPlayerControls()` on start, **requestAnimationFrame** loop, window resize, and Vite HMR cleanup.
- The canvas is **hidden** (`display: none`, `aria-hidden`) until the game starts; the menu is the initial UI.
- `createWorld()` in `scene.ts` returns `{ scene, cube, collidables, ground }`. Pass `collidables` and `ground` into `initPlayerControls`.
- `initPlayerControls(domElement, collidables?, groundMesh?)` in `controls.ts` returns a **PlayerAPI**: `camera`, `controls` (PointerLockControls), `updateMovement(delta)`, and `dispose()`.
- Movement must be **delta-time based** (`delta` in seconds from `performance.now()`), not per-frame constants.

### Player movement and collision

- `controls.ts` reads keyboard into `MovementInput` and delegates to `updatePlayerMovement()` in `player/movement.ts`.
- `player/collision.ts` handles horizontal wall resolution, vertical floors/landings, step-up, terrain stick, and `sampleGroundHeight` / `placePlayerOnGround`.
- Tuning constants live in `player/constants.ts` (gravity, jump speed, move speed, player radius/height, friction, step height, land snap, terrain stick).
- `collidables` is a flat list of meshes (boxes/buildings) used for horizontal wall sliding, vertical bonks/landings, and jump-over logic.
- Terrain is a subdivided plane with randomized vertex heights and height-based vertex colors; `ground` is raycast for height sampling so the camera follows slopes.

### Audio

- `audio.ts` wraps a looping `HTMLAudioElement`; default track `/sounds/lofi-ambient.mp3` (file under `public/sounds/`).
- `initBackgroundMusic()` on load; `playBackgroundMusic()` from a user gesture (game-mode click or start).
- **M** toggles music; **[** / **]** (or **-** / **+**) adjust volume globally (menu slider uses the same `setMusicVolume` / `getMusicVolume`).
- Call `disposeBackgroundMusic()` on HMR teardown.

### Three.js conventions

- Import the core library as `import * as THREE from "three"`.
- Import addons from `three/examples/jsm/...` with the **`.js` extension** (required by `verbatimModuleSyntax`).
- Reuse `THREE.Vector3` instances in the game loop instead of allocating each frame.
- On teardown (HMR `dispose`, scene unload), call `renderer.dispose()`, `controls.disconnect()`, `disposeBackgroundMusic()`, and dispose geometries/materials you create.
- Cap `renderer.setPixelRatio` (currently `Math.min(devicePixelRatio, 2)`) for performance on high-DPI displays.
- The game canvas is `#game` in `index.html`; renderer DOM element is full-viewport (`position: fixed`).

### UI and input

**Main menu** (`ui/mainMenu.ts`): user must select a game mode, then click Start (or **Enter**). Selecting a mode starts background music. Volume slider on menu only; keyboard volume keys work in-game too.

**In-game** (`ui/gameOverlay.ts`): after the world loads, a full-screen overlay prompts **click** for pointer lock; click also requests **fullscreen** (best-effort). Overlay reappears on unlock.

- While pointer-locked, game keys call `preventDefault` to block common browser shortcuts (Ctrl/Cmd+W, etc.).
- Keyboard state uses `event.code` (e.g. `KeyW`, `Space`) for layout-independent bindings.
- Movement input uses safe key lookups (`keys["KeyW"] ? 1 : 0`) so opposite keys never pressed do not produce NaN.
- Do not add frameworks (React, etc.) unless explicitly requested — keep the stack vanilla TS + Three.js.

### Accessibility

- `ui/a11y.ts` provides `applyA11y`, `srOnly`, and `ensureSrOnlyStyles` for menu and overlay elements.
- `index.html` sets `role="application"` and `aria-label` on the canvas; menu/overlay factories set ARIA attributes.
- `accessibility-devtools.config.yml` maps UI factory functions to semantic elements for BrowserStack Accessibility DevTools linting.

## TypeScript

`tsconfig.json` enforces:

- `verbatimModuleSyntax` — use `import type` for type-only imports; extensioned ESM paths for Three addons and local modules (e.g. `./player/movement.js`).
- `noUnusedLocals` / `noUnusedParameters` — remove dead code.
- `erasableSyntaxOnly` — no `enum` or `namespace`; prefer unions and `const` objects.
- Exhaustive `switch` on unions: use a `never` check in the `default` case.

Keep imports at the **top of the file**; avoid inline imports unless breaking a documented circular dependency.

## Making changes

1. **Minimize scope** — match existing style; don't refactor unrelated code.
2. **No secrets** — never commit API keys, tokens, or `.env` values.
3. **No debug instrumentation** — remove temporary logging, localhost ingest calls, and `localStorage` debug buffers before finishing unless the user asked for them. Do not leave `#region agent log` helpers or session-scoped debug fetchers in source.
4. **Don't touch `personal/`** — it is gitignored and out of scope.
5. **Don't commit** unless the user explicitly asks.
6. **Verify** — run `pnpm build` after non-trivial edits.

## Performance and game feel

- Target 60 FPS on mid-range hardware; profile before adding heavy post-processing or high-poly assets.
- Prefer instancing or merged geometry for many repeated props (buildings, foliage).
- Use fog and draw-distance (`camera.far`) intentionally — the scene already uses `FogExp2`.
- Collision currently rebuilds `Box3` bounds per mesh per frame; cache bounds if collidable count grows.
- A dedicated physics engine (e.g. Rapier) and glTF/asset loading pipelines are future concerns; introduce them in dedicated modules when needed.

## Future direction

The game is intended to evolve into a **parkour-first vibe experience** with distinct modes sharing the same world and movement feel. When adding features, favor small, testable modules (e.g. `src/world/`, `src/systems/`, more under `src/player/`) over a growing monolith in `main.ts`.
