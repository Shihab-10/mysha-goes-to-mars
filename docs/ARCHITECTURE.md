# Architecture Overview

Mysha Goes to Mars is structured as a modular React + Vite + Three.js project that supports both cinematic storytelling and future playable third-person gameplay.

## Core folders

- `src/app/` — app shell and shared configuration providers.
- `src/game/core/` — mission state, game types, constants, and orchestration.
- `src/game/character/` — Mysha character controller, animation hooks, clothing/outfits.
- `src/game/camera/` — cinematic and third-person camera logic.
- `src/game/physics/` — collision and physics wrappers.
- `src/game/interactions/` — objects the player can inspect, use, or collect.
- `src/game/controls/` — keyboard, mouse, touch, and input abstractions.
- `src/game/levels/` — prologue, level 1, level 2, level 3, level 4, and final mission scenes.
- `src/game/cinematics/` — cutscenes, timeline, dialogue flow, and text presentation.
- `src/game/environments/` — Earth, Mars, mission facilities, and space scene composition.
- `src/game/systems/` — resources, progress, endings, persistence, audio, and asset management.
- `src/game/store/` — state slices for game flow and settings.
- `src/game/ui/` — menus, HUD, checklists, dialogues, endings, and loading screens.
- `src/data/nasa/` — data manifests and scientific domain categorization.
- `src/data/story/` — narrative script and objective data.
- `src/hooks/` — reusable input and loop hooks.
- `src/lib/` — math, storage, and validation helpers.
- `src/styles/` — light global theme and interface styling.

## Public asset folders

The `public/` tree is reserved for runtime assets, including placeholder directories for future models, textures, animations, audio, data, and UI images. File names are intentionally empty placeholders until actual production assets are acquired.

## Current status

This phase contains architecture scaffolding only. No gameplay systems, 3D missions, or production art/audio are implemented yet.
