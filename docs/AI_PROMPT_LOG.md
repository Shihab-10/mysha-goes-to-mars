# AI-Assisted Development & Prompt Log

**Project:** [MYSHA GOES TO MARS](../README.md)  
**Purpose:** Transparent, judge-friendly disclosure of where AI contributed, how it was directed, and which prompt designs were used.  
**Last compiled:** November 2026

> **Provenance is essential.** This document contains (A) **one exact archived English Phase 0 prompt** recovered from the project conversation, (B) **one verified excerpt** of a later Level 4 enhancement master prompt, and (C) **representative reconstructions** of other English prompts from the recorded creative briefs and development decisions. A reconstructed prompt preserves the task and requirements, **not necessarily the word-for-word text originally submitted**. Do not present these as a complete verbatim history of every AI request.

## 1. Why AI was used

AI helped accelerate repeated prototyping tasks while the developer directed the game's story, testing, implementation choices and revisions:

- Game concept, story structure, educational objectives and technical planning.
- React / TypeScript / Three.js code drafting and iterative repair.
- 3D character-controller improvements and animation-jitter diagnosis.
- NASA source identification and simplified educational explanations.
- AI-assisted image generation and cinematic video-shot prompting.
- Final screen design, responsive overlays, Mars Discovery Archive and typewriter interaction.
- Source integration, Git workflow, debugging and Vercel deployment guidance.

The game **does not train a custom machine-learning model**. The project contains **fictional simulation values** and is **not a NASA telemetry/data-processing pipeline**.

## 2. Tools and contributions

| Tool / workflow | Recorded role | Important limitation |
|---|---|---|
| **ChatGPT** | Planning, English master prompts, scientific framing, explanation, debugging, code integration, AI-generated debrief image. | Generated suggestions must still be validated in the running project. |
| **Claude** | Assisted drafts for sections of Level 4 code during implementation. | The generated parts needed integration, checks and follow-up revisions. |
| **Antigravity / VS Code AI agent** | Local workspace implementation and project preparation from directed prompts. | Local execution depends on permissions and available project files. |
| **Lovable** | Early visual and UI prototyping / design direction. | Visual prototypes do not replace an implemented playable 3D game. |
| **AI video generation** | Cinematic shots for story and launch videos. | The provider/model name is not reliably preserved in the available records; it is intentionally not invented here. |
| **FBX character asset** | Mysha movement/animation asset integration. | The filename is not sufficient proof of the model's creator or license. |

The developer chose visual direction, supplied and evaluated prompts, retained scene assets, merged source, tested behavior, resolved integration problems, and completed the GitHub / Vercel publishing steps.

## 3. Prompt engineering method

1. **Define a concrete mission:** the exact level or scene, player objective and desired gameplay result.
2. **Specify stack and constraints:** React + TypeScript + Vite + Three.js / React Three Fiber; retain existing code, imports and state transitions.
3. **Specify source of truth:** supplied files, screenshots, the character reference, and NASA reference links.
4. **Require real interactions:** no mock buttons or videos passed off as interactive 3D.
5. **Ask for acceptance criteria:** controls, sound, scene navigation, resource math, and proper endings.
6. **Review output and report defects:** missing models, mobile layout, wrong buttons, walking jitter, camera snapping, video availability, routing, and build errors.
7. **Verify and integrate:** compile TypeScript, build Vite, test actual gameplay, then commit/push/deploy.

---

## 4. Representative English prompt library

The prompt examples in Sections 4.1–4.11 are **reconstructed from the development record** except where marked as an archived excerpt. They are included to transparently show the type and rigor of prompt direction behind the game. They are not falsely attributed to a specific AI video service.

### 4.1 Interactive 3D game vision — reconstructed

```text
Act as a senior 3D game architect, cinematic director, and React/TypeScript engineer.
I want MYSHA GOES TO MARS to be an actual playable browser game, not an ordinary
landing page or a slideshow. Use Three.js, React Three Fiber and Drei.

Tell the story of a female protagonist named Mysha: childhood inspiration,
astronaut preparation, spacecraft journey, Mars landing, Mars survival, and a
mission-dependent finale. Use smooth third-person movement, camera follow,
interactive equipment, meaningful decisions, cinematic transitions, and
responsive controls. Keep the experience original, educational, and accessible.

Use NASA materials for scientific context while identifying all gameplay
percentages, countdowns, thresholds, and ending logic as fictional simulation.
```

### 4.2 Premium landing page and story introduction — reconstructed

```text
Design a premium, cinematic and responsive game entry experience for
MYSHA GOES TO MARS. Use a deep-space aesthetic with Earth/Mars artwork,
large editorial typography, restrained neon accents and polished transitions.

Provide a clear Play Story Mode button, a way to understand the story,
and an Explore/Learn pathway. The visual design must support the real game,
not distract from it. Keep Mysha's appearance consistent with the supplied
reference. Adapt typography and navigation for small screens and desktops.
```

### 4.3 Mysha character and third-person movement — reconstructed

```text
Integrate the supplied rigged female FBX character into a React Three Fiber
scene. Allow WASD / arrow movement, Shift to run if supported by available
clips, and E to interact. Use a stable player controller, a camera-follow
system, collision checks, and real animation clips from the model.

Do not invent available FBX animation names. Avoid competing transform updates,
root-motion snapping, camera jumps and shaking. Keep the character grounded
and correctly scaled. Support mobile-friendly controls where possible.
```

### 4.4 Level 1 — preparation and launch — reconstructed

```text
Build Level 1 as an interactive mission-preparation chapter. Let Mysha explore
a mission facility and check the essential supplies: spacesuit, helmet,
oxygen, water, food, medical kit, radio, and tools. The player should understand
why each item is required.

After completing the checklist, guide Mysha to the launch area and trigger
the cinematic departure sequence through a real game interaction. Keep a
clear progression into Level 2. Preserve sound controls, responsiveness,
character animation and saved mission progress.
```

### 4.5 Level 2 — oxygen emergency — reconstructed

```text
Build an interactive oxygen and life-support emergency during the voyage to
Mars. The player must diagnose the problem, manage limited resources and
repair the spacecraft rather than simply click Next.

Use cinematic visual cues and interactive controls. Make consequences clear,
show the scientific ideas behind oxygen / electrical management, and preserve
both failure and recovery states. Do not break the route into the next level.
```

### 4.6 Level 3 — landing and allocation — reconstructed

```text
Create a cinematic but playable Mars approach and landing experience.
Before landing, ask the player to distribute exactly 100 resource-allocation
points among supplies, shielding, power and stability. Validate the total,
explain trade-offs and carry the allocation into the Mars survival level.

Connect Level 3 to Level 4 only after the intended landing sequence has
completed. Avoid a duplicate landing or unintended automatic level skip.
```

### 4.7 Level 4 — survival window and NASA Science Library — reconstructed

```text
Create Level 4: LIFE ON MARS — THE SURVIVAL WINDOW. Mysha must survive on the
Martian surface and prepare a return vehicle. Include an explorable Mars base,
a guided tutorial, and six interactive workstations: living habitat,
hydroponics, water recycling, radiation shelter, solar power, and rocket bay.

Run the mission across 12 accelerated decision intervals with clear resource
previews: food, water, power, life support, shielding, radiation risk and
rocket readiness. Include an environmental emergency and four possible endings.

Add a bundled NASA Science Library with citations. Explicitly distinguish
official references from game-only scores. Nothing should claim to be live
NASA telemetry, downloaded MEDA observations, or actual astronaut dosimetry.
```

### 4.8 Cinematic video — part 1: Mars rocket approach — reconstructed

```text
Create a 10-second cinematic video shot in landscape 16:9, ideally 1920x1080.
Location: a believable Mars research settlement at dusk, with dusty terrain,
pressurized habitat and a waiting return rocket. Mysha approaches the rocket
wearing her consistent mission spacesuit and sealed helmet.

Use smooth movie-camera movement and realistic lighting. Mysha reaches the
boarding area as AURA explains that the departure checkpoint is important.
Maintain continuity of her suit, face reference (only where visible in a safe
pressurized setting), rocket geometry and environmental lighting. Do not show
the rocket already launching or reveal the mission result.
```

### 4.9 Cinematic video — part 2: cockpit and countdown — reconstructed

```text
Create the NEXT 10 seconds of the same cinematic. Preserve the character,
spacesuit, spacecraft cockpit design, color palette and camera quality of
part 1. Show Mysha inside the pressurized cockpit, taking her place,
checking the controls, and completing launch preparations.

AURA discusses the importance of the player's earlier mission decisions.
Build tension through restrained sound design, display panels and a short
countdown. End on engine ignition / the moment immediately preceding liftoff.
Do not reveal the mission outcome yet.
```

### 4.10 Cinematic video — part 3: Mars departure — reconstructed

```text
Create the FINAL 10 seconds of the same 16:9 cinematic sequence. Keep the
same rocket, Mysha, visual quality and Mars environment. Show a controlled
rocket launch from the Martian surface, a cockpit perspective, and the rocket
ascending over the red landscape. End with a cinematic fade suitable for a
transition into an independently calculated Mission Outcome screen.

Do not insert a guaranteed success message, because the actual game's result
must still depend on the player's resource decisions. The failed branch must
not accidentally show a successful liftoff.
```

### 4.11 Reference consistency corrections — reconstructed

```text
Correct the existing cinematic clips for character identity and continuity.
Use the supplied Mysha reference image consistently. Preserve the scene,
shot timing, spaceship, lighting and camera motion while correcting only the
character's face, hairstyle and spacesuit details where necessary.
Do not invent a new protagonist or alter the story progression.
```

### 4.12 Level 4 enhancement — excerpt from the documented master prompt

The following is a **selected excerpt of wording drafted in the recorded Level 4 enhancement conversation**, not the full original master prompt:

```text
You are a senior AAA-inspired 3D game engineer, React/TypeScript architect,
React Three Fiber specialist, Three.js animation engineer, technical artist,
cinematic director, NASA educational content specialist and professional
game UI/UX designer.

Your mission is to upgrade my EXISTING Level 4 into a much more cinematic,
smooth, realistic-looking, responsive and interactive experience.

Do not create a new website.
Do not create a new game project.
Do not discard existing gameplay.
Do not replace real gameplay with a slideshow.

Preserve all working features while implementing the improvements described below.
```

The documented instructions also required investigating root-motion issues, conflicting per-frame transforms, camera collisions, procedural suit jitter, mobile responsiveness, and the distinction between fictional scores and actual NASA research.

### 4.13 Final Mission Debrief & Mars Discovery Archive — reconstructed

```text
After every ending and the Mission Log, show my supplied Mars Mission Debrief
image as the final screen. Preserve the artwork and its composition.

The PLAY AGAIN and LEARN MORE ABOUT MARS labels are baked into the image,
so place real, accessible and responsive React buttons over the matching
image regions. Do not pretend the pixels themselves are clickable.

PLAY AGAIN must restart the story from its actual Level 1 entry through the
parent game routing. LEARN MORE should open a NASA-inspired Mars Discovery
Archive with ten educational topics, animated fact cards, typewriter reveal,
pause / resume / skip, next / previous, navigation back to debrief, and
links to the original NASA research pages.

Keep every branch of the existing Level 4 story intact.
```

### 4.14 Responsive cinematic image and media repair — reconstructed

```text
Analyze the current screenshot and fix the final image so it feels full-screen
on wide desktop screens without black empty columns. Preserve button alignment
and actual clickable targets as the image scales. On portrait mobile screens,
keep the artwork readable and offer large touch-friendly buttons instead of
cropping away the embedded text.

Preserve the game, resource logic and ending behavior. Verify production build
rather than claiming success from visual inspection alone.
```

---

## 5. Exact archived prompt: Phase 0 professional project architecture

**Provenance:** Archived user-provided English prompt from the November 2026 project-setup conversation (`Pasted text(20261103-072610).txt`). It was preserved as text and has not been rewritten here. It represents the **initial development foundation**, not the final playable implementation.

<details>
<summary><strong>Open the full, original Phase 0 prompt (verbatim archived text)</strong></summary>


````markdown
# MYSHA GOES TO MARS
## PHASE 0 — COMPLETE PROFESSIONAL PROJECT ARCHITECTURE & ENVIRONMENT SETUP

### YOUR ROLE

Act as a senior web-based 3D game architect, React/TypeScript engineer, and technical setup assistant.

Your assignment is to prepare the COMPLETE DEVELOPMENT FOUNDATION for a new cinematic, story-driven, interactive 3D browser game titled:

**MYSHA GOES TO MARS**

This project is being developed for the NASA Space Apps Challenge.

The developer is a beginner who will implement the actual game logic later by copying and pasting code into the files you prepare.

**YOUR CURRENT MISSION IS PROJECT INITIALIZATION, ARCHITECTURE, PACKAGE INSTALLATION, FILE SCAFFOLDING, AND ENVIRONMENT VERIFICATION ONLY.**

Do not attempt to build the full game in this phase.

---

# 1. CRITICAL WORKSPACE INSTRUCTIONS

The user has already created and opened this Windows Desktop folder in Visual Studio Code:

`NASA Space Game`

IMPORTANT:

1. Treat the currently opened VS Code workspace as the project root.
2. Inspect the current working directory before doing anything.
3. Do not assume the exact Windows username or Desktop path.
4. Do not create another nested project folder.
5. Do not create `NASA Space Game/mysha-goes-to-mars/`.
6. Do not change the workspace location.
7. Do not delete existing files.
8. Do not overwrite user-created content without verifying it first.
9. If a React/Vite project already exists, inspect and reuse its setup.
10. If the folder is empty, initialize Vite directly in the current directory.
11. If unexpected files or conflicting project configurations exist, handle them safely and explain the conflict rather than force-overwriting anything.
12. Use Windows PowerShell-compatible commands.

All project files should live directly inside:

`NASA Space Game/`

The desired resulting structure is:

```text
NASA Space Game/
├── public/
├── src/
├── docs/
├── scripts/
├── tests/
├── package.json
├── package-lock.json
├── index.html
├── vite.config.ts
├── tsconfig.json
└── README.md
```

Additional configuration files generated by Vite are expected.

---

# 2. UNDERSTAND THE GAME BEFORE DESIGNING THE ARCHITECTURE

This is NOT an ordinary React website.

The final product must be a real cinematic, interactive, third-person 3D game.

The game will combine:

- Cinematic storytelling.
- Realistic adult female 3D protagonist named Mysha.
- Third-person character movement.
- Smooth camera movement.
- Character animations.
- Interactive 3D objects.
- Collision detection and physics.
- NASA-inspired space environments.
- Resource management.
- NASA scientific data.
- Mission decisions.
- Four playable levels.
- Multiple endings.
- Save and replay functionality.
- Responsive browser gameplay.

The game should have the smooth movement and polished interface expected from a modern browser-based 3D game, but it will be an original non-combat Mars exploration adventure.

The story:

**Prologue — The Dream**

Mysha watches Mars in the night sky.

Cinematic typewriter dialogue:

"Mysha shobshomoy raater akashe oi lal bindu ta dekhto ar bhabto..."

"Keu jodi shekhane jete parto?"

"Aj shei keu-ta holo shey nijei."

The cinematic continues with Mysha playing a fictional Mars game, researching NASA missions, learning about Mars, undergoing astronaut training, and eventually preparing for her own fictional mission.

**Level 1 — Launch Preparation**

Mysha explores a mission facility and collects/verifies:

- Spacesuit.
- Helmet.
- Oxygen equipment.
- Water.
- Food.
- Medical kit.
- Radio.
- Tool kit.

After completing the checklist, she boards a rocket and launches toward Mars.

**Level 2 — Space Journey**

A spacecraft life-support emergency occurs.

The player must find and repair the problem, manage oxygen reserves, and conserve electrical power.

**Level 3 — Mars Landing**

The player analyzes environmental conditions, allocates 100 mission resource points, and manually lands the spacecraft.

**Level 4 — Mars Survival**

The player explores a Mars base and manages:

- Oxygen.
- Water.
- Food.
- Radiation protection.
- Solar power.
- Hydroponics.
- Equipment repairs.
- Return-vehicle readiness.

**Final Mission**

The player's decisions determine one of four endings:

1. Mission Successful.
2. Partial Success.
3. Mission Compromised.
4. Mission Failed.

The architecture must support the complete journey without requiring major structural changes later.

---

# 3. TECHNOLOGY STACK

Initialize the project using:

### Core framework

- React 19.
- TypeScript.
- Vite.
- npm.

### 3D engine

- Three.js.
- React Three Fiber v9.
- React Three Drei.

### Physics

- React Three Rapier v2.

### Game state

- Zustand.

### Animation

- GSAP for scripted cinematics.
- Three.js animation mixers for character animations.

### Audio

- Howler.js.

### UI

- CSS with reusable design tokens.
- Lucide React for suitable interface icons.

### Testing

- Vitest.
- React Testing Library.
- jsdom.

### Development tools

- ESLint.
- Prettier.
- TypeScript compiler.

Do not install unnecessary backend frameworks.

Do not install Next.js, Electron, Unity, Unreal Engine, or database servers.

Do not install Tailwind CSS unless there is a demonstrated architectural requirement. Use organized CSS for the initial foundation.

Use official maintained packages and compatible versions.

The preferred compatibility set is:

- React 19.
- React Three Fiber 9.
- React Three Rapier 2.

Check installed versions and peer dependencies.

Avoid alpha, beta and release-candidate versions.

Use the current stable Vite version supported by the installed Node.js version.

Check Node.js compatibility before installation.

Vite currently requires Node.js 20.19+ or 22.12+; verify compatibility rather than assuming every Node 20 installation works.

If the installed Node.js version is incompatible, explain the required upgrade and do not attempt an unsafe automatic system-wide change.

---

# 4. INITIALIZE VITE IN THE EXISTING ROOT

If the current folder is empty, use the equivalent of:

```powershell
npm create vite@latest . -- --template react-ts
```

IMPORTANT:

The dot (`.`) means the current folder.

DO NOT replace it with another folder name.

If Vite prompts about non-empty directory contents, do not delete or overwrite those contents. Inspect first and choose a safe non-destructive initialization method.

Do not run this command if an appropriate Vite project already exists.

After successful initialization:

```powershell
npm install
```

Use npm consistently.

Keep the generated package-lock.json.

Preserve working Vite and TypeScript configuration.

---

# 5. INSTALL THE REQUIRED PACKAGES

Install the following compatible runtime dependencies.

Preferred commands:

```powershell
npm install three @react-three/fiber@^9 @react-three/drei @react-three/rapier@^2 zustand gsap howler lucide-react
```

Development dependencies:

```powershell
npm install -D @types/three @types/howler vitest @testing-library/react @testing-library/jest-dom jsdom prettier
```

Retain necessary development dependencies provided by the React TypeScript Vite template.

Resolve actual dependency compatibility problems if any arise.

Do not bypass dependency conflicts using `--force` or `--legacy-peer-deps` as a default solution.

Do not install duplicate packages.

Additional packages that may be useful later, but SHOULD NOT be installed yet unless needed:

- @react-three/postprocessing
- Asset compression utilities
- Data ingestion libraries
- Advanced audio processing packages
- Additional particle/VFX libraries

Document optional future dependencies separately.

---

# 6. CREATE THE COMPLETE FOLDER ARCHITECTURE

Create the following structure inside the existing root.

Do not modify the root folder location.

```text
NASA Space Game/
│
├── public/
│   ├── models/
│   │   ├── characters/
│   │   ├── spacecraft/
│   │   ├── environments/
│   │   └── props/
│   │
│   ├── animations/
│   │   ├── character/
│   │   ├── cinematic/
│   │   └── interactions/
│   │
│   ├── textures/
│   │   ├── mars/
│   │   ├── earth/
│   │   ├── spacecraft/
│   │   └── characters/
│   │
│   ├── audio/
│   │   ├── music/
│   │   ├── ambience/
│   │   ├── dialogue/
│   │   └── sfx/
│   │
│   ├── images/
│   │   ├── ui/
│   │   ├── backgrounds/
│   │   └── references/
│   │
│   └── data/
│       └── nasa/
│
├── src/
│   │
│   ├── app/
│   │   ├── AppProviders.tsx
│   │   ├── GameShell.tsx
│   │   └── appConfig.ts
│   │
│   ├── game/
│   │   │
│   │   ├── core/
│   │   │   ├── GameDirector.ts
│   │   │   ├── gameTypes.ts
│   │   │   ├── gameConstants.ts
│   │   │   └── missionStateMachine.ts
│   │   │
│   │   ├── character/
│   │   │   ├── MyshaCharacter.tsx
│   │   │   ├── CharacterController.tsx
│   │   │   ├── CharacterAnimations.ts
│   │   │   └── CharacterOutfits.tsx
│   │   │
│   │   ├── camera/
│   │   │   ├── ThirdPersonCamera.tsx
│   │   │   └── CinematicCamera.tsx
│   │   │
│   │   ├── physics/
│   │   │   ├── PhysicsWorld.tsx
│   │   │   └── CollisionLayers.ts
│   │   │
│   │   ├── interactions/
│   │   │   ├── Interactable.tsx
│   │   │   ├── InteractionManager.ts
│   │   │   └── EquipmentPickup.tsx
│   │   │
│   │   ├── controls/
│   │   │   ├── KeyboardControls.ts
│   │   │   ├── MobileControls.tsx
│   │   │   └── InputManager.ts
│   │   │
│   │   ├── levels/
│   │   │   │
│   │   │   ├── prologue/
│   │   │   │   ├── PrologueScene.tsx
│   │   │   │   ├── ChildhoodScene.tsx
│   │   │   │   └── ResearchMontage.tsx
│   │   │   │
│   │   │   ├── level1/
│   │   │   │   ├── LaunchPrepScene.tsx
│   │   │   │   ├── EquipmentChecklist.ts
│   │   │   │   └── RocketLaunchScene.tsx
│   │   │   │
│   │   │   ├── level2/
│   │   │   │   ├── SpaceJourneyScene.tsx
│   │   │   │   ├── OxygenEmergency.ts
│   │   │   │   └── SpacecraftRepair.tsx
│   │   │   │
│   │   │   ├── level3/
│   │   │   │   ├── MarsLandingScene.tsx
│   │   │   │   ├── ResourceAllocation.ts
│   │   │   │   └── LandingController.ts
│   │   │   │
│   │   │   ├── level4/
│   │   │   │   ├── MarsSurvivalScene.tsx
│   │   │   │   ├── MarsHabitat.tsx
│   │   │   │   ├── SurvivalSystems.ts
│   │   │   │   └── StormEvents.ts
│   │   │   │
│   │   │   └── final/
│   │   │       ├── FinalLaunchScene.tsx
│   │   │       └── EndingCinematics.tsx
│   │   │
│   │   ├── cinematics/
│   │   │   ├── CutsceneDirector.ts
│   │   │   ├── CameraTimeline.ts
│   │   │   ├── DialogueTimeline.ts
│   │   │   └── TypewriterText.tsx
│   │   │
│   │   ├── environments/
│   │   │   ├── SpaceEnvironment.tsx
│   │   │   ├── EarthEnvironment.tsx
│   │   │   ├── MarsEnvironment.tsx
│   │   │   └── MissionFacility.tsx
│   │   │
│   │   ├── systems/
│   │   │   ├── ResourceEngine.ts
│   │   │   ├── ObjectiveSystem.ts
│   │   │   ├── DecisionEngine.ts
│   │   │   ├── EndingResolver.ts
│   │   │   ├── SaveManager.ts
│   │   │   ├── AudioManager.ts
│   │   │   └── AssetManager.ts
│   │   │
│   │   ├── store/
│   │   │   ├── useGameStore.ts
│   │   │   ├── useMissionStore.ts
│   │   │   └── useSettingsStore.ts
│   │   │
│   │   └── ui/
│   │       ├── MainMenu.tsx
│   │       ├── MissionHUD.tsx
│   │       ├── MissionChecklist.tsx
│   │       ├── DialogueBox.tsx
│   │       ├── ResourcePanel.tsx
│   │       ├── MissionLog.tsx
│   │       ├── EndingScreen.tsx
│   │       ├── PauseMenu.tsx
│   │       ├── LoadingScreen.tsx
│   │       └── ControlsGuide.tsx
│   │
│   ├── data/
│   │   │
│   │   ├── nasa/
│   │   │   ├── sourceManifest.ts
│   │   │   ├── scientificTypes.ts
│   │   │   ├── crewRequirements/
│   │   │   ├── eclss/
│   │   │   ├── radiation/
│   │   │   ├── meda/
│   │   │   └── landing/
│   │   │
│   │   └── story/
│   │       ├── storyScript.ts
│   │       ├── dialogues.ts
│   │       └── missionObjectives.ts
│   │
│   ├── hooks/
│   │   ├── useKeyboard.ts
│   │   ├── useGameLoop.ts
│   │   └── useInteraction.ts
│   │
│   ├── lib/
│   │   ├── mathUtils.ts
│   │   ├── storageUtils.ts
│   │   └── validation.ts
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   ├── theme.css
│   │   ├── hud.css
│   │   └── cinematics.css
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SETUP_WINDOWS.md
│   ├── ASSET_REQUIREMENTS.md
│   ├── NASA_DATA_SOURCES.md
│   ├── GAME_STORY.md
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── FILE_RESPONSIBILITIES.md
│   └── PHASE_0_REPORT.md
│
├── scripts/
│   └── README.md
│
├── tests/
│   └── setup.test.ts
│
├── .gitignore
├── .prettierrc.json
├── README.md
├── package.json
├── package-lock.json
├── index.html
├── vite.config.ts
└── tsconfig.json
```

The above is the target structure, not a claim that assets or features already exist.

Preserve additional Vite-generated configuration files such as tsconfig.app.json, tsconfig.node.json, eslint.config.js, and src/vite-env.d.ts.

Do not create duplicate files with different names for the same responsibility.

---

# 7. IMPORTANT FILE SCAFFOLDING RULES

Create every specified folder and source file.

However:

**DO NOT IMPLEMENT ACTUAL GAMEPLAY YET.**

For `.ts` and `.tsx` files that will receive real implementation later:

- Add a short TODO comment identifying their purpose.
- Keep them syntactically valid.
- Use `export {}` when no implementation is needed.
- Use minimal typed exports only where required for successful compilation.
- Do not add unnecessary demo gameplay logic.
- Do not generate random placeholder game mechanics.
- Do not create fictional NASA measurements.
- Do not create fake 3D models.
- Do not pretend missing assets exist.

For example, a future module may initially contain:

```ts
/**
 * Phase 0 scaffold.
 * Real implementation will be added in a later phase.
 */
export {};
```

For React components that must be imported immediately, use minimal valid stubs, clearly documented as development scaffolding.

Do not import unfinished modules into the running application unless necessary.

Create `.gitkeep` files inside empty asset directories so Git can preserve the folder layout.

Do not create broken `.glb`, `.fbx`, `.png`, `.mp3`, or `.json` files as placeholders.

The final architecture must be ready for code to be pasted into each file later.

---

# 8. CREATE A MINIMAL WORKING APPLICATION

The project must launch successfully even though the real game has not been implemented.

Create a minimal React application with:

- A clean dark full-screen background.
- Project title: "MYSHA GOES TO MARS".
- Subtitle: "Cinematic 3D Mars Adventure".
- A small label: "Development Foundation — Phase 0".
- A status message: "Project architecture initialized."
- Basic responsive layout.

This screen is only a temporary development status screen.

It must not be presented as the actual game.

Do not create full game menus, fake levels, fake cutscenes or fake player controls.

Keep the initial App.tsx extremely simple so the developer can replace it with the actual game code in the next phase.

Ensure the application uses the intended CSS architecture.

Do not leave broken default Vite styling or conflicting template CSS.

---

# 9. ARCHITECTURAL BOUNDARIES

Prepare the architecture with these responsibilities.

### GameDirector

Future responsibility:

- Current game phase.
- Level transitions.
- Cutscene-to-gameplay transitions.
- Objective completion requirements.

### CharacterController

Future responsibility:

- WASD movement.
- Running.
- Jumping where appropriate.
- Gravity and physics integration.
- Character rotation.
- Movement restrictions during cinematics.

### MyshaCharacter

Future responsibility:

- Load the actual GLB character.
- Apply skeletal animations.
- Use astronaut outfits.
- Render the character within the 3D environment.

Do not assume the character GLB already exists.

### ThirdPersonCamera

Future responsibility:

- Smooth camera following.
- Rotation.
- Camera collision.
- Sensitivity settings.

### InteractionManager

Future responsibility:

- Detect nearby items.
- Activate interactions.
- Handle pickup and equipment verification.
- Trigger interaction animations.

### CutsceneDirector

Future responsibility:

- Cinematic timelines.
- Character reactions.
- Camera movements.
- Typewriter dialogue.
- Transitions between cinematics and gameplay.

### ResourceEngine

Future responsibility:

- Oxygen.
- Water.
- Food.
- Power.
- Radiation exposure estimates.
- Fuel.
- Equipment durability.

### DecisionEngine

Future responsibility:

- Persist mission decisions.
- Apply resource consequences.
- Support alternative story branches.

### EndingResolver

Future responsibility:

- Evaluate mission state.
- Resolve four possible endings.
- Produce explainable mission reports.

### SaveManager

Future responsibility:

- Save/load game state.
- Version stored data.
- Recover safe checkpoints.
- Restore progress.

### AudioManager

Future responsibility:

- Cinematic music.
- Game ambience.
- Character interaction sounds.
- Alarms.
- Volume and mute settings.

These systems must have separate files to prevent one oversized App.tsx from containing the entire game.

Do not implement the above systems during Phase 0.

---

# 10. NASA DATA ARCHITECTURE

Prepare organized storage and TypeScript interfaces for scientific data.

The game will use these official sources.

## NASA Astronaut Requirements

https://www.nasa.gov/wp-content/uploads/2020/10/2022-01-05_nasa-std-3001_vol.1_rev._b_final_draft_with_signature_010522.pdf

## NASA ECLSS

https://www.nasa.gov/wp-content/uploads/2020/10/g-281237_eclss_0.pdf

## NASA MSL RAD Level 2

https://data.nasa.gov/dataset/mars-science-laboratory-msl-radiation-assessment-detector-rad-level-2-observation-dosimetr-e2695

## NASA MEDA Reference

https://science.nasa.gov/resource/medas-radiation-and-dust-sensor/

## NASA MEDA Archive

https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html

## JPL Mars 2020 Landing

https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/

In this phase:

1. Create the scientific data directories.
2. Create the sourceManifest.ts module.
3. Create scientificTypes.ts.
4. Document each official source in NASA_DATA_SOURCES.md.
5. Design a future dataset provenance structure.
6. Distinguish raw, processed, observed, derived and simulated data.
7. Preserve units and timestamps in future data models.
8. Explain that some references are PDF documents, not direct CSV datasets.
9. Do not download large datasets yet.
10. Do not invent numerical observations.
11. Do not install NASA data processing dependencies until actual preprocessing is required.

The final gameplay should later integrate real NASA references with understandable simplified simulation mechanics.

---

# 11. PREPARE 3D ASSET DIRECTORY CONVENTIONS

Document planned asset locations.

Examples of future files:

```text
public/models/characters/mysha.glb

public/models/characters/mysha-spacesuit.glb

public/models/spacecraft/mars-lander.glb

public/models/environments/mars-habitat.glb

public/animations/character/idle.glb

public/animations/character/walk.glb

public/animations/character/run.glb
```

These are target paths only.

DO NOT create fake files at these paths.

Explain in ASSET_REQUIREMENTS.md:

- A PNG/JPG reference image is not a rigged character.
- A usable character requires a properly rigged 3D model.
- Character animation compatibility must be checked.
- Model scale, orientation, skeleton and clips must be validated.
- Blender can help prepare GLB assets.
- Mixamo may help with compatible character animations.
- Only properly licensed assets should be used.
- NASA 3D assets must follow applicable media guidelines.

No asset downloads are required in Phase 0.

---

# 12. CREATE DEVELOPMENT DOCUMENTATION

Create useful, concise documentation.

### README.md

Explain:

- Project purpose.
- NASA Space Apps Challenge context.
- Technology stack.
- Installation.
- Development commands.
- Basic architecture.
- Current development status.
- Next phase.

### ARCHITECTURE.md

Explain the folder layout and how the future game components will interact.

### SETUP_WINDOWS.md

Give beginner-friendly Windows and VS Code instructions for running the project.

### ASSET_REQUIREMENTS.md

Document all major planned character, environment, spacecraft, animation, texture and audio assets.

### NASA_DATA_SOURCES.md

List official sources and planned uses. Explain data provenance.

### GAME_STORY.md

Summarize the full narrative structure:

Prologue → Level 1 → Level 2 → Level 3 → Level 4 → Final Mission.

Include the four endings.

### DEVELOPMENT_ROADMAP.md

Define the planned implementation phases.

### FILE_RESPONSIBILITIES.md

Explain which file will receive which code later.

This is especially important because the developer will copy and paste code file by file.

Make file paths explicit.

### PHASE_0_REPORT.md

Record the actual setup results and any issues.

Do not invent success results.

---

# 13. SET UP TESTING AND PACKAGE SCRIPTS

Create a minimal Vitest setup.

Provide package scripts equivalent to:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "typecheck": "tsc -b",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Merge these scripts safely with the existing package.json.

Do not replace required package metadata or dependencies.

Create one simple setup/smoke test in:

`tests/setup.test.ts`

The test should confirm a basic working development invariant, such as the project configuration or a basic TypeScript utility.

Do not write fake gameplay tests for systems that are not implemented.

Configure Vitest correctly.

Ensure TypeScript and testing configurations do not conflict.

---

# 14. CONFIGURATION AND PROJECT HYGIENE

Ensure:

1. TypeScript strict mode is enabled or preserved.
2. Vite config is valid.
3. ESLint config works.
4. Prettier config is valid.
5. The project uses npm.
6. No hardcoded local Windows absolute paths.
7. No unnecessary React packages.
8. No unsafe TypeScript suppressions.
9. No false character asset imports.
10. No broken placeholder imports.
11. No external APIs required to run the scaffold.
12. No secrets embedded in source code.
13. `node_modules/`, `dist/`, `.env` and local temporary files are excluded through .gitignore.
14. Only safe public configuration is committed to source control.
15. The starter remains lightweight.

Use appropriate casing and predictable names.

Prefer clean modular TypeScript over excessive abstractions.

The project should remain beginner-friendly to understand and maintain.

---

# 15. GIT INITIALIZATION

Check whether the root is already a Git repository.

If not, initialize Git locally:

```powershell
git init
```

Ensure .gitignore is appropriate.

Do not create a GitHub remote automatically.

Do not push code to any online repository.

Do not make a Git commit unless the user authorizes it.

Just prepare the project for future GitHub usage.

---

# 16. VALIDATION — MANDATORY

After creating the structure and installing packages, run:

```powershell
node -v
npm -v
npm ls --depth=0
npm run typecheck
npm run lint
npm run test
npm run build
```

If any command fails:

- Identify the actual error.
- Make minimal necessary fixes.
- Run the failed verification again.
- Do not silence errors without resolving their cause.
- Do not claim a passing test unless it actually passed.

Also verify that:

- App.tsx compiles.
- main.tsx loads the application.
- All planned files exist.
- All planned asset folders exist.
- The project starts using npm run dev.
- The local browser preview displays the scaffold status screen.

You may use a noninteractive local HTTP check to verify the dev server is responding. Do not claim that 3D gameplay or browser interaction was tested in Phase 0.

Stop any background development server you started for verification unless intentionally required by the development environment.

---

# 17. REPORT THE RESULTS

After completion, generate a clear final response.

Use these sections:

### 1. Project Root

Show the actual detected root directory.

### 2. Project Setup

State whether Vite, React and TypeScript were initialized successfully.

### 3. Installed Dependencies

List actual package versions.

### 4. Folder Architecture

Show a readable tree of the created project structure.

### 5. Files Created

State how many source files and folders were created.

### 6. Validation Results

Report:

- Node version.
- npm version.
- TypeScript status.
- ESLint status.
- Vitest status.
- Production build status.
- Local dev-server status if verified.

### 7. Missing Items

List anything incomplete or blocked.

### 8. Next Development Step

Explicitly state:

"Phase 0 complete. Ready for Phase 1: 3D Game Foundation and Mysha Character System."

If Phase 0 did not pass, identify the precise blockers instead.

### 9. Handoff

Tell the developer which exact files will be used first during Phase 1.

Do not implement Phase 1 yet.

---

# 18. STRICT SCOPE CONTROL

This is extremely important.

Do not:

- Build the full game.
- Create functional story levels.
- Create a fake Mysha character.
- Build unrelated authentication systems.
- Add a database.
- Add multiplayer.
- Build weapon or combat systems.
- Create a large dashboard.
- Download large 3D assets.
- Generate cinematic videos.
- Rewrite project structure after creating it.
- Start Phase 1 automatically.
- Make GitHub commits or pushes.
- Claim the game is finished.

The current mission is to establish a stable, clean, professional and scalable foundation.

All real gameplay implementation will be provided and integrated later.

---

# FINAL EXECUTION ORDER

1. Inspect the current VS Code workspace.
2. Detect Node.js, npm and existing project files.
3. Initialize React + TypeScript + Vite in the current root when appropriate.
4. Install compatible game development dependencies.
5. Create the exact folder architecture.
6. Create all planned scaffold modules.
7. Create the minimal status application.
8. Configure styles, testing, linting and formatting.
9. Create architecture and development documentation.
10. Initialize Git locally when necessary.
11. Verify typecheck, lint, tests and build.
12. Fix any setup-related issues.
13. Generate PHASE_0_REPORT.md.
14. Provide the final setup summary.
15. STOP.

**IMPORTANT: Perform the setup actions. Do not merely describe what should be done.**

**DO NOT ASK THE USER TO MANUALLY CREATE THE FOLDERS OR FILES WHEN YOU CAN CREATE THEM DIRECTLY.**

**DO NOT START IMPLEMENTING GAMEPLAY.**

**BUILD THE FOUNDATION NOW, VERIFY IT, AND STOP AT PHASE 0.**
````

</details>

---

## 6. How the prompts were validated

The development process relied on observed evidence rather than assuming an AI draft worked:

- React / TypeScript / Vite production build completed locally (582 transformed modules recorded).
- Gameplay images and code were inspected and revised multiple times.
- A Git repository was initialized in the **game project directory** (not the Windows user profile).
- `.gitignore` was checked, and local backup files were excluded from the first commit.
- The first commit included 153 files, including the three MP4 sequences, character FBX and required images.
- The source was pushed to `Shihab-10/mysha-goes-to-mars` on the `main` branch.
- The Vercel deployment was viewed in a browser.
- A reported Level 1 video warning was investigated by opening the direct MP4 URL; the video loaded, distinguishing asset availability from in-game preflight logic.
- Level 4 screenshots were reviewed for resource decisions, station interactions and user guidance.

**Not claimed:** complete browser automation, end-to-end mobile gameplay certification, scientific validation of every numerical game value, or flawless performance on all devices.

## 7. Prompt authorship and record limits

This log is curated for transparency, reproducibility and ease of review. The exact Phase 0 prompt is preserved above. The later cinematic and game-development prompts are presented as documented intent and reconstructed English examples because complete verbatim transcripts for every external tool were not available. No AI provider, video model, runtime test result or NASA data connection is invented to fill those gaps.

For details on the actual playable project, see the [main README](../README.md).
