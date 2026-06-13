# AGENTS.md

Instructions for coding agents working in this repository.

## Overview

Browser-based **open-world horror game** built with **Three.js**, bundled by **Vite**, written in **TypeScript**. The current prototype is a first-person scene: pointer-lock camera, WASD movement, jumping, procedural uneven terrain, and placeholder obstacles (buildings, jumpable crates, a spinning debug cube). Collision is custom AABB/capsule-style logic in `controls.ts` — not a physics engine yet. Combat, AI, networking, and real assets are not implemented.

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
index.html          # Canvas mount point (#game)
src/
  main.ts           # Entry: renderer, game loop, resize/HMR lifecycle
  scene.ts          # World setup (lights, terrain, collidable props)
  controls.ts       # FPS camera, input, movement, collision, ground follow
  assets/           # Static assets (empty scaffold today)
dist/               # Build output (gitignored)
personal/           # Private notes (gitignored — do not read or commit)
```

Prefer growing the game by **wiring and extending** `scene.ts` and `controls.ts` from `main.ts`, rather than keeping all logic in one file.

## Architecture

### Entry and loop

- `main.ts` owns the **WebGLRenderer**, **requestAnimationFrame** loop, window resize, and Vite HMR cleanup.
- `createWorld()` in `scene.ts` returns `{ scene, cube, collidables, ground }`. Pass `collidables` and `ground` into `initPlayerControls`.
- `initPlayerControls(domElement, collidables?, groundMesh?)` in `controls.ts` returns a **PlayerAPI**: `camera`, `updateMovement(delta)`, and `dispose()`.
- Movement must be **delta-time based** (`delta` in seconds from `performance.now()`), not per-frame constants.

### World and collision

- Terrain is a subdivided plane with randomized vertex heights; `ground` is raycast for height sampling so the camera follows slopes.
- `collidables` is a flat list of meshes (boxes/buildings) used for horizontal wall sliding, vertical bonks/landings, and jump-over logic.
- Collision tuning constants (player radius, eye height, gravity, jump speed, friction) live at the top of `initPlayerControls` in `controls.ts`.

### Three.js conventions

- Import the core library as `import * as THREE from "three"`.
- Import addons from `three/examples/jsm/...` with the **`.js` extension** (required by `verbatimModuleSyntax`).
- Reuse `THREE.Vector3` instances in the game loop instead of allocating each frame.
- On teardown (HMR `dispose`, scene unload), call `renderer.dispose()`, `controls.disconnect()`, and dispose geometries/materials you create.
- Cap `renderer.setPixelRatio` (currently `Math.min(devicePixelRatio, 2)`) for performance on high-DPI displays.
- The game canvas is `#game` in `index.html`; renderer DOM element is full-viewport (`position: fixed`).

### UI and input

- **Pointer lock** is required for look/move; a click overlay prompts the user before locking.
- Click also requests **fullscreen** (best-effort) for immersion and to suppress some browser shortcuts.
- While locked, game keys call `preventDefault` to block common browser shortcuts (Ctrl/Cmd+W, etc.).
- Keyboard state uses `event.code` (e.g. `KeyW`, `Space`) for layout-independent bindings.
- Do not add frameworks (React, etc.) unless explicitly requested — keep the stack vanilla TS + Three.js.

## TypeScript

`tsconfig.json` enforces:

- `verbatimModuleSyntax` — use `import type` for type-only imports; extensioned ESM paths for Three addons.
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
- Audio, a dedicated physics engine (e.g. Rapier), and asset loading are future concerns; introduce them in dedicated modules when needed.

## Future direction

The game is intended to evolve into an **open-world horror** experience. When adding features, favor small, testable modules (e.g. `src/world/`, `src/player/`, `src/systems/`) over a growing monolith in `main.ts`.
