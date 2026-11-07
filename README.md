<div align="center">

<img src="public/images/level4/mars-mission-debrief.png" alt="Mysha Goes to Mars — cinematic mission debrief on the Martian surface" width="100%" />

# 🚀 MYSHA GOES TO MARS

### *One dream. Four missions. A thousand decisions between Earth and Mars.*

**A cinematic, story-driven, third-person 3D browser game that turns space exploration into an interactive learning experience.**

[![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Three.js](https://img.shields.io/badge/Three.js-3D-111827?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/) [![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)

**[▶ Play the Game](https://mysha-goes-to-mars.vercel.app/)** · **[💻 Source Code](https://github.com/Shihab-10/mysha-goes-to-mars)** · **[🤖 AI Prompt & Development Log](docs/AI_PROMPT_LOG.md)** · **[📚 NASA References](docs/NASA_DATA_SOURCES.md)**

</div>

---

## 🌌 Project at a Glance

| | |
|---|---|
| **Project** | Mysha Goes to Mars |
| **Category** | Educational interactive 3D adventure / science storytelling |
| **Context** | Created as a NASA Space Apps Challenge project |
| **Gameplay** | Single-player, third-person, decision-driven browser experience |
| **Story structure** | Prologue + four playable levels + branching finale |
| **Primary platform** | Desktop web; responsive interfaces and touch-friendly controls where implemented |
| **Live deployment** | [Vercel](https://mysha-goes-to-mars.vercel.app/) |
| **Repository** | [GitHub](https://github.com/Shihab-10/mysha-goes-to-mars) |
| **Scientific approach** | NASA-referenced educational explanations + clearly identified fictional simulation mechanics |
| **AI disclosure** | [Detailed below](#-how-ai-was-used-transparent-disclosure) and in the [prompt log](docs/AI_PROMPT_LOG.md) |

> **The central idea:** What if learning about a mission to Mars felt like *being responsible for one*? Instead of only watching a video or reading facts, players explore, make decisions, face trade-offs, and discover the scientific reasoning behind their choices.

## 🎯 The Problem & Our Solution

**The problem:** Space science concepts—life support, atmospheric conditions, radiation, resource limitations, orbital timing, and mission safety—can be difficult to connect to real decisions through static explanations alone.

**Our solution:** A playable narrative in which the player guides Mysha from an early dream of reaching Mars through mission preparation, an emergency in space, landing, survival, and a possible return journey. Scientific context appears alongside decisions, and the final outcome depends on how the mission was managed.

### What makes the experience different?

- **Story and gameplay are connected:** the protagonist's journey gives each task a reason to exist.
- **A controllable 3D world:** players move Mysha, explore scenes, approach stations, and interact with equipment.
- **Decisions have consequences:** food, water, power, shelter, radiation risk, life support, and rocket readiness interact through game rules.
- **Cinematic transitions:** selected story moments use generated video while exploration and interactions remain code-driven.
- **Four possible outcomes:** there is no guaranteed happy ending.
- **Learning continues after the finale:** a Mars Discovery Archive provides topic-based science explanations and links to NASA resources.

---

## 🎮 The Story: From a Dream to the Red Planet

| Chapter | Player's experience | Learning focus |
|---|---|---|
| **Prologue — The Dream** | Meet Mysha and discover why she wants to explore Mars. | Inspiration, exploration, and scientific curiosity. |
| **Level 1 — Mission Preparation** | Explore the mission facility, verify essential supplies, and prepare for launch. | Checklists, equipment, planning, and mission readiness. |
| **Level 2 — Journey Through Space** | Respond to an oxygen / life-support emergency during the journey. | Oxygen management, power, system repairs, and decision-making under pressure. |
| **Level 3 — Mars Landing** | Manage the approach, allocate mission resources, and carry out the landing sequence. | Landing constraints, trade-offs, and planning for survival. |
| **Level 4 — Life on Mars: The Survival Window** | Explore a Mars base, maintain critical systems, prepare the return rocket, and respond to environmental hazards. | Water recycling, food production, radiation, electricity, crew safety, and return readiness. |
| **Finale — Mission Debrief** | Review the outcome, explore the Mission Log, play again, or learn more about Mars. | Cause and effect, reflection, and science communication. |

### 🌍 → 🚀 → 🪐 → 🏠 → 🌎

The game follows Mysha's fictional journey; it is **not** a claim that humans have already landed on Mars.

---

## 🧑‍🚀 Level 4: The Core Decision-Making Experience

**Level 4** is more than collecting objects. The player works to keep a Mars base operational while preparing a safe return.

### Six interactive workstations

| Station | What the player does | Why it matters |
|---|---|---|
| 🌱 **Hydroponics Lab** | Supports crop production and food supply. | Food depends on water, power, and sustained operations. |
| 💧 **Water Recycling** | Maintains water recovery systems. | Water is scarce and expensive to transport. |
| ☀️ **Solar Power Station** | Maintains panels and electrical generation. | Dust and power shortages affect nearly everything. |
| 🛡️ **Radiation Shelter** | Improves protection and manages exposure risk. | Mars has a thin atmosphere and limited natural shielding. |
| 🏠 **Living Habitat** | Maintains life-support reliability. | A pressurized, controlled environment is essential. |
| 🚀 **Return Rocket Bay** | Improves return-vehicle readiness. | A return attempt requires a prepared vehicle *and* sufficient resources. |

### How a decision works

1. Navigate Mysha toward a station and interact with it.
2. Review the proposed action and its **immediate resource changes**.
3. Read the **later effects** and related NASA research note.
4. Confirm the decision or return to exploration.
5. Continue through the mission's **12 accelerated decision intervals**.
6. Handle the environmental crisis and complete the final readiness check.
7. Approach the return rocket for the final boarding sequence.
8. Receive a decision-dependent ending and Mission Debrief.

**Possible results:** `Mission Successful` · `Partial Success` · `Mission Compromised` · `Mission Failed`.

> **Scientific integrity:** The 12 intervals, Sol progression, percentage meters, resource deltas, readiness thresholds, hazard scores, and ending calculations are **fictional, educational gameplay mechanics**—**not measurements or limits taken from NASA**. The science panels refer to real research, but the game does not claim to process live NASA telemetry.

---

## 🕹️ Controls

| Action | Desktop controls |
|---|---|
| Move | `W` `A` `S` `D` or arrow keys |
| Run | `Shift` (where available) |
| Interact with objects / stations | `E` |
| Rotate / explore camera | Mouse drag / in-game camera controls |
| Additional information | In-game HUD, Map, Science, and Help panels |
| Mobile / touch | Available on-screen controls in supported scenes |

Controls and responsiveness vary by scene; for the best 3D experience, begin on a desktop browser.

---

## 🧠 NASA Science: Reference vs. Simulation

Scientific grounding is a key design goal, but this is still an **original fictional game**. The following sources inform explanations, mission constraints, and educational context.

| NASA / JPL resource | Relevant subject | Use in this game |
|---|---|---|
| [NASA Mars](https://science.nasa.gov/mars/) | Planetary overview and exploration | Mars facts and educational archive. |
| [NASA-STD-3001](https://www.nasa.gov/ochmo/human-spaceflight-and-aviation-standards) | Crew health / human systems | Discussion of astronaut safety and design considerations. |
| [NASA ECLSS](https://www.nasa.gov/missions/station/iss-research/nasas-2023-space-station-achievements/) | Environmental control and life support | Water-recovery and life-support context; **ISS experience, not a proven Mars base**. |
| [MSL Curiosity — RAD](https://data.nasa.gov/dataset/mars-science-laboratory-msl-radiation-assessment-detector-rad-level-2-observation-dosimetr-e2695) | Radiation measurements | Radiation education and hazard explanation. |
| [Perseverance — MEDA](https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/) | Martian weather and dust | Environmental storytelling and Mars weather context. |
| [NASA Growing Plants in Space](https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/) | Space agriculture | Hydroponics and plant-growth learning topics. |
| [JPL Mars 2020 Landing](https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/) | Rover landing context | Landing-story inspiration and mission terminology. |
| [NASA: Rendezvous with Mars](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/rendezvous-with-mars/) | Earth–Mars transfer opportunities | Explaining why return planning involves orbital timing. |

**What is—and is not—integrated:** NASA references and explanatory content are included in the game. **The repository should not be presented as a downloaded, cleaned, or live-connected RAD/MEDA dataset pipeline.** Original data tables, real-time sensor feeds, and official NASA numerical validation are not claimed.

**Independence notice:** This is a student-created educational game and is **not an official NASA product or NASA-endorsed mission simulator**. NASA and mission names are used for attribution and scientific reference.

---

## 🎬 Cinematics, 3D Art & Media Assets

A deliberate hybrid approach is used: **real-time code-driven 3D gameplay** for player control and decisions, with **prerendered cinematic video** for selected story moments.

| Asset in this repository | Role | AI / development disclosure |
|---|---|---|
| `public/videos/mysha-prologue.mp4` | Story introduction | AI-assisted cinematic content; final editing/integration into the web game. |
| `public/videos/level1/level1-departure.mp4` | Level 1 departure cinematic | AI-assisted cinematic content; video playback and progression controlled in React. |
| `public/videos/level4/level4-launch.mp4` | Level 4 launch / return cinematic | AI-assisted multi-shot video workflow; integrated with the decision-dependent ending flow. |
| `public/models/characters/Meshy_AI_Animation_Walking_withSkin.fbx` | Mysha's character / animation asset | Existing FBX asset integrated into the project; this document does not assert a specific creation tool or license without verification. |
| `public/textures/characters/texture_0.png` | Character texturing | Asset used by the 3D character setup. |
| `public/images/level4/mars-mission-debrief.png` | Final mission-debrief composition | AI-generated image; code adds actual responsive, accessible clickable button regions. |
| `public/images/level3/level3-mars-landing.png` | Landing artwork | Cinematic scene artwork incorporated into the interface. |

**Important:** Video generators create the footage; **React, TypeScript, HTML, CSS, and Three.js code** are responsible for navigation, gameplay interactions, resource updates, controls, endings, and UI behavior. A video is **not** presented as live-rendered or interactive 3D.

### Video-generation workflow

The Level 4 cinematic was planned as **three approximately 10-second segments**: (1) approach and boarding, (2) cockpit / countdown, and (3) Mars departure. Character consistency and a 16:9 presentation were considered during prompt development. The clips were assembled for use in a roughly 30-second in-game cutscene. The specific external video-generation model is **not recorded in the available prompt history**, so no provider is falsely credited.

### Media and credit note

Generated and third-party visual assets must be reviewed for use permissions before redistribution beyond this project. The name of an asset file alone does **not** establish its copyright, authorship, or redistribution license.

---

## 🤖 How AI Was Used — Transparent Disclosure

**AI assisted with planning, creative ideation, image/video generation, code drafting, UI iteration, debugging, and documentation. The game was built through an iterative developer-controlled workflow—not by training a custom AI model.**

| Stage | AI assistance / tool category | Developer's role |
|---|---|---|
| **Project planning** | **ChatGPT** helped develop game concept, missions, architecture, technical requirements, and detailed English prompts. | Defined the game goal, requested changes, reviewed architecture and creative direction. |
| **Initial setup / local edits** | **Antigravity / VS Code coding-agent workflow** was used for project scaffolding and code-related tasks. | Operated the local workspace, checked generated files and terminal outputs. |
| **UI exploration** | **Lovable** was used during visual prototyping / landing-screen design exploration. | Selected and iterated on the cinematic design direction. |
| **Game implementation** | **ChatGPT and Claude-assisted code drafting** were used during Level development, including work on Level 4. | Supplied existing source, merged versions, ran builds, tested gameplay, and reported errors. |
| **Images** | **AI image generation** helped create the Mars-themed visual artwork, including the final Mission Debrief image. | Requested composition and English text, selected and integrated assets. |
| **Cinematic video** | **An AI video-generation workflow** helped create video segments for story/launch sequences; provider not verified in the preserved record. | Directed the shots and continuity, supplied prompts, organized MP4 assets, and integrated playback. |
| **NASA educational content** | AI helped summarize and present official science references in game-friendly language. | Supplied/reviewed reference sources and requested clear distinctions from fictional simulation data. |
| **Debugging & deployment** | AI assisted with error investigation, source-code revisions, Git instructions, and Vercel deployment guidance. | Ran actual commands, committed code, pushed to GitHub, deployed, and manually tested results. |

### AI usage boundaries

- **No claim of an AI model trained specifically for this game.**
- **No claim that AI-generated code was automatically correct.** Build and runtime checks matter.
- **No claim that the fictional story or mission outcomes represent NASA forecasts.**
- **No claim of a live API feed or official mission-control access.**
- **Prompts below are a curated set of representative requests, not an exhaustive verbatim chat export.** The [detailed log](docs/AI_PROMPT_LOG.md) marks exact archived material separately from reconstructed versions.

---

## ✍️ Selected English Prompts Used in Development

To make the AI-assisted workflow auditable, the major prompt categories are documented here. **The Phase 0 prompt is preserved from an actual project setup transcript; other examples below are reconstructed from the recorded design goals and development exchanges, unless explicitly noted.** See the [full prompt documentation](docs/AI_PROMPT_LOG.md) for extended versions and more details.

<details>
<summary><strong>Prompt 01 — Project architecture and environment setup (verified excerpt)</strong></summary>

```text
Act as a senior web-based 3D game architect, React/TypeScript engineer,
and technical setup assistant.

Your assignment is to prepare the COMPLETE DEVELOPMENT FOUNDATION
for a new cinematic, story-driven, interactive 3D browser game titled:
MYSHA GOES TO MARS.

This project is being developed for the NASA Space Apps Challenge.

YOUR CURRENT MISSION IS PROJECT INITIALIZATION, ARCHITECTURE,
PACKAGE INSTALLATION, FILE SCAFFOLDING, AND ENVIRONMENT
VERIFICATION ONLY.

Do not attempt to build the full game in this phase.
```

**Evidence:** Exact excerpt from the retained `PHASE 0 — COMPLETE PROFESSIONAL PROJECT ARCHITECTURE & ENVIRONMENT SETUP` prompt.

</details>

<details>
<summary><strong>Prompt 02 — Cinematic third-person gameplay (reconstructed)</strong></summary>

```text
Build an original cinematic browser-based 3D adventure, not a static landing page.
Use React, TypeScript, Three.js, React Three Fiber and Drei.
Make Mysha a controllable third-person character with smooth camera-follow,
walking and interaction controls. Preserve a coherent story across four levels.
Use real-time 3D for exploration and interactions; use prerendered video only
for deliberately cinematic moments. Make the interface responsive.
```

</details>

<details>
<summary><strong>Prompt 03 — Level 2 oxygen crisis (reconstructed)</strong></summary>

```text
Create an interactive spacecraft oxygen emergency for Level 2.
The player should identify the malfunction, make meaningful decisions,
repair relevant equipment and protect life support.
Keep the scene cinematic but actually playable, preserve mission progression,
and explain the scientific reasoning in beginner-friendly language.
```

</details>

<details>
<summary><strong>Prompt 04 — Level 3 Mars landing (reconstructed)</strong></summary>

```text
Design Level 3 as an interactive Mars landing sequence.
Allow the player to allocate 100 mission resource points across competing
priorities, then complete the landing experience with cinematic transitions.
Carry the resource allocation into Level 4. Do not duplicate the landing
or jump straight to the next level without the intended progression.
```

</details>

<details>
<summary><strong>Prompt 05 — Level 4 survival simulation (reconstructed)</strong></summary>

```text
Create Level 4: LIFE ON MARS — THE SURVIVAL WINDOW.
Keep the third-person character and six interactive Mars-base workstations.
Each action must affect realistic categories of fictional game resources:
food, water, power, life support, radiation protection, and rocket readiness.
Add a tutorial, a timed mission structure, a solar/dust crisis, a final
rocket boarding interaction, and four decision-dependent outcomes.
Include a source-linked NASA Science Library. Never label fictional
percentages or risk scores as actual NASA measurements.
```

</details>

<details>
<summary><strong>Prompt 06 — Three-part Mars departure video (reconstructed)</strong></summary>

```text
Create three visually consistent 10-second cinematic clips in 16:9.
Part 1: Mysha approaches the Mars return rocket and enters the spacecraft.
Part 2: Show the cockpit, safety checks, countdown, and engine ignition.
Part 3: Show the rocket departing the Martian surface and ascending into space.
Preserve the same Mysha character, astronaut suit, spacecraft design,
Mars lighting, and visual continuity across every clip.
End before revealing the player's mission outcome.
```

</details>

<details>
<summary><strong>Prompt 07 — Level 4 refinement and animation-jitter repair (documented excerpt)</strong></summary>

```text
Your mission is to upgrade my EXISTING Level 4 into a much more cinematic,
smooth, realistic-looking, responsive and interactive experience.
Do not create a new website. Do not create a new game project.
Do not discard existing gameplay.
Fix Mysha's walking jitter at its actual source.
Keep animation, character movement and camera updates synchronized.
Preserve the rocket boarding, launch video and all four endings.
```

This is a selected excerpt of a longer refinement master prompt drafted during development.

</details>

<details>
<summary><strong>Prompt 08 — Final interactive Mars Mission Debrief (reconstructed)</strong></summary>

```text
Use the supplied Mars Mission Debrief artwork as the final screen after
all four mission outcomes and the Mission Log.
Do not replace the image with another design.
Make PLAY AGAIN and LEARN MORE ABOUT MARS genuinely clickable React buttons.
PLAY AGAIN should start the full story from Level 1 through the parent game route.
LEARN MORE should open a beautiful Mars Discovery Archive with ten NASA-backed
science topics, typewriter text, pause/skip controls, animated visuals,
accessible navigation and responsive mobile layouts.
Preserve the game's existing story and state management.
```

</details>

**Prompt provenance:** The full archived Phase 0 prompt and more detailed, explicitly labeled reconstructed prompts are in **[docs/AI_PROMPT_LOG.md](docs/AI_PROMPT_LOG.md)**. Reconstructed prompts describe the original intent; they should **not** be mistaken for word-for-word copies of an unavailable video generator or AI-agent chat.

---

## 🏗️ Technology Stack

| Area | Technology |
|---|---|
| Web application | React 19, TypeScript 5, Vite 8 |
| 3D world / rendering | Three.js, React Three Fiber, Drei |
| Character assets / animations | FBX asset pipeline, Three.js animation system |
| Physics libraries available | React Three Rapier / Rapier |
| State and effects libraries available | Zustand, GSAP |
| Audio library available | Howler.js |
| Interface | React components, CSS, Lucide React |
| Quality tools | ESLint, Prettier, TypeScript, Vitest, Testing Library |
| Version control | Git + GitHub |
| Hosting | Vercel |

*Note:* Some packages are installed as part of the architecture; installation does not imply every package is actively used by every level.

### Key files and folders

```text
mysha-goes-to-mars/
├── public/
│   ├── images/                  # Cinematic artwork and debrief image
│   ├── models/characters/       # Mysha FBX character asset
│   ├── textures/characters/     # Character textures
│   └── videos/                  # Prologue, Level 1 and Level 4 MP4s
├── src/
│   ├── App.tsx                  # Story/entry experience
│   ├── app/
│   │   ├── GameShell.tsx        # Early playable mission shell
│   │   ├── Level1DepartureCinematic.tsx
│   │   ├── Level2Journey.tsx
│   │   ├── Level3Landing.tsx
│   │   ├── Level3With4.tsx      # Level 3 → Level 4 bridge
│   │   ├── Level4Mars.tsx       # Mars survival and final debrief
│   │   └── MissionMusic.ts
│   ├── game/                    # Shared and scaffolded game modules
│   ├── data/                    # Story and NASA source manifests
│   └── styles/                  # Global and game styles
├── docs/
│   ├── AI_PROMPT_LOG.md         # AI use, actual prompt provenance and examples
│   ├── NASA_DATA_SOURCES.md
│   └── ARCHITECTURE.md
├── tests/
├── package.json
├── vite.config.ts
└── README.md
```

---

## 💻 Run Locally

**Requirements:** a recent compatible Node.js version (check the Vite version's supported Node releases), npm, and a browser with WebGL support.

```bash
# 1. Clone the repository
git clone https://github.com/Shihab-10/mysha-goes-to-mars.git
cd mysha-goes-to-mars

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open the local URL printed by Vite.

### Production build and checks

```bash
npm run build       # TypeScript build + Vite production build
npm run preview     # Preview the built site locally
npm run typecheck   # TypeScript checks
npm run lint        # ESLint
npm run test        # Vitest
```

**Observed validation:** a Windows production build using `tsc -b && vite build` completed successfully with **582 transformed modules** (November 2026). Vite reported a **large JavaScript chunk warning**, not a build failure. The README does **not** claim a complete end-to-end automated gameplay test or universal device compatibility.

---

## 🚀 Deployment

The project is deployed as a static frontend on **Vercel** from the GitHub repository.

| Vercel setting | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `./` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

The `public/` assets become root-relative URLs. For example:

`public/videos/level1/level1-departure.mp4` → `/videos/level1/level1-departure.mp4`

**Media tip:** If a cinematic does not start in the game, open its direct public URL first. A working direct MP4 URL and a failing in-game availability check are two different problems. Browsers can also impose autoplay/audio rules.

---

## 🧪 Current Limitations & Next Steps

- Continue testing the complete Level 1 → Level 4 route on deployed desktop and mobile browsers.
- Improve 3D performance, JavaScript code splitting, and loading progress for slower devices.
- Refine camera, character animation and collision edge cases.
- Audit video availability checks and autoplay handling across browsers.
- Confirm every external science link before final judging/submission.
- Add more automated gameplay tests and accessibility testing.
- Improve source attribution for all third-party and AI-generated media assets.

---

## 📖 Documentation

- **[AI prompts & disclosure](docs/AI_PROMPT_LOG.md)** — exact saved Phase 0 prompt, development workflow, reconstructed English prompt examples, video prompts, and provenance.
- **[NASA source manifest](docs/NASA_DATA_SOURCES.md)** — research-source inventory.
- **[Architecture overview](docs/ARCHITECTURE.md)** — initial modular design; some original scaffold notes may be outdated relative to the current playable build.
- **[Project story](docs/GAME_STORY.md)** — early narrative documentation.

---

## 🙌 Credits & Acknowledgments

**Project development:** [@Shihab-10](https://github.com/Shihab-10) — game direction, source integration, iteration, validation, repository and deployment workflow.

**Research references:** NASA and NASA JPL public educational materials (see linked citations). **Development assistance:** ChatGPT, Claude-assisted drafting, Antigravity / VS Code AI-agent workflow, Lovable visual prototyping, and AI image/video generation, as disclosed above. Specific media-model attribution is intentionally left open where unavailable.

**License:** No open-source license is declared in the repository at the time of this README. Public GitHub visibility does **not** automatically authorize reusing the game's code, videos, character assets, or artwork.

<div align="center">

---

### *The mission may end. Curiosity doesn't.*

**[▶ PLAY MYSHA GOES TO MARS](https://mysha-goes-to-mars.vercel.app/)**

</div>
