# File Responsibilities

## App foundation
- `src/App.tsx` — main development status screen and root application view.
- `src/main.tsx` — root render entry point and stylesheet imports.
- `src/app/` — future providers, app shell composition, and configuration definitions.

## Mission logic
- `src/game/core/*.ts` — mission state, chapter progression, and game constants.
- `src/game/systems/*.ts` — resources, objectives, endings, persistence, and audio.
- `src/game/store/*.ts` — state hooks and global mission state.

## Character and world
- `src/game/character/*.tsx` — Mysha movement, animation, and outfit logic.
- `src/game/camera/*.tsx` — camera behavior and cinematic framing.
- `src/game/environments/*.tsx` — environment scene composition.
- `src/game/physics/*.ts` — physics and collision layers.

## Gameplay flow
- `src/game/levels/*` — per-level scene modules and chapter-specific logic.
- `src/game/cinematics/*.ts` and `*.tsx` — cutscene control, dialogue, and overlay text.
- `src/game/interactions/*.tsx` and `*.ts` — interactive quest items and equipment pickups.

## Data and narrative
- `src/data/nasa/*` — NASA reference manifests and domain-specific scientific structures.
- `src/data/story/*` — story scripts, dialogue definitions, and mission objective text.

## Utilities and UI
- `src/hooks/*` — input and loop hooks.
- `src/lib/*` — helper functions and validation utilities.
- `src/styles/*.css` — global theme, HUD, and cinematic styling.
- `src/game/ui/*.tsx` — HUD, checklist, menu, and narrative UI segments.
