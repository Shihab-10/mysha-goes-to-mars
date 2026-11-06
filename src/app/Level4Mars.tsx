/**
 * MYSHA GOES TO MARS — LEVEL 4 · LIFE ON MARS: THE SURVIVAL WINDOW
 * PART 1 OF 2 — foundation, NASA science library, save system, audio engine, 3D world, character, movement + camera.
 *
 * Part 2 (appended directly below this file) owns: the default-exported Level 4 component, tutorial state machine,
 * UI / JSX / CSS, decision interface, campaign progression, crisis, countdown, endings, Mission Log, replay.
 *
 * Honest notes:
 *  - All percentages, thresholds, "Sol" labels and endings are GAME SIMULATION values, not NASA measurements.
 *  - Science entries are bundled text. Entries are marked verified:false unless the source was opened while building;
 *    nothing here was fetched or processed from NASA datasets. Confirm each entry before release.
 *  - The astronaut suit is generated procedurally from Mysha's skeleton (stylised, NOT photorealistic). If the rig cannot
 *    be analysed, a simpler helmet + life-support pack fallback is used. A fully fitted suit needs a dedicated rigged asset.
 *  - Only the clips inside the existing FBX are used (walk, plus idle/run only if the file actually contains them).
 */
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useFBX, useTexture } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

/* ============================================================================
 * SECTION A — CONSTANTS, SHARED TYPES, SIMULATION UTILITIES
 * ========================================================================== */
export const BASE: string = import.meta.env.BASE_URL;
export const MODEL = `${BASE}models/characters/Meshy_AI_Animation_Walking_withSkin.fbx`;
export const TEX = `${BASE}textures/characters/texture_0.png`;
export const TOTAL_DAYS = 12;
export const CRISIS_DAY = 6;
export const ARRIVAL_SECONDS = 9;
/** public/videos/level4/level4-launch.mp4 — 30-second success/partial/compromised departure cutscene. */
export const LAUNCH_VIDEO_SRC = `${BASE}videos/level4/level4-launch.mp4`;
export const IN_X = 300;
export const clamp = (n: number, a = 0, b = 100) => Math.min(b, Math.max(a, n));

export type R<T> = { current: T };
export type Stage = "intro" | "tutorial" | "explore" | "decision" | "debrief" | "crisis" | "window" | "boarding" | "video" | "ending";
export type TutorialStep = "welcome" | "look" | "move" | "run" | "approach" | "interact" | "habitat" | "resources" | "complete";
export type TutorialInfo = { id: TutorialStep; title: string; body: string; goal: "none" | "move" | "run" | "approach" | "interact" | "enter" | "read" };
export const TUTORIAL_STEPS: TutorialInfo[] = [
  { id: "welcome", title: "Welcome to your Mars base", body: "AURA will guide you through the base. Nothing here is timed.", goal: "none" },
  { id: "look", title: "Look around", body: "Drag on the view to rotate the camera.", goal: "none" },
  { id: "move", title: "Walk", body: "Use W A S D or the arrow keys (or the touch pad) to walk.", goal: "move" },
  { id: "run", title: "Run", body: "Hold Shift (or push the pad fully) to run.", goal: "run" },
  { id: "approach", title: "Follow the beacon", body: "Walk into the glowing waypoint.", goal: "approach" },
  { id: "interact", title: "Interact", body: "Stand near a station and press E (or the E button).", goal: "interact" },
  { id: "habitat", title: "Enter the habitat", body: "Use the airlock door. Inside, the cabin is pressurized.", goal: "enter" },
  { id: "resources", title: "Read the meters", body: "Food, water, power, life support, shelter and rocket readiness are game scores.", goal: "read" },
  { id: "complete", title: "Training complete", body: "Choose how to spend each mission interval.", goal: "none" },
];
export type Allocation = { supplies: number; shielding: number; power: number; stability: number };
/** Every field is a 0–100 GAME SIMULATION score. */
export type Res = {
  food: number; water: number; power: number; life: number; shield: number; rocket: number;
  crops: number; recycle: number; dust: number; exposure: number;
};
export type Act = "hydro" | "water" | "rocket" | "habitat" | "shelter" | "solar" | "contingency";
export type Posture = "storm_shelter" | "storm_essential" | "storm_limited";
export type Outcome = "success" | "partial" | "compromised" | "failed";
export type LogEntry = { day: number; title: string; detail: string; act: Act | "crisis" | null; sci?: string };
export type EnvEvent = { id: string; fromDay: number; toDay: number; kind: "solar_particle" | "dust"; title: string; body: string; sci: string };
export type SpotId = "door" | "hydro" | "water" | "rocket" | "solar" | "shelter" | "console" | "rack" | "exit";
export type Loc = "outdoor" | "indoor";
export type CamMode = "arrival" | "follow" | "inspect" | "launch";
export type Objective = { id: string; x: number; z: number; r: number; label: string; loc: Loc };
/** Single mutable world state read per-frame by the 3D scene. Held in a ref by Part 2; never in React state. */
export type Shared = {
  pos: THREE.Vector3; heading: number; moving: boolean; running: boolean; yaw: number; arrivalT: number;
  keys: { f: boolean; b: boolean; l: boolean; r: boolean; run: boolean };
  /** Touch pad: x right(+), y forward(+), each -1..1. */
  joy: { x: number; y: number };
  enabled: boolean; loc: Loc; /** true inside a sealed, pressurized habitat: suit pieces hidden only then. */ pressurized: boolean;
  near: SpotId | null; res: Res; day: number; storm: boolean; alert: boolean;
  launching: boolean; launchT: number; objective: Objective | null; camMode: CamMode; focus: { x: number; z: number } | null;
  reduced: boolean; snapCam: boolean; outcome: Outcome | null;
  boarding: boolean; boardT: number; boardFrom: THREE.Vector3; boardTo: THREE.Vector3;
};
export type ModelStatus = { state: "ready" | "error"; suit: "fitted" | "fallback"; note: string };
export type Save = {
  version: 2; allocation: Allocation; carried: boolean; stage: "mission" | "ended"; day: number; res: Res;
  log: LogEntry[]; storm: Posture | null; outcome: Outcome | null; replays: number; contingency: boolean;
};

export const DEFAULT_PLAN: Allocation = { supplies: 25, shielding: 25, power: 25, stability: 25 };
export const ACTS: Record<Act, { label: string; icon: string; spot: SpotId; summary: string; sci: string }> = {
  hydro: { label: "Hydroponics", icon: "🌱", spot: "hydro", summary: "Raise crop growth and food reserve. Uses power.", sci: "plants" },
  water: { label: "Water recovery", icon: "💧", spot: "water", summary: "Raise water reserve and recycling efficiency. Uses power.", sci: "eclss98" },
  rocket: { label: "Rocket preparation", icon: "🚀", spot: "rocket", summary: "Advance return-vehicle readiness. Uses power.", sci: "window" },
  habitat: { label: "Life-support check", icon: "🏠", spot: "console", summary: "Restore life-support reliability from inside the habitat.", sci: "eclss-air" },
  shelter: { label: "Radiation shelter", icon: "🛡️", spot: "shelter", summary: "Raise shelter readiness and lower exposure risk. Uses power.", sci: "rad-types" },
  solar: { label: "Solar power", icon: "☀️", spot: "solar", summary: "Clean the panels and raise the battery reserve.", sci: "dust-power" },
  contingency: { label: "AURA contingency review", icon: "✦", spot: "console", summary: "Unlocked by replay: improves several systems at a high power cost.", sci: "std3001" },
};
export const SPOT_LABEL: Record<SpotId, string> = {
  door: "HABITAT AIRLOCK", hydro: "HYDROPONICS LAB", water: "WATER RECYCLER", rocket: "RETURN ROCKET BAY", solar: "SOLAR ARRAY",
  shelter: "RADIATION SHELTER", console: "LIFE-SUPPORT CONSOLE", rack: "ECLSS RACK", exit: "AIRLOCK EXIT",
};
export const ENV_EVENTS: EnvEvent[] = [
  { id: "spe", fromDay: 7, toDay: 7, kind: "solar_particle", title: "Solar particle alert", sci: "rad-types",
    body: "A fictional solar energetic particle event raises radiation exposure risk. Shelter readiness matters." },
  { id: "dust", fromDay: 7, toDay: 8, kind: "dust", title: "Dust reduces solar output", sci: "dust-power",
    body: "A separate fictional dust episode lowers solar generation. Dust and radiation are different hazards." },
];
export const eventsForDay = (day: number) => ENV_EVENTS.filter(e => day >= e.fromDay && day <= e.toDay);
export const solLabel = (day: number) => String(1 + (day - 1) * 22).padStart(3, "0");

export function initialRes(a: Allocation): Res {
  return {
    food: clamp(63 + (a.supplies - 25) * 0.75), water: clamp(66 + (a.supplies - 25) * 0.64), power: clamp(64 + (a.power - 25) * 0.7),
    life: clamp(70 + (a.stability - 25) * 0.4), shield: clamp(50 + (a.shielding - 25)), rocket: clamp(35 + (a.stability - 25) * 0.75),
    crops: 18, recycle: 56, dust: 12, exposure: clamp(30 - (a.shielding - 25) * 0.5),
  };
}
/** Deterministic game rule: one chosen priority per interval plus passive drift. No randomness. */
export function applyAct(res: Res, act: Act, day: number): { res: Res; note: string } {
  const r: Res = { ...res };
  const dusty = eventsForDay(day).some(e => e.kind === "dust");
  r.food -= 3.2 - r.crops * 0.012; r.water -= 5.2 - r.recycle * 0.025; r.life -= 1.5; r.dust += dusty ? 14 : 4;
  r.power += 4.5 * (1 - r.dust / 120) - 3.5; r.exposure += Math.max(0, 3.2 - r.shield * 0.035) + (eventsForDay(day).some(e => e.kind === "solar_particle") ? 6 : 0);
  if (act === "hydro") { r.food += 20; r.crops += 14; r.power -= 7; }
  if (act === "water") { r.water += 23; r.recycle += 12; r.power -= 6; }
  if (act === "rocket") { r.rocket += 14; r.power -= 9; }
  if (act === "habitat") { r.life += 18; r.power -= 3; }
  if (act === "shelter") { r.shield += 16; r.exposure -= 8; r.power -= 7; }
  if (act === "solar") { r.dust -= 35; r.power += 14; }
  if (act === "contingency") { r.shield += 9; r.rocket += 7; r.life += 8; r.power -= 13; }
  (Object.keys(r) as (keyof Res)[]).forEach(k => { r[k] = clamp(r[k]); });
  return { res: r, note: `${ACTS[act].label} completed. Food, water, power and life support changed as the simulated interval passed.` };
}
export function applyCrisis(res: Res, posture: Posture): { res: Res; note: string } {
  const r: Res = { ...res };
  if (posture === "storm_shelter") { r.shield += 16; r.exposure -= 12; r.rocket -= 5; r.power -= 7; }
  else if (posture === "storm_essential") { r.shield += 6; r.life += 6; r.rocket += 3; r.power -= 9; }
  else { r.rocket += 11; r.shield -= 19; r.exposure += 18; r.power -= 13; }
  (Object.keys(r) as (keyof Res)[]).forEach(k => { r[k] = clamp(r[k]); });
  const note = posture === "storm_shelter" ? "Shelter protection prioritised; return preparations were delayed."
    : posture === "storm_essential" ? "Only essential systems were kept running; both goals advanced modestly."
    : "Return preparations advanced, but shelter readiness and exposure risk suffered.";
  return { res: r, note };
}
/** Environmental risk 0–100 (GAME score): high exposure, low shelter, low life support, dusty panels. */
export const environmentalRisk = (r: Res) => clamp(r.exposure * 0.45 + (100 - r.shield) * 0.3 + (100 - r.life) * 0.15 + r.dust * 0.1);
/** Thresholds are game balance; Part 2 may tune them here. */
export const OUTCOME_RULES = {
  success: { rocket: 83, shield: 64, life: 35, food: 20, water: 20, power: 17, exposure: 70 },
  partial: { rocket: 75, food: 12, water: 12, power: 9 },
  compromised: { rocket: 57, food: 9, water: 9, power: 6 },
} as const;
export function evaluateOutcome(r: Res): Outcome {
  const s = OUTCOME_RULES.success, p = OUTCOME_RULES.partial, c = OUTCOME_RULES.compromised;
  if (r.rocket >= s.rocket && r.shield >= s.shield && r.life >= s.life && r.food >= s.food && r.water >= s.water && r.power >= s.power && r.exposure <= s.exposure) return "success";
  if (r.rocket >= p.rocket && r.food >= p.food && r.water >= p.water && r.power >= p.power) return "partial";
  if (r.rocket >= c.rocket && r.food >= c.food && r.water >= c.water && r.power >= c.power) return "compromised";
  return "failed";
}
export function outcomeCopy(o: Outcome): { title: string; sub: string; desc: string } {
  if (o === "success") return { title: "MISSION SUCCESSFUL", sub: "Return mission authorized", desc: "Mysha returns to Earth. Careful tradeoffs kept the habitat reliable while the return vehicle was prepared." };
  if (o === "partial") return { title: "PARTIAL SUCCESS", sub: "Earth return · Medical follow-up", desc: "Mysha returns to Earth, but needs extra crew-health monitoring and some science results are incomplete." };
  if (o === "compromised") return { title: "MISSION COMPROMISED", sub: "Assisted return · Contingency support", desc: "The return needs fictional support from another mission asset. Mysha reaches safety, but not independently." };
  return { title: "DEPARTURE WINDOW MISSED", sub: "Next opportunity · about 26 months", desc: "The vehicle is not ready at the fictional checkpoint. Mysha stays in the protected habitat and prepares for the next transfer opportunity." };
}
export function moodFor(stage: Stage, loc: Loc, outcome?: Outcome | null): Mood {
  if (stage === "intro") return "arrival";
  if (stage === "crisis") return "crisis";
  if (stage === "boarding" || stage === "video") return "launch";
  if (stage === "ending") return outcome === "success" || outcome === "partial" ? "win" : "sad";
  if (stage === "debrief" || stage === "window") return "discovery";
  return loc === "indoor" ? "indoor" : "explore";
}

/* ============================================================================
 * SECTION B — NASA SCIENCE LIBRARY (bundled; never fetched at runtime)
 * ========================================================================== */
export type SciKind = "observation" | "research" | "standard" | "background" | "game";
export type Sci = { id: string; topic: string; kind: SciKind; text: string; source: string; url?: string; date?: string; unit?: string; verified: boolean; note?: string };
export const SCIENCE_VERSION = "level4-part1.1";
export const KIND_LABEL: Record<SciKind, string> = {
  observation: "NASA OBSERVATION", research: "NASA RESEARCH / DEMONSTRATION", standard: "NASA TECHNICAL STANDARD",
  background: "EDUCATIONAL BACKGROUND", game: "GAME SIMULATION · FICTIONAL",
};
const UNV = "Not re-opened while this file was written. Confirm wording and figures at the source before release.";
export const SCIENCE: Sci[] = [
  { id: "eclss98", topic: "Water recovery on the ISS", kind: "research", verified: false, note: UNV, unit: "% of water recovered",
    text: "NASA's 2023 space-station achievements summary describes a demonstration of about 98% water recovery by the station's life-support hardware. This is an ISS result and is not a measurement of Mysha's fictional Mars habitat.",
    source: "NASA — NASA's 2023 Space Station Achievements", url: "https://www.nasa.gov/missions/station/iss-research/nasas-2023-space-station-achievements/" },
  { id: "eclss90", topic: "Older ECLSS figure (about 90%)", kind: "background", verified: false, note: UNV, unit: "% of water recovered",
    text: "Older NASA ECLSS material describes roughly 90% water recovery. It is an earlier snapshot; read it beside the later 98% demonstration rather than mixing the two. Both are ISS figures.",
    source: "NASA ECLSS material (older factsheet); no verified link bundled" },
  { id: "eclss-air", topic: "Oxygen generation and air revitalization", kind: "background", verified: false, note: UNV,
    text: "Station life support is more than water. It also generates oxygen and removes carbon dioxide so the crew keeps breathable air, and it aims to conserve resources in a closed loop. In the game, 'life-support reliability' is one fictional score for all of this.",
    source: "NASA ISS ECLSS overview", url: "https://www.nasa.gov/missions/station/iss-research/nasas-2023-space-station-achievements/" },
  { id: "rad-gcr", topic: "Radiation on the Martian surface (Curiosity RAD)", kind: "observation", verified: false, note: UNV, unit: "µGy per day (absorbed dose)",
    text: "Curiosity's Radiation Assessment Detector (RAD) monitors the surface radiation environment, including galactic cosmic rays. Early published results put the absorbed dose from galactic cosmic rays at roughly 0.2 milligray per day. That is the rover detector's reading, not Mysha's dose. The game's exposure meter is fictional.",
    source: "Hassler et al., Science 343 (2014); NASA MSL RAD", url: "https://doi.org/10.1126/science.1244797" },
  { id: "rad-types", topic: "Two kinds of radiation risk", kind: "research", verified: false, note: UNV,
    text: "Explorers face a steady background from galactic cosmic rays and occasional bursts from solar energetic particles linked to solar activity. Monitoring tells crews when to shelter. The game treats a solar particle event as its own alert.",
    source: "NASA MSL RAD science results", url: "https://data.nasa.gov/dataset/mars-science-laboratory-msl-radiation-assessment-detector-rad-level-2-observation-dosimetr-e2695" },
  { id: "rad-data", topic: "MSL RAD dataset", kind: "background", verified: false, note: UNV,
    text: "NASA archives Curiosity RAD Level 2 dosimetry observations as a public dataset. This game does NOT read or process it. Using real values would require checking the exact records, units, timestamps and quality flags first.",
    source: "NASA Open Data Portal — MSL RAD Level 2 dosimetry", url: "https://data.nasa.gov/dataset/mars-science-laboratory-msl-radiation-assessment-detector-rad-level-2-observation-dosimetr-e2695" },
  { id: "meda", topic: "Mars weather and dust (Perseverance MEDA)", kind: "research", verified: false, note: UNV,
    text: "Perseverance carries MEDA, a weather station measuring atmosphere, temperature and dust-related conditions, including sunlight and airborne dust. MEDA is not a radiation-dose detector like Curiosity's RAD, so the two should not be confused.",
    source: "NASA Mars 2020 Perseverance — science instruments", url: "https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/" },
  { id: "dust-power", topic: "Dust and solar power", kind: "background", verified: false, note: UNV,
    text: "Dust in the air and on panels reduces the sunlight solar hardware can use. A solar particle event is a different hazard: it raises radiation risk but does not by itself reduce panel output. The game keeps the two alerts separate.",
    source: "NASA Mars 2020 Perseverance — MEDA", url: "https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/" },
  { id: "plants", topic: "Growing food in space", kind: "research", verified: false, note: UNV,
    text: "NASA grows plants on the space station with systems such as Veggie and the Advanced Plant Habitat. The research studies fresh-food support for long missions. The game's crop points are not real yields.",
    source: "NASA — Growing Plants in Space", url: "https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/" },
  { id: "diet", topic: "Nutrition and crew health", kind: "background", verified: false, note: UNV,
    text: "Nutrition is part of crew health on long missions, alongside exercise, medical care and environmental protection. In the game, the food meter is a simple reserve score.",
    source: "NASA-STD-3001 Volume 1 (educational summary)", url: "https://www.nasa.gov/ochmo/human-spaceflight-and-aviation-standards" },
  { id: "std3001", topic: "NASA-STD-3001, Volume 1: Crew Health", kind: "standard", verified: false, note: UNV,
    text: "Volume 1 is a NASA technical standard about crew health and protection for long-duration missions. It is a rulebook for programs, not a live health reading; the game's risk scores are not medical values.",
    source: "NASA OCHMO — Human Spaceflight and Aviation Standards", url: "https://www.nasa.gov/ochmo/human-spaceflight-and-aviation-standards" },
  { id: "window", topic: "Mars return opportunities", kind: "research", verified: false, note: UNV, unit: "months",
    text: "Favorable Earth–Mars transfer opportunities recur about every 26 months. The game's short countdown is a fictional departure checkpoint, not the length of a real launch window.",
    source: "NASA — Houston We Have a Podcast, 'Rendezvous with Mars'", url: "https://www.nasa.gov/podcasts/houston-we-have-a-podcast/rendezvous-with-mars/" },
  { id: "suit", topic: "Why Mysha wears a suit outside", kind: "background", verified: false, note: UNV,
    text: "Mars' atmosphere is very thin and mostly carbon dioxide, so people cannot breathe it. Outside, an astronaut needs a pressurized suit with life support. Inside a sealed, pressurized habitat, ordinary crew clothing is acceptable.",
    source: "NASA — Mars", url: "https://science.nasa.gov/mars" },
  { id: "game", topic: "How the scoring works", kind: "game", verified: true,
    text: "GAME SIMULATION: every percentage, the 12 intervals, the Sol labels and the four ending thresholds are invented for this game. Your Level 3 allocation only changes starting values. No NASA number was converted into a game number.",
    source: "Mysha Goes To Mars — game design" },
];
export const sciById = (id: string): Sci => SCIENCE.find(s => s.id === id) ?? SCIENCE[SCIENCE.length - 1];
export const sciForAct = (a: Act | "crisis"): Sci => sciById(a === "crisis" ? "rad-types" : ACTS[a].sci);

/* ============================================================================
 * SECTION C — SAVE SYSTEM (versioned, validated, storage-safe)
 * ========================================================================== */
export const L3_KEY = "mysha-goes-to-mars:level3:v1";
export const L4_KEY = "mysha-goes-to-mars:level4:v2";
export const L4_OLD_KEY = "mysha-goes-to-mars:level4:v1";
export const TUT_KEY = "mysha-goes-to-mars:level4:tutorial:v1";
export const safeGet = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
export const safeSet = (k: string, v: string): boolean => { try { window.localStorage.setItem(k, v); return true; } catch { return false; } };
export const safeRemove = (k: string) => { try { window.localStorage.removeItem(k); } catch { /* storage optional */ } };
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const RES_KEYS: (keyof Res)[] = ["food", "water", "power", "life", "shield", "rocket", "crops", "recycle", "dust", "exposure"];
export const validRes = (r: unknown): r is Res => !!r && typeof r === "object" && RES_KEYS.every(k => isNum((r as Res)[k]) && (r as Res)[k] >= 0 && (r as Res)[k] <= 100);
/** Valid when every value is 0–100 AND the four values total exactly 100 (Level 3's allocation rule). */
export const validAlloc = (a: unknown): a is Allocation => {
  if (!a || typeof a !== "object") return false;
  const k = ["supplies", "shielding", "power", "stability"] as const, o = a as Allocation;
  return k.every(x => isNum(o[x]) && o[x] >= 0 && o[x] <= 100) && Math.abs(k.reduce((t, x) => t + o[x], 0) - 100) < 0.001;
};
/** Reads the real Level 3 allocation. Never invents carryover: carried=false means the labelled balanced demo plan. */
export function readLevel3(): { allocation: Allocation; carried: boolean } {
  const raw = safeGet(L3_KEY);
  if (raw) {
    try {
      const o = JSON.parse(raw) as { completed?: unknown; allocation?: unknown };
      if (o && o.completed === true && validAlloc(o.allocation)) return { allocation: { ...(o.allocation as Allocation) }, carried: true };
    } catch { /* fall through to demo plan */ }
  }
  return { allocation: { ...DEFAULT_PLAN }, carried: false };
}
export function loadSave(): Save | null {
  const raw = safeGet(L4_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Save>;
    if (o.version !== 2 || !validAlloc(o.allocation) || !validRes(o.res)) return null;
    if (!isNum(o.day) || o.day < 1 || o.day > TOTAL_DAYS) return null;
    if (o.stage !== "mission" && o.stage !== "ended") return null;
    const outcomes: string[] = ["success", "partial", "compromised", "failed"];
    if (o.outcome != null && !outcomes.includes(o.outcome)) return null;
    const log = (Array.isArray(o.log) ? o.log : []).filter((e): e is LogEntry => !!e && isNum(e.day) && typeof e.title === "string" && typeof e.detail === "string").slice(0, 60);
    const storm = (["storm_shelter", "storm_essential", "storm_limited"] as const).find(p => p === o.storm) ?? null;
    return { version: 2, allocation: o.allocation, carried: o.carried === true, stage: o.stage, day: Math.floor(o.day), res: o.res, log, storm, outcome: o.outcome ?? null, replays: isNum(o.replays) ? Math.max(0, Math.floor(o.replays)) : 0, contingency: o.contingency === true };
  } catch { safeRemove(L4_KEY); return null; }
}
export const writeSave = (s: Save): boolean => safeSet(L4_KEY, JSON.stringify(s));
export const clearSave = () => safeRemove(L4_KEY);
export function newSave(l3: { allocation: Allocation; carried: boolean }, replays = 0, contingency = false): Save {
  return { version: 2, allocation: { ...l3.allocation }, carried: l3.carried, stage: "mission", day: 1, res: initialRes(l3.allocation), log: [], storm: null, outcome: null, replays, contingency };
}
export const isTutorialDone = () => safeGet(TUT_KEY) === "yes";
export const markTutorialDone = () => safeSet(TUT_KEY, "yes");
export const resetTutorial = () => safeRemove(TUT_KEY);
/** True if the older v1 Level 4 file recorded at least one finished attempt (unlocks the replay option). */
export const legacyAttempts = () => (Number(safeGet(`${L4_OLD_KEY}:attempts`) ?? "0") || 0) > 0;

/* ============================================================================
 * SECTION D — PROCEDURAL AUDIO ENGINE (no files; unlocks on user gesture; cleaned up on unmount)
 * Outdoor "ambience" is a cinematic suit/helmet-transmitted rumble, NOT Earth-like sound through air.
 * ========================================================================== */
export type Mood = "arrival" | "explore" | "indoor" | "discovery" | "crisis" | "launch" | "win" | "sad";
export type Cue = "tap" | "step" | "science" | "warning" | "done" | "launch" | "airlock" | "confirm" | "countdown";
const MOODS: Record<Mood, { f: number[]; cut: number; trem: number; depth: number }> = {
  arrival: { f: [130.8, 196, 261.6, 329.6], cut: 1100, trem: 0.15, depth: 0.1 },
  explore: { f: [110, 164.8, 220, 277.2], cut: 800, trem: 0.1, depth: 0.08 },
  indoor: { f: [98, 146.8, 196, 246.9], cut: 650, trem: 0.08, depth: 0.06 },
  discovery: { f: [146.8, 220, 293.7, 369.99], cut: 1500, trem: 0.25, depth: 0.12 },
  crisis: { f: [87.3, 103.8, 130.8, 155.6], cut: 1300, trem: 1.6, depth: 0.45 },
  launch: { f: [65.4, 98, 130.8, 196], cut: 1800, trem: 0.9, depth: 0.3 },
  win: { f: [130.8, 196, 261.6, 392], cut: 2400, trem: 0.2, depth: 0.1 },
  sad: { f: [110, 130.8, 164.8, 196], cut: 700, trem: 0.12, depth: 0.1 },
};
const CUES: Record<Cue, readonly [number, number, number, OscillatorType, number]> = {
  tap: [520, 820, 0.1, "sine", 0.07], step: [110, 60, 0.07, "triangle", 0.05], science: [300, 860, 0.4, "sine", 0.07],
  warning: [640, 300, 0.5, "sawtooth", 0.06], done: [380, 1040, 0.6, "triangle", 0.08], launch: [90, 42, 1.8, "sawtooth", 0.12],
  airlock: [140, 70, 1.2, "square", 0.04], confirm: [440, 660, 0.25, "triangle", 0.08], countdown: [740, 740, 0.12, "square", 0.05],
};
export class MissionAudio {
  musicOn = true; sfxOn = true; volume = 0.6;
  private ctx: AudioContext | null = null; private master: GainNode | null = null; private music: GainNode | null = null; private sfx: GainNode | null = null;
  private pads: OscillatorNode[] = []; private filter: BiquadFilterNode | null = null; private lfo: OscillatorNode | null = null; private lfoGain: GainNode | null = null;
  private noise: AudioBufferSourceNode | null = null; private ambF: BiquadFilterNode | null = null; private ambG: GainNode | null = null;
  private mood: Mood = "arrival"; private amb: Loc = "outdoor";
  get ready() { return !!this.ctx && this.ctx.state === "running"; }
  /** Call from a click/key/touch handler. Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC(); this.ctx = ctx;
        const master = ctx.createGain(); master.gain.value = this.volume; master.connect(ctx.destination); this.master = master;
        const music = ctx.createGain(); music.gain.value = this.musicOn ? 0.5 : 0.0001; music.connect(master); this.music = music;
        const sfx = ctx.createGain(); sfx.gain.value = this.sfxOn ? 1 : 0.0001; sfx.connect(master); this.sfx = sfx;
        const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 900; this.filter = filter;
        const trem = ctx.createGain(); trem.gain.value = 0.7; filter.connect(trem); trem.connect(music);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.1; const lg = ctx.createGain(); lg.gain.value = 0.08; lfo.connect(lg); lg.connect(trem.gain); lfo.start(); this.lfo = lfo; this.lfoGain = lg;
        for (let i = 0; i < 4; i++) {
          const o = ctx.createOscillator(); o.type = i % 2 ? "triangle" : "sawtooth"; o.detune.value = (i - 1.5) * 6;
          const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(filter); o.start(); this.pads.push(o);
        }
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const af = ctx.createBiquadFilter(); af.type = "bandpass"; const ag = ctx.createGain(); ag.gain.value = 0.0001;
        src.connect(af); af.connect(ag); ag.connect(sfx); src.start(); this.noise = src; this.ambF = af; this.ambG = ag;
        this.setMood(this.mood); this.setAmbience(this.amb);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch { /* audio never blocks the game */ }
  }
  setMood(m: Mood) {
    this.mood = m; const c = this.ctx; if (!c || !this.filter || !this.lfo || !this.lfoGain) return;
    const cfg = MOODS[m], t = c.currentTime;
    this.pads.forEach((o, i) => o.frequency.setTargetAtTime(cfg.f[i], t, 1.4));
    this.filter.frequency.setTargetAtTime(cfg.cut, t, 1); this.lfo.frequency.setTargetAtTime(cfg.trem, t, 0.5); this.lfoGain.gain.setTargetAtTime(cfg.depth, t, 0.5);
  }
  setAmbience(kind: Loc) {
    this.amb = kind; const c = this.ctx; if (!c || !this.ambF || !this.ambG) return; const t = c.currentTime;
    if (kind === "indoor") { this.ambF.frequency.setTargetAtTime(420, t, 0.4); this.ambG.gain.setTargetAtTime(0.045, t, 0.4); }
    else { this.ambF.frequency.setTargetAtTime(220, t, 0.4); this.ambG.gain.setTargetAtTime(0.03, t, 0.4); }
  }
  setMusic(on: boolean) { this.musicOn = on; if (this.ctx && this.music) this.music.gain.setTargetAtTime(on ? 0.5 : 0.0001, this.ctx.currentTime, 0.1); }
  setSfx(on: boolean) { this.sfxOn = on; if (this.ctx && this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0.0001, this.ctx.currentTime, 0.05); }
  setVolume(v: number) { this.volume = clamp(v, 0, 1); if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05); }
  cue(kind: Cue) {
    const c = this.ctx, bus = this.sfx; if (!c || !bus || !this.sfxOn || c.state !== "running") return;
    try {
      const [f0, f1, dur, wave, vol] = CUES[kind], t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03); o.onended = () => { o.disconnect(); g.disconnect(); };
    } catch { /* ignore */ }
  }
  /** Releases the AudioContext. The instance stays reusable: unlock() builds a fresh context (safe for React StrictMode remounts). */
  dispose() {
    this.pads.forEach(o => { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); }); this.pads = [];
    try { this.lfo?.stop(); } catch { /* ignore */ } try { this.noise?.stop(); } catch { /* ignore */ }
    const c = this.ctx; this.ctx = null; this.master = null; this.music = null; this.sfx = null; this.filter = null; this.lfo = null; this.lfoGain = null; this.noise = null; this.ambF = null; this.ambG = null;
    if (c && c.state !== "closed") void c.close().catch(() => undefined);
  }
}
/** One MissionAudio per component instance, disposed on unmount. */
export function useMissionAudio(): MissionAudio {
  const ref = useRef<MissionAudio | null>(null);
  if (!ref.current) ref.current = new MissionAudio();
  useEffect(() => { const a = ref.current; return () => { a?.dispose(); }; }, []);
  return ref.current;
}

/* ============================================================================
 * SECTION E — 3D WORLD HELPERS, SPOTS, COLLISION DATA
 * All per-frame work reads refs / preallocated objects, never React state.
 * ========================================================================== */
export type Spot = { id: SpotId; x: number; z: number; r: number; reach: number; loc: Loc };
export const SPOTS: Spot[] = [
  { id: "door", x: 0, z: 5.6, r: 0, reach: 2.4, loc: "outdoor" },
  { id: "hydro", x: -12, z: -5, r: 3.4, reach: 5.4, loc: "outdoor" },
  { id: "water", x: -5.5, z: -12.5, r: 2.7, reach: 4.6, loc: "outdoor" },
  { id: "rocket", x: 13, z: -7, r: 2.5, reach: 4.6, loc: "outdoor" },
  { id: "solar", x: 12, z: 10, r: 2.2, reach: 5.2, loc: "outdoor" },
  { id: "shelter", x: -12, z: 10.5, r: 3.1, reach: 5.2, loc: "outdoor" },
  { id: "console", x: IN_X - 3.6, z: -3.9, r: 0.9, reach: 3.0, loc: "indoor" },
  { id: "rack", x: IN_X + 4.6, z: -3.9, r: 0.8, reach: 3.0, loc: "indoor" },
  { id: "exit", x: IN_X, z: 5.6, r: 0, reach: 2.2, loc: "indoor" },
];
const SOLID: { x: number; z: number; r: number; loc: Loc }[] = [
  { x: 0, z: 0, r: 4.7, loc: "outdoor" }, { x: -12, z: -5, r: 3.4, loc: "outdoor" }, { x: -5.5, z: -12.5, r: 2.7, loc: "outdoor" },
  { x: 13, z: -7, r: 2.5, loc: "outdoor" }, { x: 9.5, z: 10, r: 1.9, loc: "outdoor" }, { x: 14.5, z: 10, r: 1.9, loc: "outdoor" }, { x: -12, z: 10.5, r: 3.1, loc: "outdoor" },
  { x: IN_X - 4.2, z: -4.8, r: 1.3, loc: "indoor" }, { x: IN_X + 4.6, z: -4.8, r: 1.0, loc: "indoor" }, { x: IN_X - 5.6, z: 2.6, r: 1.5, loc: "indoor" }, { x: IN_X + 4.4, z: 1.6, r: 1.2, loc: "indoor" },
];
export const SPAWN = new THREE.Vector3(9.5, 0, -1.6);
export const INDOOR_SPAWN = new THREE.Vector3(IN_X, 0, 4.6);
export const OUT_DOOR_SPAWN = new THREE.Vector3(0, 0, 6.4);
const ROCKET = new THREE.Vector3(13, 0, -7);
const ARRIVAL_START = new THREE.Vector3(30, 14, 26);
const ARRIVAL_END = (() => { const d = ROCKET.clone().sub(SPAWN).setY(0).normalize(); return SPAWN.clone().addScaledVector(d, -4.2).add(new THREE.Vector3(-0.6, 1.5, 0)); })();
const ARRIVAL_LOOK_A = new THREE.Vector3(0, 3, 0), ARRIVAL_LOOK_B = SPAWN.clone().add(new THREE.Vector3(0, 1.3, 0));
const C_OFF = new THREE.Color("#3a4448"), C_BLACK = new THREE.Color("#000000"), C_ON = new THREE.Color("#7dffb2"), C_ONE = new THREE.Color("#33e07a"), C_YEL = new THREE.Color("#ffe27a"), C_YELE = new THREE.Color("#ffc933");
const F_IN = new THREE.Color("#1a2024"), F_ALERT = new THREE.Color("#8a3b2a"), F_STORM = new THREE.Color("#b9805e"), F_CLEAR = new THREE.Color("#d59468"), L_ALERT = new THREE.Color("#ff6a55"), L_ROOM = new THREE.Color("#fff1dc");
const SKY_TOP = { clear: new THREE.Color("#5a4660"), storm: new THREE.Color("#6b4a44"), alert: new THREE.Color("#3a1c20") };
const SKY_BOT = { clear: new THREE.Color("#e8a070"), storm: new THREE.Color("#b9805e"), alert: new THREE.Color("#8a3b2a") };
const ROCKET_LED = [20, 40, 60, 80, 95];
function led(m: THREE.MeshStandardMaterial, on: boolean, onC: THREE.Color = C_ON, onE: THREE.Color = C_ONE) { m.emissiveIntensity = on ? 1.5 : 0.05; m.color.copy(on ? onC : C_OFF); m.emissive.copy(on ? onE : C_BLACK); }

export function nrand(i: number) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const h = (a: number, b: number) => nrand(a * 57 + b * 131);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
/** Terrain height. Flat within 30 m of the base so stations and paths sit level. */
export function groundH(x: number, z: number) {
  const d = Math.hypot(x, z), k = Math.min(1, Math.max(0, (d - 30) / 40));
  return k * k * (vnoise(x * 0.05, z * 0.05) * 6 + vnoise(x * 0.18, z * 0.18) * 1.2) - k * 0.2;
}
export function useReducedMotion() {
  const [m, setM] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const q = window.matchMedia?.("(prefers-reduced-motion: reduce)"); if (!q) return; const f = () => setM(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return m;
}
function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256, repeat?: [number, number]) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/* ---- sky, terrain, mountains, rocks, dust ---- */
function Sky({ shared }: { shared: R<Shared> }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color("#5a4660") }, bot: { value: new THREE.Color("#e8a070") }, sun: { value: new THREE.Vector3(-0.9, 0.2, -0.3).normalize() }, glow: { value: new THREE.Color("#ffb877") } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bot; uniform vec3 sun; uniform vec3 glow; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.1,0.0,1.0); vec3 c = mix(bot, top, pow(h,0.7)); float d = max(dot(vP,sun),0.0); c += glow*pow(d,10.0)*0.6 + glow*pow(d,180.0)*1.5; gl_FragColor = vec4(c,1.0); }",
  }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    const s = shared.current, k = (s.day - 1) / (TOTAL_DAYS - 1), f = 1 - Math.exp(-2 * dt), key = s.alert ? "alert" : s.storm ? "storm" : "clear";
    (mat.uniforms.top.value as THREE.Color).lerp(SKY_TOP[key], f); (mat.uniforms.bot.value as THREE.Color).lerp(SKY_BOT[key], f);
    (mat.uniforms.sun.value as THREE.Vector3).set(-0.9, 0.12 + k * 0.38, -0.3).normalize();
  });
  return <mesh frustumCulled={false} renderOrder={-10}><sphereGeometry args={[400, 32, 16]} /><primitive object={mat} attach="material" /></mesh>;
}
function Terrain() {
  const { geo, tex, mat } = useMemo(() => {
    const g = new THREE.PlaneGeometry(260, 260, 120, 120); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = groundH(x, z); p.setY(i, h);
      const n = vnoise(x * 0.3, z * 0.3), n2 = vnoise(x * 1.7, z * 1.7);
      c.setHSL(0.05 + n * 0.02, 0.42 + n2 * 0.12, 0.42 + n * 0.1 + Math.min(h, 4) * 0.02); col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const t = canvasTex((ctx, s) => { ctx.fillStyle = "#b86a45"; ctx.fillRect(0, 0, s, s); for (let i = 0; i < 2600; i++) { const a = nrand(i) * s, b = nrand(i + 9000) * s, r = nrand(i + 4000); ctx.fillStyle = r > 0.5 ? "rgba(70,36,26,.22)" : "rgba(235,170,120,.16)"; ctx.fillRect(a, b, 1 + r * 3, 1 + r * 2); } }, 256, [60, 60]);
    return { geo: g, tex: t, mat: new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 0.97, metalness: 0 }) };
  }, []);
  useEffect(() => () => { geo.dispose(); tex.dispose(); mat.dispose(); }, [geo, tex, mat]);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}
function Mountains() {
  const { geo, mat } = useMemo(() => {
    const seg = 160, pos: number[] = [], idx: number[] = [], col: number[] = [], c = new THREE.Color();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, Rr = 150 + vnoise(i * 0.2, 3) * 18, h = 8 + vnoise(i * 0.09, 7) * 26 + vnoise(i * 0.6, 1) * 6;
      const x = Math.cos(a) * Rr, z = Math.sin(a) * Rr; pos.push(x, -3, z, x * 0.98, h, z * 0.98);
      c.set("#6f3f33"); col.push(c.r, c.g, c.b); c.set("#a2634a"); col.push(c.r, c.g, c.b);
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return { geo: g, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }) };
  }, []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  return <mesh geometry={geo} material={mat} />;
}
function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null), N = 240;
  useEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = nrand(i) * Math.PI * 2, d = 23 + nrand(i + 500) * 80, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.25 + nrand(i + 900) * nrand(i + 901) * 1.8;
      o.position.set(x, groundH(x, z) + s * 0.25, z); o.rotation.set(nrand(i + 3) * 3, nrand(i + 4) * 6, nrand(i + 5) * 3); o.scale.set(s, s * 0.6, s * 0.85); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      c.setHSL(0.04 + nrand(i + 7) * 0.03, 0.3, 0.16 + nrand(i + 8) * 0.18); m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[undefined, undefined, N]} castShadow receiveShadow><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial roughness={0.95} /></instancedMesh>;
}
function Dust({ shared }: { shared: R<Shared> }) {
  const N = 260, ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(), a = new Float32Array(N * 3); for (let i = 0; i < N; i++) a.set([(nrand(i) - 0.5) * 70, nrand(i + 1) * 9, (nrand(i + 2) - 0.5) * 70], i * 3); g.setAttribute("position", new THREE.BufferAttribute(a, 3)); return g; }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ color: "#f2bd90", size: 0.14, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame((_, dt) => {
    const s = shared.current, p = ref.current; if (!p) return; const a = geo.attributes.position as THREE.BufferAttribute;
    const wind = s.reduced ? 0.15 : s.storm || s.alert ? 3.2 : 0.7; mat.opacity = s.storm || s.alert ? 0.7 : 0.35; p.visible = s.loc === "outdoor";
    for (let i = 0; i < N; i++) { let x = a.getX(i) + wind * dt * (0.6 + nrand(i + 5)); if (x > 35) x = -35; a.setX(i, x); }
    a.needsUpdate = true; p.position.set(s.pos.x, 0, s.pos.z);
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/* ---- base modules ---- */
function Habitat() {
  const tex = useMemo(() => canvasTex((g, s) => { g.fillStyle = "#d8dde0"; g.fillRect(0, 0, s, s); g.strokeStyle = "rgba(90,100,110,.55)"; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * s / 8); g.lineTo(s, i * s / 8); g.stroke(); g.beginPath(); g.moveTo(i * s / 8, 0); g.lineTo(i * s / 8, s); g.stroke(); } for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(150,90,60,${nrand(i) * 0.1})`; g.fillRect(nrand(i + 1) * s, nrand(i + 2) * s, 6, 6); } }, 256, [4, 2]), []);
  useEffect(() => () => tex.dispose(), [tex]);
  const door = useRef<THREE.Mesh>(null);
  useFrame(() => { const m = door.current?.material as THREE.MeshStandardMaterial | undefined; if (m) m.emissiveIntensity = 0.7 + Math.sin(performance.now() * 0.003) * 0.25; });
  return <group>
    <mesh position={[0, 0.25, 0]} receiveShadow><cylinderGeometry args={[4.9, 5.1, 0.5, 48]} /><meshStandardMaterial color="#5a5f64" roughness={0.8} metalness={0.3} /></mesh>
    <mesh position={[0, 0.5, 0]} castShadow receiveShadow><cylinderGeometry args={[4.4, 4.5, 1.7, 48]} /><meshStandardMaterial map={tex} roughness={0.5} metalness={0.35} /></mesh>
    <mesh position={[0, 1.35, 0]} castShadow><sphereGeometry args={[4.4, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial map={tex} roughness={0.45} metalness={0.3} /></mesh>
    {[0, 1, 2, 3].map(i => <mesh key={i} position={[0, 1.35, 0]} rotation={[0, i * Math.PI / 4, 0]}><torusGeometry args={[4.42, 0.05, 8, 64, Math.PI]} /><meshStandardMaterial color="#99a2a8" metalness={0.6} roughness={0.4} /></mesh>)}
    {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2 + 0.3; if (Math.sin(a) > 0.75) return null; return <mesh key={i} position={[Math.cos(a) * 4.42, 1.0, Math.sin(a) * 4.42]} rotation={[0, Math.PI / 2 - a, 0]}><planeGeometry args={[0.9, 0.5]} /><meshStandardMaterial color="#79e0e8" emissive="#58c4d2" emissiveIntensity={0.9} side={THREE.DoubleSide} /></mesh>; })}
    <group position={[0, 0, 4.2]}>
      <mesh position={[0, 1.15, 0]} castShadow><boxGeometry args={[2.3, 2.3, 1.3]} /><meshStandardMaterial color="#c8ced2" metalness={0.45} roughness={0.45} /></mesh>
      <mesh ref={door} position={[0, 1.05, 0.68]}><boxGeometry args={[1.25, 1.9, 0.06]} /><meshStandardMaterial color="#27465a" emissive="#2fb4d6" emissiveIntensity={0.8} metalness={0.6} roughness={0.3} /></mesh>
      {[-0.8, 0.8].map(x => <mesh key={x} position={[x, 1.1, 0.7]}><boxGeometry args={[0.08, 2, 0.08]} /><meshStandardMaterial color="#ffb25b" emissive="#ff9a3c" emissiveIntensity={1} /></mesh>)}
      <mesh position={[0, 2.35, 0.2]}><boxGeometry args={[1.6, 0.12, 0.9]} /><meshStandardMaterial color="#8b959b" metalness={0.5} /></mesh>
    </group>
    <mesh position={[1.2, 5.3, -1]}><cylinderGeometry args={[0.03, 0.03, 2.6, 8]} /><meshStandardMaterial color="#cfd6da" metalness={0.8} /></mesh>
    <mesh position={[1.2, 6.6, -1]}><sphereGeometry args={[0.18, 12, 8]} /><meshStandardMaterial color="#ff6a5c" emissive="#ff3a30" emissiveIntensity={1.2} /></mesh>
  </group>;
}
function Hydroponics({ shared }: { shared: R<Shared> }) {
  const plants = useRef<THREE.Group>(null);
  useFrame(() => { const g = plants.current; if (!g) return; const k = 0.25 + shared.current.res.crops / 100 * 1.1; g.children.forEach((c, i) => c.scale.setScalar(k * (0.8 + nrand(i) * 0.4))); });
  return <group position={[-12, 0, -5]}>
    <mesh position={[0, 0.25, 0]} receiveShadow><cylinderGeometry args={[3.6, 3.7, 0.5, 32]} /><meshStandardMaterial color="#6a7076" roughness={0.7} metalness={0.4} /></mesh>
    <mesh position={[0, 1.8, 0]}><cylinderGeometry args={[3.3, 3.3, 2.6, 32, 1, true]} /><meshStandardMaterial color="#8fd0c0" transparent opacity={0.22} roughness={0.08} metalness={0.2} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <mesh position={[0, 3.1, 0]}><sphereGeometry args={[3.3, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#8fd0c0" transparent opacity={0.2} roughness={0.08} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    {[0, 1, 2, 3].map(i => <mesh key={i} position={[0, 1.8, 0]} rotation={[0, i * Math.PI / 4, 0]}><boxGeometry args={[0.06, 2.6, 6.6]} /><meshStandardMaterial color="#c8cfd3" metalness={0.6} transparent opacity={0.9} /></mesh>)}
    {[-1.6, 0, 1.6].map(z => <group key={z}><mesh position={[0, 0.9, z]}><boxGeometry args={[4.6, 0.12, 0.8]} /><meshStandardMaterial color="#d6dcdf" metalness={0.4} /></mesh><mesh position={[0, 2.35, z]}><boxGeometry args={[4.2, 0.08, 0.5]} /><meshStandardMaterial color="#ffd9f2" emissive="#ff9be0" emissiveIntensity={1.4} /></mesh></group>)}
    <group ref={plants}>{Array.from({ length: 21 }, (_, i) => <mesh key={i} position={[((i % 7) - 3) * 0.62, 1.1, (Math.floor(i / 7) - 1) * 1.6]}><icosahedronGeometry args={[0.26, 1]} /><meshStandardMaterial color="#5fae5a" roughness={0.9} /></mesh>)}</group>
  </group>;
}
function WaterUnit({ shared }: { shared: R<Shared> }) {
  const fills = useRef<THREE.Group>(null);
  useFrame(() => { const g = fills.current; if (!g) return; const w = Math.max(0.02, shared.current.res.water / 100); g.children.forEach((c, i) => { c.scale.y = w * (1 - i * 0.05); c.position.y = 0.25 + w * (1 - i * 0.05) * 1.25; }); });
  return <group position={[-5.5, 0, -12.5]}>
    <mesh position={[0, 0.15, 0]} receiveShadow><boxGeometry args={[6.2, 0.3, 3.6]} /><meshStandardMaterial color="#60666b" metalness={0.5} roughness={0.7} /></mesh>
    {[-1.9, 0, 1.9].map(x => <mesh key={x} position={[x, 1.7, 0]} castShadow><cylinderGeometry args={[0.85, 0.85, 3, 24]} /><meshStandardMaterial color="#b9c8d0" metalness={0.7} roughness={0.3} /></mesh>)}
    <group ref={fills} position={[0, 0, 1.0]}>{[-1.9, 0, 1.9].map(x => <mesh key={x} position={[x, 1, 0]}><boxGeometry args={[0.45, 2.5, 0.1]} /><meshStandardMaterial color="#58c9ee" emissive="#2aa8d4" emissiveIntensity={1.2} /></mesh>)}</group>
    <mesh position={[0, 0.9, 1.3]}><boxGeometry args={[5.6, 0.14, 0.3]} /><meshStandardMaterial color="#cfd8dc" metalness={0.5} /></mesh>
    <mesh position={[0, 3.55, 0]}><boxGeometry args={[5.4, 0.18, 0.5]} /><meshStandardMaterial color="#48555e" metalness={0.7} /></mesh>
  </group>;
}
function Rocket({ shared }: { shared: R<Shared> }) {
  const craft = useRef<THREE.Group>(null), flame = useRef<THREE.Mesh>(null), lights = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = shared.current, g = craft.current; if (!g) return;
    g.position.y = s.launching ? Math.pow(Math.min(1, s.launchT / 14), 2) * 120 : 0;
    if (flame.current) { flame.current.visible = s.launching && s.launchT > 1.5; flame.current.scale.y = 0.8 + Math.sin(performance.now() * 0.03) * 0.2; }
    lights.current?.children.forEach((c, i) => led((c as THREE.Mesh).material as THREE.MeshStandardMaterial, s.res.rocket >= ROCKET_LED[i]));
  });
  return <group position={[13, 0, -7]}>
    <mesh position={[0, 0.15, 0]} receiveShadow><cylinderGeometry args={[5, 5.2, 0.3, 40]} /><meshStandardMaterial color="#555c62" metalness={0.5} roughness={0.8} /></mesh>
    <mesh position={[0, 0.32, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.2, 3.2, 40]} /><meshStandardMaterial color="#2d2523" roughness={1} transparent opacity={0.8} /></mesh>
    <group ref={craft}>
      <mesh position={[0, 4.4, 0]} castShadow><cylinderGeometry args={[1.15, 1.3, 7.4, 32]} /><meshStandardMaterial color="#e9e7e2" roughness={0.35} metalness={0.45} /></mesh>
      <mesh position={[0, 9.4, 0]} castShadow><cylinderGeometry args={[0.18, 1.15, 2.6, 32]} /><meshStandardMaterial color="#e9e7e2" roughness={0.35} metalness={0.4} /></mesh>
      <mesh position={[0, 6, 0]}><cylinderGeometry args={[1.17, 1.17, 0.35, 32]} /><meshStandardMaterial color="#d2632d" roughness={0.5} /></mesh>
      <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[1.32, 1.35, 0.5, 32]} /><meshStandardMaterial color="#59646b" metalness={0.7} roughness={0.4} /></mesh>
      {[0, 1, 2, 3].map(i => <group key={i} rotation={[0, i * Math.PI / 2 + Math.PI / 4, 0]}><mesh position={[1.55, 1.2, 0]} rotation={[0, 0, -0.35]} castShadow><boxGeometry args={[0.18, 2.6, 0.9]} /><meshStandardMaterial color="#9aa8af" metalness={0.6} roughness={0.4} /></mesh><mesh position={[2.15, 0.1, 0]}><cylinderGeometry args={[0.35, 0.45, 0.14, 16]} /><meshStandardMaterial color="#cfd6d9" metalness={0.8} /></mesh></group>)}
      <mesh position={[0, 5, 1.15]}><sphereGeometry args={[0.32, 16, 12]} /><meshStandardMaterial color="#25576e" emissive="#2c93bd" emissiveIntensity={0.8} metalness={0.7} roughness={0.2} /></mesh>
      <group ref={lights}>{[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[0.55, 2.8 + i * 0.7, 1.12]}><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color="#3a4448" /></mesh>)}</group>
      <mesh ref={flame} position={[0, -0.9, 0]} rotation={[Math.PI, 0, 0]} visible={false}><coneGeometry args={[0.9, 3.2, 20]} /><meshBasicMaterial color="#ffb25b" transparent opacity={0.8} depthWrite={false} /></mesh>
    </group>
    <mesh position={[3.6, 3.6, 0]} castShadow><boxGeometry args={[0.35, 7.2, 0.35]} /><meshStandardMaterial color="#8a979e" metalness={0.8} roughness={0.4} /></mesh>
    {[1.5, 3.6, 5.7].map(y => <mesh key={y} position={[2.4, y, 0]}><boxGeometry args={[2.4, 0.1, 0.5]} /><meshStandardMaterial color="#aab4ba" metalness={0.7} /></mesh>)}
    <mesh position={[-3.2, 0.9, 2.4]} castShadow><boxGeometry args={[1.8, 1.3, 1.2]} /><meshStandardMaterial color="#d3a24f" metalness={0.3} roughness={0.6} /></mesh>
    <mesh position={[-3.2, 1.7, 2.4]}><boxGeometry args={[1.4, 0.4, 0.9]} /><meshStandardMaterial color="#79e0e8" emissive="#58c4d2" emissiveIntensity={0.9} /></mesh>
  </group>;
}
function SolarField({ shared }: { shared: R<Shared> }) {
  const mats = useRef<THREE.MeshStandardMaterial[]>([]), leds = useRef<THREE.Group>(null);
  const mix = useMemo(() => new THREE.Color(), []), clean = useMemo(() => new THREE.Color("#16415c"), []), dusty = useMemo(() => new THREE.Color("#8a6a55"), []);
  useFrame(() => {
    const s = shared.current; mix.copy(clean).lerp(dusty, (s.res.dust / 100) * 0.9); mats.current.forEach(m => { if (m) m.color.copy(mix); });
    leds.current?.children.forEach((c, i) => led((c as THREE.Mesh).material as THREE.MeshStandardMaterial, s.res.power >= (i + 1) * 20 - 10, C_YEL, C_YELE));
  });
  const panel = (x: number, i: number) => <group key={i} position={[x, 0, 10]} rotation={[0, 0.35, 0]}>
    <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.1, 0.14, 1.8, 10]} /><meshStandardMaterial color="#8f9ca3" metalness={0.8} /></mesh>
    <group position={[0, 1.95, 0]} rotation={[-0.62, 0, 0]}>
      <mesh castShadow><boxGeometry args={[4.6, 0.1, 2.5]} /><meshStandardMaterial color="#c4ccd0" metalness={0.8} roughness={0.4} /></mesh>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4.4, 2.3, 6, 3]} /><meshStandardMaterial ref={(m) => { if (m) mats.current[i] = m; }} color="#16415c" roughness={0.22} metalness={0.7} /></mesh>
    </group></group>;
  return <group>{panel(9.5, 0)}{panel(14.5, 1)}
    <group position={[12, 0, 13.6]}><mesh position={[0, 0.8, 0]} castShadow><boxGeometry args={[3.2, 1.6, 1.4]} /><meshStandardMaterial color="#d8dde0" metalness={0.5} roughness={0.5} /></mesh>
      <group ref={leds} position={[-1.2, 1.2, 0.72]}>{[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[i * 0.5, 0, 0]}><boxGeometry args={[0.32, 0.18, 0.04]} /><meshStandardMaterial color="#3a3f42" /></mesh>)}</group></group>
  </group>;
}
function Shelter({ shared }: { shared: R<Shared> }) {
  const lamp = useRef<THREE.Mesh>(null);
  useFrame(() => { const m = lamp.current?.material as THREE.MeshStandardMaterial | undefined; if (m) m.emissiveIntensity = 0.3 + shared.current.res.shield / 100 * 1.6 + (shared.current.alert ? Math.sin(performance.now() * 0.004) * 0.5 : 0); });
  return <group position={[-12, 0, 10.5]}>
    <mesh position={[0, 0.9, 0]} scale={[1, 0.55, 0.85]} castShadow receiveShadow><sphereGeometry args={[3.6, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#9d6a52" roughness={1} /></mesh>
    <mesh position={[0, 0.9, 0]} scale={[1.02, 0.56, 0.87]}><sphereGeometry args={[3.35, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#cfd3d4" metalness={0.4} roughness={0.6} /></mesh>
    <mesh position={[0, 0.9, 2.5]} castShadow><boxGeometry args={[2.1, 1.8, 1.4]} /><meshStandardMaterial color="#aab2b6" metalness={0.5} roughness={0.5} /></mesh>
    <mesh position={[0, 0.85, 3.22]}><boxGeometry args={[1.1, 1.5, 0.06]} /><meshStandardMaterial color="#27465a" metalness={0.6} /></mesh>
    <mesh ref={lamp} position={[0, 2.0, 3.0]}><boxGeometry args={[1.5, 0.14, 0.1]} /><meshStandardMaterial color="#7bffd4" emissive="#4cf0b6" emissiveIntensity={1} /></mesh>
    {[-1, 1].map(s => <mesh key={s} position={[s * 1.4, 1.2, 2.5]}><boxGeometry args={[0.3, 2.2, 0.3]} /><meshStandardMaterial color="#ffb25b" emissive="#ff9a3c" emissiveIntensity={0.6} /></mesh>)}
  </group>;
}
function Paths() {
  const targets: [number, number][] = [[-12, -5], [-5.5, -12.5], [13, -7], [12, 10], [-12, 10.5]];
  return <group>{targets.map(([x, z], i) => { const d = Math.hypot(x, z), a = Math.atan2(x, z); return <mesh key={i} position={[x / 2, 0.03, z / 2]} rotation={[-Math.PI / 2, 0, a]}><planeGeometry args={[0.7, d - 7]} /><meshStandardMaterial color="#4a3b36" emissive="#ffb25b" emissiveIntensity={0.08} roughness={1} /></mesh>; })}</group>;
}
function Marker({ shared }: { shared: R<Shared> }) {
  const g = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = shared.current, o = s.objective, m = g.current; if (!m) return; const show = !!o && o.loc === s.loc; m.visible = show; if (!o || !show) return;
    m.position.set(o.x, (o.loc === "outdoor" ? groundH(o.x, o.z) : 0) + 0.05, o.z);
    if (ring.current) { const k = 1 + (s.reduced ? 0 : Math.sin(performance.now() * 0.003) * 0.12); ring.current.scale.set(k, k, 1); }
  });
  return <group ref={g} visible={false}>
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.0, 1.25, 40]} /><meshBasicMaterial color="#4fd6ff" transparent opacity={0.9} depthWrite={false} /></mesh>
    <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[0.7, 0.7, 5, 20, 1, true]} /><meshBasicMaterial color="#4fd6ff" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 5.6, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.35, 0.7, 4]} /><meshBasicMaterial color="#9eeeff" /></mesh>
  </group>;
}

/* ---- interior of the sealed, pressurized habitat (built far from the outdoor base so they never overlap) ---- */
function Interior({ shared }: { shared: R<Shared> }) {
  const racks = useRef<THREE.Group>(null);
  const floor = useMemo(() => canvasTex((g, s) => { g.fillStyle = "#5a6268"; g.fillRect(0, 0, s, s); g.strokeStyle = "rgba(220,235,240,.18)"; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); } }, 128, [7, 6]), []);
  useEffect(() => () => floor.dispose(), [floor]);
  useFrame(() => { const l = shared.current.res.life; racks.current?.children.forEach((c, i) => led((c as THREE.Mesh).material as THREE.MeshStandardMaterial, l >= (i + 1) * 20 - 10)); });
  const wall = <meshStandardMaterial color="#cfd5d8" roughness={0.6} metalness={0.2} />;
  return <group position={[IN_X, 0, 0]}>
    <mesh position={[0, 0, 0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[14, 13]} /><meshStandardMaterial map={floor} roughness={0.6} metalness={0.3} /></mesh>
    <mesh position={[0, 3.4, 0.5]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[14, 13]} /><meshStandardMaterial color="#aeb6ba" roughness={0.8} /></mesh>
    <mesh position={[0, 1.7, -6.1]}><boxGeometry args={[14, 3.4, 0.2]} />{wall}</mesh>
    <mesh position={[0, 1.7, 7.1]}><boxGeometry args={[14, 3.4, 0.2]} />{wall}</mesh>
    <mesh position={[-7.1, 1.7, 0.5]}><boxGeometry args={[0.2, 3.4, 13]} />{wall}</mesh>
    <mesh position={[7.1, 1.7, 0.5]}><boxGeometry args={[0.2, 3.4, 13]} />{wall}</mesh>
    <mesh position={[0, 1.9, -5.95]}><planeGeometry args={[7.4, 1.7]} /><meshStandardMaterial color="#2a3338" /></mesh>
    <mesh position={[0, 1.9, -5.92]}><planeGeometry args={[7, 1.3]} /><meshStandardMaterial color="#e9a06c" emissive="#d9824f" emissiveIntensity={0.9} /></mesh>
    {[-4, 0, 4].map(x => <mesh key={x} position={[x, 3.3, 0.5]}><boxGeometry args={[0.5, 0.06, 10]} /><meshStandardMaterial color="#fff6e6" emissive="#fff0d0" emissiveIntensity={1.5} /></mesh>)}
    <group position={[-3.6, 0, -3.9]}><mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[3.2, 1, 1.2]} /><meshStandardMaterial color="#8a949a" metalness={0.5} roughness={0.5} /></mesh>{[-1, 0, 1].map(i => <mesh key={i} position={[i * 0.95, 1.5, -0.2]} rotation={[-0.25, 0, 0]}><planeGeometry args={[0.9, 0.6]} /><meshStandardMaterial color="#58c9ee" emissive="#2aa8d4" emissiveIntensity={1.2} side={THREE.DoubleSide} /></mesh>)}</group>
    <group position={[4.6, 0, -3.9]}><mesh position={[0, 1.2, 0]} castShadow><boxGeometry args={[1.4, 2.4, 0.9]} /><meshStandardMaterial color="#b9c1c6" metalness={0.5} roughness={0.5} /></mesh><group ref={racks} position={[-0.45, 0.6, 0.47]}>{[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[0, i * 0.35, 0]}><boxGeometry args={[0.7, 0.14, 0.04]} /><meshStandardMaterial color="#3a4448" /></mesh>)}</group></group>
    <group position={[-5.6, 0, 2.6]}><mesh position={[0, 0.35, 0]} castShadow><boxGeometry args={[2.2, 0.5, 1.1]} /><meshStandardMaterial color="#e7e0d2" roughness={0.9} /></mesh><mesh position={[0, 0.7, 0]}><boxGeometry args={[2.1, 0.22, 1.0]} /><meshStandardMaterial color="#5f7f93" roughness={0.9} /></mesh></group>
    <group position={[4.4, 0, 1.6]}><mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.95, 0.95, 0.1, 24]} /><meshStandardMaterial color="#d8d4cc" /></mesh><mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.08, 0.12, 0.7, 10]} /><meshStandardMaterial color="#8a949a" metalness={0.6} /></mesh></group>
    {[-5.8, -5, -4.2].map((x, i) => <mesh key={i} position={[x, 0.5, 4.4]}><boxGeometry args={[0.6, 0.3, 0.45]} /><meshStandardMaterial color="#6fae5f" roughness={0.9} /></mesh>)}
    <group position={[0, 0, 6.9]}><mesh position={[0, 1.2, 0]}><boxGeometry args={[1.8, 2.4, 0.15]} /><meshStandardMaterial color="#27465a" emissive="#2fb4d6" emissiveIntensity={0.7} metalness={0.6} /></mesh>{[-1, 1].map(s => <mesh key={s} position={[s * 1.0, 1.2, 0]}><boxGeometry args={[0.1, 2.5, 0.2]} /><meshStandardMaterial color="#ffb25b" emissive="#ff9a3c" emissiveIntensity={1} /></mesh>)}</group>
  </group>;
}

/* ============================================================================
 * SECTION F — MYSHA CHARACTER
 * Existing FBX + a stylised pressure suit fitted from the skeleton's STRUCTURE (not bone names).
 * ========================================================================== */
type SuitBuild = { pivots: THREE.Object3D[]; dispose: () => void; ok: boolean; why: string };
function buildSuit(root: THREE.Object3D): SuitBuild {
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [], pivots: THREE.Object3D[] = [], bones: THREE.Bone[] = [];
  root.traverse(o => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone); });
  const fail = (why: string): SuitBuild => ({ pivots, dispose: () => undefined, ok: false, why });
  if (bones.length < 12) return fail(`Only ${bones.length} bones found; a humanoid rig is needed.`);
  root.updateMatrixWorld(true);
  const wp = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3()), kids = (b: THREE.Bone) => b.children.filter(c => (c as THREE.Bone).isBone) as THREE.Bone[];
  const hips = (bones.find(b => /hips|pelvis/i.test(b.name)) ?? bones.find(b => !(b.parent as THREE.Bone | null)?.isBone) ?? bones[0]) as THREE.Bone;
  let chest: THREE.Bone = hips; const spine: THREE.Bone[] = [hips];
  for (let g = 0; g < 8; g++) {
    const k = kids(chest).filter(c => wp(c).y > wp(chest).y + 0.005).sort((a, b) => wp(b).y - wp(a).y); if (!k.length) break;
    chest = k[0]; spine.push(chest); if (kids(chest).length >= 3) break;
  }
  const top = kids(chest); if (top.length < 3) return fail("Could not find neck and both shoulders above the spine.");
  const sorted = [...top].sort((a, b) => Math.abs(wp(a).x - wp(chest).x) - Math.abs(wp(b).x - wp(chest).x)), neck = sorted[0], shoulders = sorted.slice(1, 3);
  let head: THREE.Bone = neck; const nk = kids(neck).sort((a, b) => wp(b).y - wp(a).y)[0]; if (nk) head = nk;
  const follow = (b: THREE.Bone, n: number) => { const out = [b]; let c = b; for (let i = 0; i < n; i++) { const k = kids(c); if (!k.length) break; c = k[0]; out.push(c); } return out; };
  const arms = shoulders.map(s => follow(s, 3)).filter(a => a.length >= 3);
  const legStarts = kids(hips).filter(c => wp(c).y < wp(hips).y - 0.01).sort((a, b) => wp(a).x - wp(b).x);
  if (legStarts.length < 2 || arms.length < 2) return fail("Could not find two arm and two leg chains.");
  const legs = legStarts.slice(0, 2).map(l => follow(l, 4)).filter(l => l.length >= 3);
  if (legs.length < 2) return fail("Leg chains are too short.");
  const white = new THREE.MeshStandardMaterial({ color: "#e8ebed", roughness: 0.62, metalness: 0.05 }), grey = new THREE.MeshStandardMaterial({ color: "#8c969c", roughness: 0.5, metalness: 0.35 });
  const orange = new THREE.MeshStandardMaterial({ color: "#d2632d", roughness: 0.55 }), glass = new THREE.MeshStandardMaterial({ color: "#cfe9f2", transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.25, depthWrite: false });
  const glow = new THREE.MeshStandardMaterial({ color: "#7dffb2", emissive: "#33e07a", emissiveIntensity: 1.2 }); mats.push(white, grey, orange, glass, glow);
  // A pivot is a child of a bone whose frame is world-aligned, so offsets below are in metres.
  const pv = (b: THREE.Object3D) => { const g = new THREE.Group(); b.add(g); const q = new THREE.Quaternion(), s = new THREE.Vector3(); b.getWorldQuaternion(q); b.getWorldScale(s); g.quaternion.copy(q.invert()); g.scale.setScalar(1 / (s.x || 1)); pivots.push(g); return g; };
  const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, quat?: THREE.Quaternion, scale?: THREE.Vector3) => { const m = new THREE.Mesh(geo, mat); geos.push(geo); m.position.copy(pos); if (quat) m.quaternion.copy(quat); if (scale) m.scale.copy(scale); m.castShadow = true; m.receiveShadow = true; p.add(m); return m; };
  const Y = new THREE.Vector3(0, 1, 0);
  const sleeve = (a: THREE.Bone, b: THREE.Bone, r: number, mat: THREE.Material, extend = 0.012) => {
    const pa = wp(a), d = wp(b).sub(pa), len = d.length(); if (len < 0.01) return;
    add(pv(a), new THREE.CapsuleGeometry(r, len + extend, 6, 14), mat, d.clone().multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
  };
  const ball = (b: THREE.Bone, off: THREE.Vector3, r: number, mat: THREE.Material, sc?: THREE.Vector3) => add(pv(b), new THREE.SphereGeometry(r, 16, 12), mat, off, undefined, sc);
  const ring = (b: THREE.Bone, off: THREE.Vector3, r: number, t: number, mat: THREE.Material, along?: THREE.Vector3) => { const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), along ?? Y); add(pv(b), new THREE.TorusGeometry(r, t, 8, 28), mat, off, q); };
  for (let i = 0; i < spine.length - 1; i++) sleeve(spine[i], spine[i + 1], i === 0 ? 0.135 : 0.15, white, 0.03);
  ball(chest, new THREE.Vector3(0, 0.02, 0), 0.155, white);
  ball(hips, new THREE.Vector3(0, -0.02, 0), 0.14, white, new THREE.Vector3(1.05, 0.85, 0.9)); ring(hips, new THREE.Vector3(0, 0.08, 0), 0.145, 0.014, orange);
  arms.forEach(c => {
    ball(c[0], new THREE.Vector3(0, 0, 0), 0.085, white); for (let i = 0; i < c.length - 1; i++) sleeve(c[i], c[i + 1], i === 0 ? 0.075 : i === 1 ? 0.066 : 0.058, white, 0.02);
    const hand = c[c.length - 1], prev = c[c.length - 2], dir = wp(hand).sub(wp(prev)).normalize();
    ring(prev, wp(hand).sub(wp(prev)).multiplyScalar(0.9), 0.058, 0.014, orange, dir); ball(hand, dir.clone().multiplyScalar(0.05), 0.07, grey, new THREE.Vector3(1, 1.1, 0.8));
  });
  legs.forEach(c => {
    for (let i = 0; i < c.length - 1; i++) sleeve(c[i], c[i + 1], i === 0 ? 0.1 : i === 1 ? 0.078 : 0.065, white, 0.02);
    const foot = c[Math.min(2, c.length - 1)], shin = wp(c[2]).sub(wp(c[1]));
    ball(foot, new THREE.Vector3(0, -0.035, 0.07), 0.07, grey, new THREE.Vector3(1.0, 0.8, 1.9)); ring(c[1], shin.clone().multiplyScalar(0.55), 0.07, 0.013, orange, shin.normalize());
  });
  const bp = pv(chest), back = new THREE.Vector3(0, 0, -0.17);
  add(bp, new THREE.SphereGeometry(0.18, 20, 14), white, back.clone().add(new THREE.Vector3(0, 0.02, 0)), undefined, new THREE.Vector3(0.95, 1.35, 0.55));
  [-0.09, 0.09].forEach(x => { add(bp, new THREE.CapsuleGeometry(0.032, 0.26, 4, 10), grey, new THREE.Vector3(x, 0.05, -0.31)); add(bp, new THREE.SphereGeometry(0.034, 10, 8), orange, new THREE.Vector3(x, 0.21, -0.31)); });
  add(bp, new THREE.SphereGeometry(0.075, 14, 10), grey, new THREE.Vector3(0, 0.02, 0.14), undefined, new THREE.Vector3(1.3, 0.9, 0.5));
  [-0.035, 0, 0.035].forEach((x, i) => add(bp, new THREE.SphereGeometry(0.009, 6, 6), i === 1 ? glow : orange, new THREE.Vector3(x, 0.025, 0.165)));
  [-0.12, 0.12].forEach(x => { const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x * 0.8, 0.12, -0.18), new THREE.Vector3(x * 1.3, 0.2, -0.05), new THREE.Vector3(x * 0.7, 0.2, 0.1)]); add(bp, new THREE.TubeGeometry(curve, 12, 0.011, 6, false), grey, new THREE.Vector3(0, 0, 0)); });
  const hv = pv(head);
  add(hv, new THREE.SphereGeometry(0.185, 28, 20), glass, new THREE.Vector3(0, 0.095, 0.01)); ring(head, new THREE.Vector3(0, -0.035, 0), 0.105, 0.02, white); ring(head, new THREE.Vector3(0, -0.035, 0), 0.115, 0.007, orange);
  [-0.17, 0.17].forEach(x => add(hv, new THREE.SphereGeometry(0.02, 8, 6), glow, new THREE.Vector3(x, 0.07, 0.02)));
  return { pivots, ok: true, why: "", dispose: () => { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); } };
}
/** Simple helmet + life-support pack, parented to Mysha's root group (used only if the skeleton suit cannot be fitted). */
function GearMeshes() {
  return <group>
    <mesh position={[0, 1.56, 0.01]}><sphereGeometry args={[0.2, 24, 16]} /><meshStandardMaterial color="#cfe9f2" transparent opacity={0.2} roughness={0.05} metalness={0.25} depthWrite={false} /></mesh>
    <mesh position={[0, 1.4, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.11, 0.02, 8, 24]} /><meshStandardMaterial color="#e8ebed" roughness={0.6} /></mesh>
    <mesh position={[0, 1.2, -0.2]} castShadow><boxGeometry args={[0.34, 0.46, 0.18]} /><meshStandardMaterial color="#e8ebed" roughness={0.6} metalness={0.1} /></mesh>
    {[-0.09, 0.09].map(x => <mesh key={x} position={[x, 1.2, -0.31]}><cylinderGeometry args={[0.035, 0.035, 0.3, 10]} /><meshStandardMaterial color="#8c969c" metalness={0.4} /></mesh>)}
  </group>;
}
/** Full stylised stand-in used only if the FBX itself fails to load, so the level stays playable. */
function PrimitiveAstronaut({ shared }: { shared: R<Shared> }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { const s = shared.current, h = g.current; if (!h) return; h.position.set(s.pos.x, s.loc === "outdoor" ? groundH(s.pos.x, s.pos.z) : 0, s.pos.z); h.rotation.y += Math.atan2(Math.sin(s.heading - h.rotation.y), Math.cos(s.heading - h.rotation.y)) * (1 - Math.exp(-9 * dt)); });
  return <group ref={g}>
    <mesh position={[0, 1.0, 0]} castShadow><capsuleGeometry args={[0.17, 0.55, 6, 14]} /><meshStandardMaterial color="#e8ebed" roughness={0.6} /></mesh>
    {[-0.1, 0.1].map(x => <mesh key={x} position={[x, 0.4, 0]} castShadow><capsuleGeometry args={[0.08, 0.5, 6, 10]} /><meshStandardMaterial color="#e8ebed" roughness={0.6} /></mesh>)}
    {[-0.26, 0.26].map(x => <mesh key={x} position={[x, 1.05, 0]} castShadow><capsuleGeometry args={[0.065, 0.45, 6, 10]} /><meshStandardMaterial color="#e8ebed" roughness={0.6} /></mesh>)}
    <GearMeshes />
  </group>;
}
function pickClips(anims: THREE.AnimationClip[]) {
  const walk = anims.find(a => /walk/i.test(a.name)) ?? anims[0];
  const run = anims.find(a => a !== walk && /run|jog|sprint/i.test(a.name));
  const idle = anims.find(a => a !== walk && a !== run && /idle|stand|breath/i.test(a.name));
  return { walk, run, idle };
}
/** Removes the imported clip's root translation so the controller is the sole source of player movement.
 * A source FBX with baked forward hip/root motion can otherwise drift and jump on clip loop.
 * Preserve all joint rotation tracks; only strip movement-driving bone translation.
 */
function stableLocomotionClips(clips: { walk?: THREE.AnimationClip; run?: THREE.AnimationClip; idle?: THREE.AnimationClip }) {
  const stable = (original?: THREE.AnimationClip) => {
    if (!original) return undefined;
    const clip = original.clone();
    clip.tracks = clip.tracks.filter(track =>
      !(track.name.endsWith(".position") && /(?:^|[.\/|])(?:hips|pelvis|root|armature|rootnode)(?:[.\/|]|$)/i.test(track.name))
    );
    return clip;
  };
  return { walk: stable(clips.walk), run: stable(clips.run), idle: stable(clips.idle) };
}
function MyshaReal({ shared, onStatus }: { shared: R<Shared>; onStatus: (s: ModelStatus) => void }) {
  const source = useFBX(MODEL), texture = useTexture(TEX);
  const holder = useRef<THREE.Group>(null), inner = useRef<THREE.Group>(null), gear = useRef<THREE.Group>(null);
  const w = useRef({ walk: 0, run: 0, idle: 0, was: false }), acts = useRef<{ walk?: THREE.AnimationAction; run?: THREE.AnimationAction; idle?: THREE.AnimationAction }>({});
  const cb = useRef(onStatus); cb.current = onStatus;
  const prepared = useMemo(() => {
    const root = cloneSkeleton(source), tex = texture.clone(); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const materials: THREE.Material[] = [];
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return; o.visible = true; o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      const conv = (m: THREE.Material) => { const old = m as THREE.MeshPhongMaterial; const nm = new THREE.MeshStandardMaterial({ map: old.map ?? tex, color: "white", metalness: 0.06, roughness: /hair/i.test(m.name) ? 0.58 : 0.68, side: THREE.DoubleSide }); materials.push(nm); return nm; };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    root.updateMatrixWorld(true);
    const h = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y; root.scale.setScalar(h > 0 ? 1.72 / h : 1); root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root), c = b.getCenter(new THREE.Vector3()); root.position.set(-c.x, -b.min.y, -c.z); root.updateMatrixWorld(true);
    return { root, tex, materials, suit: buildSuit(root), clips: stableLocomotionClips(pickClips(source.animations)) };
  }, [source, texture]);
  const mixer = useMemo(() => new THREE.AnimationMixer(prepared.root), [prepared.root]);
  useEffect(() => {
    const note = prepared.suit.ok ? "Suit fitted to skeleton (stylised)." : `Suit fallback: ${prepared.suit.why}`;
    if (!prepared.suit.ok) console.warn("[Level 4] Suit could not be fitted:", prepared.suit.why);
    cb.current({ state: "ready", suit: prepared.suit.ok ? "fitted" : "fallback", note });
  }, [prepared]);
  useEffect(() => {
    const mk = (clip?: THREE.AnimationClip) => { if (!clip) return undefined; const a = mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); a.setEffectiveWeight(0); a.play(); return a; };
    acts.current = { walk: mk(prepared.clips.walk), run: mk(prepared.clips.run), idle: mk(prepared.clips.idle) };
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(prepared.root); acts.current = {}; };
  }, [prepared, mixer]);
  useEffect(() => () => { prepared.tex.dispose(); prepared.materials.forEach(m => m.dispose()); prepared.suit.dispose(); }, [prepared]);
  useFrame((_, rawDt) => {
    const s = shared.current, g = holder.current; if (!g) return; const dt = Math.min(rawDt, 0.05);
    g.position.set(s.pos.x, s.loc === "outdoor" ? groundH(s.pos.x, s.pos.z) : 0, s.pos.z);
    g.rotation.y += Math.atan2(Math.sin(s.heading - g.rotation.y), Math.cos(s.heading - g.rotation.y)) * (1 - Math.exp(-9 * dt));
    // Animation blending: only clips present in the file are used.
    const a = acts.current, k = 1 - Math.exp(-10 * dt), hasRun = !!a.run, hasIdle = !!a.idle, wt = w.current;
    if (hasIdle) {
      wt.walk += ((s.moving && !(s.running && hasRun) ? 1 : 0) - wt.walk) * k; wt.run += ((s.moving && s.running && hasRun ? 1 : 0) - wt.run) * k; wt.idle += ((s.moving ? 0 : 1) - wt.idle) * k;
      a.walk?.setEffectiveWeight(wt.walk); a.run?.setEffectiveWeight(wt.run); a.idle?.setEffectiveWeight(wt.idle);
      a.walk?.setEffectiveTimeScale(s.running && !hasRun ? 1.5 : 1); mixer.update(dt);
    } else if (a.walk) {
      // No idle clip in the file: hold the first walk frame as a neutral standing pose.
      a.walk.setEffectiveWeight(1);
      if (s.moving) { a.walk.setEffectiveTimeScale(s.running && !hasRun ? 1.5 : 1); wt.was = true; mixer.update(dt); }
      else { if (wt.was) { wt.was = false; } a.walk.setEffectiveTimeScale(0); mixer.update(0); }
    }
    // Outside (or in an unpressurized interior) the suit is always shown; ordinary clothing only in a sealed habitat.
    const suited = s.loc === "outdoor" || !s.pressurized;
    prepared.suit.pivots.forEach(p => { p.visible = suited; }); if (gear.current) gear.current.visible = suited && !prepared.suit.ok;
    if (inner.current) { const t = performance.now() * 0.0016; inner.current.scale.y = 1 + (s.moving || s.reduced ? 0 : Math.sin(t * 2.2) * 0.004); }
  });
  return <group ref={holder}><group ref={inner}><primitive object={prepared.root} /></group><group ref={gear} visible={false}><GearMeshes /></group>
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.5, 24]} /><meshBasicMaterial color="#1c1010" transparent opacity={0.3} depthWrite={false} /></mesh></group>;
}
class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[Level 4] Mysha model failed to load:", MODEL, err); this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/* ============================================================================
 * SECTION G — SCENE: MOVEMENT, COLLISION, CAMERA, LIGHTING, LOCATION VISIBILITY
 * ========================================================================== */
function Scene({ shared, onNear, onReach, onFootstep, onModelStatus }: {
  shared: R<Shared>; onNear: (id: SpotId | null) => void; onReach: (id: string) => void; onFootstep: () => void; onModelStatus: (s: ModelStatus) => void;
}) {
  const nearRef = useRef<SpotId | null>(null), reached = useRef<string | null>(null), foot = useRef(0), init = useRef(false);
  const camPos = useRef(new THREE.Vector3()), camLook = useRef(new THREE.Vector3());
  const sc = useMemo(() => ({ want: new THREE.Vector3(), look: new THREE.Vector3(), a: new THREE.Vector3() }), []);
  const out = useRef<THREE.Group>(null), inn = useRef<THREE.Group>(null), sun = useRef<THREE.DirectionalLight>(null), amb = useRef<THREE.AmbientLight>(null), hemi = useRef<THREE.HemisphereLight>(null), door = useRef<THREE.PointLight>(null), room = useRef<THREE.PointLight>(null);
  const { scene } = useThree(); const bg = useMemo(() => new THREE.Color("#d59468"), []);
  useEffect(() => { scene.fog = new THREE.Fog("#d59468", 28, 190); scene.background = bg; return () => { scene.fog = null; scene.background = null; }; }, [scene, bg]);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05), s = shared.current, p = s.pos, k = s.keys, indoor = s.loc === "indoor";
    if (s.launching) s.launchT += dt;
    // ---- movement (camera-relative) ----
    let fw = Number(k.f) - Number(k.b) + s.joy.y, sd = Number(k.r) - Number(k.l) + s.joy.x; const mag = Math.min(1, Math.hypot(fw, sd));
    s.moving = false; s.running = false;
    if (s.enabled && mag > 0.06) {
      const nrm = Math.max(1, Math.hypot(fw, sd)); fw /= nrm; sd /= nrm;
      const run = k.run || Math.hypot(s.joy.x, s.joy.y) > 0.9, speed = (run ? 5.2 : 3.0) * Math.max(0.5, mag);
      let dx = -Math.sin(s.yaw) * fw + Math.cos(s.yaw) * sd, dz = -Math.cos(s.yaw) * fw - Math.sin(s.yaw) * sd; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      p.x += dx * speed * dt; p.z += dz * speed * dt; s.heading = Math.atan2(dx, dz); s.moving = true; s.running = run;
      foot.current += dt; if (foot.current > (run ? 0.28 : 0.45)) { foot.current = 0; onFootstep(); }
    } else foot.current = 0;
    // Short, self-contained auto-boarding walk after E is pressed at the rocket bay.
    if (s.boarding) {
      s.boardT = Math.min(1, s.boardT + dt / 1.65);
      const e = s.boardT * s.boardT * (3 - 2 * s.boardT);
      p.lerpVectors(s.boardFrom, s.boardTo, e);
      s.heading = Math.atan2(s.boardTo.x - s.boardFrom.x, s.boardTo.z - s.boardFrom.z);
      s.moving = s.boardT < 1;
      s.running = false;
      if (s.boardT >= 1) s.boarding = false;
    }
    if (indoor) { p.x = clamp(p.x, IN_X - 6.4, IN_X + 6.4); p.z = clamp(p.z, -5.4, 6.2); } else { const d = Math.hypot(p.x, p.z); if (d > 34) { p.x *= 34 / d; p.z *= 34 / d; } }
    for (const c of SOLID) { if (c.loc !== s.loc) continue; const ddx = p.x - c.x, ddz = p.z - c.z, d = Math.hypot(ddx, ddz), min = c.r + 0.45; if (d < min && d > 0.0001) { p.x = c.x + ddx / d * min; p.z = c.z + ddz / d * min; } }
    // ---- interaction proximity ----
    let best: SpotId | null = null, bd = 1e9;
    for (const sp of SPOTS) { if (sp.loc !== s.loc) continue; const d = Math.hypot(p.x - sp.x, p.z - sp.z); if (d < sp.reach && d < bd) { bd = d; best = sp.id; } }
    if (best !== nearRef.current) { nearRef.current = best; s.near = best; onNear(best); }
    const o = s.objective;
    if (o && o.loc === s.loc && s.enabled) { const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < o.r) { if (reached.current !== o.id) { reached.current = o.id; onReach(o.id); } } else if (reached.current === o.id && d > o.r + 1.2) reached.current = null; }
    else if (!o) reached.current = null;
    // ---- visibility + lighting (no per-frame allocation) ----
    if (out.current) out.current.visible = !indoor; if (inn.current) inn.current.visible = indoor;
    const k2 = (s.day - 1) / (TOTAL_DAYS - 1), alertish = s.alert || s.storm;
    if (sun.current) { sun.current.intensity = indoor ? 0 : s.alert ? 1.1 : s.storm ? 1.6 : 2.7; sun.current.position.set(-40, 8 + k2 * 34, -14); sun.current.target.position.set(0, 0, 0); sun.current.target.updateMatrixWorld(); }
    if (amb.current) amb.current.intensity = indoor ? 0.9 : s.alert ? 0.35 : 0.55;
    if (hemi.current) hemi.current.intensity = indoor ? 0 : 0.7;
    if (door.current) door.current.intensity = indoor ? 0 : 6;
    if (room.current) { room.current.intensity = indoor ? (s.alert ? 8 : 14) : 0; room.current.color.copy(s.alert ? L_ALERT : L_ROOM); }
    const fog = scene.fog as THREE.Fog | null, fogTarget = indoor ? F_IN : s.alert ? F_ALERT : s.storm ? F_STORM : F_CLEAR;
    if (fog) { fog.color.lerp(fogTarget, 1 - Math.exp(-2 * dt)); fog.near = indoor ? 40 : 28; fog.far = indoor ? 80 : alertish ? 90 : 190; }
    bg.copy(indoor ? F_IN : fogTarget);
    // ---- camera ----
    if (s.snapCam) { init.current = false; s.snapCam = false; }
    const cam = state.camera, dist = indoor ? 4.3 : 6.6, hgt = indoor ? 2.6 : 3.3, want = sc.want, look = sc.look, gh = indoor ? 0 : groundH(p.x, p.z);
    if (s.camMode === "arrival") {
      s.arrivalT += dt; const t = s.reduced ? 1 : Math.min(1, s.arrivalT / ARRIVAL_SECONDS), e = t * t * (3 - 2 * t);
      want.lerpVectors(ARRIVAL_START, ARRIVAL_END, e); look.lerpVectors(ARRIVAL_LOOK_A, ARRIVAL_LOOK_B, e);
    } else if (s.camMode === "inspect" && s.focus) {
      const f = s.focus; sc.a.set(p.x - f.x, 0, p.z - f.z); if (sc.a.lengthSq() < 0.001) sc.a.set(0, 0, 1); else sc.a.normalize();
      want.set(f.x, 0, f.z).addScaledVector(sc.a, 9); want.x += 2; want.y += 3.2; look.set(f.x, 1.8, f.z);
    } else if (s.camMode === "launch") {
      const lt = s.launching ? s.launchT : 0; want.set(ROCKET.x - 15, 4 + Math.min(40, lt * 2.2), ROCKET.z + 20); look.set(ROCKET.x, 5 + Math.pow(Math.min(1, lt / 14), 2) * 90, ROCKET.z);
    } else {
      want.set(p.x + Math.sin(s.yaw) * dist, hgt + gh, p.z + Math.cos(s.yaw) * dist); look.set(p.x, (indoor ? 1.2 : 1.35) + gh, p.z);
      if (indoor) { want.x = clamp(want.x, IN_X - 6.5, IN_X + 6.5); want.z = clamp(want.z, -5.6, 6.6); want.y = Math.min(want.y, 3.0); }
      else {
        for (const c of SOLID) { if (c.loc !== "outdoor") continue; const ddx = want.x - c.x, ddz = want.z - c.z, d = Math.hypot(ddx, ddz), min = c.r + 0.9; if (d < min && d > 0.001) { want.x = c.x + ddx / d * min; want.z = c.z + ddz / d * min; } }
        want.y = Math.max(want.y, groundH(want.x, want.z) + 1.2);
      }
    }
    if (!init.current) { camPos.current.copy(want); camLook.current.copy(look); init.current = true; }
    const a = 1 - Math.exp(-(s.camMode === "follow" ? 6 : 2.5) * dt); camPos.current.lerp(want, a); camLook.current.lerp(look, a); cam.position.copy(camPos.current); cam.lookAt(camLook.current);
  });
  return <>
    <ambientLight ref={amb} color="#e9b8a5" /><hemisphereLight ref={hemi} args={["#f5b48b", "#59352c", 0.7]} />
    <directionalLight ref={sun} color="#ffd2a8" castShadow shadow-mapSize={[1536, 1536]} shadow-camera-left={-32} shadow-camera-right={32} shadow-camera-top={32} shadow-camera-bottom={-32} shadow-camera-far={140} shadow-bias={-0.0004} />
    <pointLight ref={door} position={[0, 3, 6.5]} color="#a8efff" distance={14} /><pointLight ref={room} position={[IN_X, 3, 0.5]} distance={22} />
    <group ref={out}><Sky shared={shared} /><Terrain /><Mountains /><Rocks /><Paths /><Habitat /><Hydroponics shared={shared} /><WaterUnit shared={shared} /><Rocket shared={shared} /><SolarField shared={shared} /><Shelter shared={shared} /><Dust shared={shared} /></group>
    <group ref={inn} visible={false}><Interior shared={shared} /></group>
    <Marker shared={shared} />
    <ModelBoundary onError={() => onModelStatus({ state: "error", suit: "fallback", note: `Mysha model unavailable (${MODEL}); using a simple stand-in astronaut.` })} fallback={<PrimitiveAstronaut shared={shared} />}>
      <Suspense fallback={null}><MyshaReal shared={shared} onStatus={onModelStatus} /></Suspense>
    </ModelBoundary>
  </>;
}

/* ============================================================================
 * SECTION H — PUBLIC WORLD API FOR PART 2 (all functions take the shared ref explicitly; no hidden globals)
 * ========================================================================== */
export function createShared(day = 1, res?: Res): R<Shared> {
  return { current: {
    pos: SPAWN.clone(), heading: Math.atan2(ROCKET.x - SPAWN.x, ROCKET.z - SPAWN.z), moving: false, running: false, yaw: 0, arrivalT: 0,
    keys: { f: false, b: false, l: false, r: false, run: false }, joy: { x: 0, y: 0 }, enabled: false, loc: "outdoor", pressurized: true, near: null,
    res: res ? { ...res } : initialRes(DEFAULT_PLAN), day, storm: false, alert: false, launching: false, launchT: 0, objective: null, camMode: "arrival", focus: null,
    reduced: typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, snapCam: false, outcome: null,
    boarding: false, boardT: 0, boardFrom: SPAWN.clone(), boardTo: SPAWN.clone(),
  } };
}
/** Stable shared-world ref for a component. */
export function useSharedWorld(day = 1, res?: Res): R<Shared> {
  const ref = useRef<R<Shared> | null>(null); if (!ref.current) ref.current = createShared(day, res); return ref.current;
}
export const setWorldEnabled = (sh: R<Shared>, on: boolean) => { sh.current.enabled = on; if (!on) { const k = sh.current.keys; k.f = k.b = k.l = k.r = k.run = false; sh.current.joy.x = 0; sh.current.joy.y = 0; } };
export const setObjective = (sh: R<Shared>, o: Objective | null) => { sh.current.objective = o; };
export function objectiveForSpot(id: SpotId, label?: string): Objective { const sp = SPOTS.find(x => x.id === id) ?? SPOTS[0]; return { id: sp.id, x: sp.x, z: sp.z, r: Math.max(sp.reach * 0.6, 1.6), label: label ?? SPOT_LABEL[sp.id], loc: sp.loc }; }
export const setCameraMode = (sh: R<Shared>, mode: CamMode, focus: { x: number; z: number } | null = null) => { const s = sh.current; if (mode === "arrival" && s.camMode !== "arrival") s.arrivalT = 0; s.camMode = mode; s.focus = focus; };
export function focusOnSpot(sh: R<Shared>, id: SpotId) { const sp = SPOTS.find(x => x.id === id); if (sp) setCameraMode(sh, "inspect", { x: sp.x, z: sp.z }); }
/** Updates resource-driven visuals (crops, water level, solar dust, rocket lights, shelter lamp, life-support racks) and hazards. */
export function setWorldState(sh: R<Shared>, v: { res?: Res; day?: number; storm?: boolean; alert?: boolean; outcome?: Outcome | null }) {
  const s = sh.current; if (v.res) s.res = v.res; if (v.day != null) s.day = v.day; if (v.storm != null) s.storm = v.storm; if (v.alert != null) s.alert = v.alert; if (v.outcome !== undefined) s.outcome = v.outcome;
}
function teleport(sh: R<Shared>, loc: Loc, at: THREE.Vector3, heading: number) { const s = sh.current; s.loc = loc; s.pos.copy(at); s.heading = heading; s.moving = false; s.running = false; s.near = null; s.snapCam = true; s.camMode = "follow"; s.focus = null; }
/** Part 2 plays the airlock cue + fade; these only move the player and snap the camera. */
export const enterHabitat = (sh: R<Shared>) => teleport(sh, "indoor", INDOOR_SPAWN, Math.PI);
export const exitHabitat = (sh: R<Shared>) => teleport(sh, "outdoor", OUT_DOOR_SPAWN, Math.PI);
export function resetPlayer(sh: R<Shared>) { const s = sh.current; s.boarding = false; s.boardT = 0; teleport(sh, "outdoor", SPAWN, Math.atan2(ROCKET.x - SPAWN.x, ROCKET.z - SPAWN.z)); s.yaw = 0; s.objective = null; s.launching = false; s.launchT = 0; s.camMode = "arrival"; s.arrivalT = 0; }
export const isArrivalDone = (sh: R<Shared>) => sh.current.camMode !== "arrival" || sh.current.arrivalT >= ARRIVAL_SECONDS;
export function startLaunchCinematic(sh: R<Shared>) { const s = sh.current; s.enabled = false; s.launching = true; s.launchT = 0; s.camMode = "launch"; s.focus = null; }
export function stopLaunchCinematic(sh: R<Shared>) { const s = sh.current; s.launching = false; s.launchT = 0; }
export const setJoystick = (sh: R<Shared>, x: number, y: number) => { sh.current.joy.x = clamp(x, -1, 1); sh.current.joy.y = clamp(y, -1, 1); };
export const setTouchKey = (sh: R<Shared>, key: "f" | "b" | "l" | "r" | "run", down: boolean) => { sh.current.keys[key] = down; };
export const rotateCamera = (sh: R<Shared>, delta: number) => { sh.current.yaw += delta; };
export const getPlayerState = (sh: R<Shared>) => { const s = sh.current; return { x: s.pos.x, z: s.pos.z, loc: s.loc, moving: s.moving, running: s.running, near: s.near }; };
export const distanceToSpot = (sh: R<Shared>, id: SpotId) => { const sp = SPOTS.find(x => x.id === id), p = sh.current.pos; return sp ? Math.hypot(p.x - sp.x, p.z - sp.z) : Infinity; };

/** Keyboard input: WASD/arrows, Shift to run, E to interact. Ignored while typing in form fields. */
export function useWorldInput(shared: R<Shared>, onInteract: (near: SpotId | null) => void) {
  const cbRef = useRef(onInteract); cbRef.current = onInteract;
  useEffect(() => {
    const isField = (t: EventTarget | null) => { const n = (t as HTMLElement | null)?.tagName; return n === "INPUT" || n === "TEXTAREA" || n === "SELECT"; };
    const set = (e: KeyboardEvent, v: boolean) => {
      const k = shared.current.keys;
      if (e.code === "KeyW" || e.code === "ArrowUp") k.f = v; else if (e.code === "KeyS" || e.code === "ArrowDown") k.b = v;
      else if (e.code === "KeyA" || e.code === "ArrowLeft") k.l = v; else if (e.code === "KeyD" || e.code === "ArrowRight") k.r = v;
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") k.run = v;
    };
    const down = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      set(e, true); if (e.code === "KeyE" && !e.repeat && shared.current.enabled) cbRef.current(shared.current.near);
    };
    const up = (e: KeyboardEvent) => set(e, false);
    const reset = () => { const k = shared.current.keys; k.f = k.b = k.l = k.r = k.run = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", reset); reset(); };
  }, [shared]);
}

/** Root 3D component. Fill a positioned parent with it; render Part 2's UI as siblings on top. */
export type MarsWorldProps = {
  shared: R<Shared>;
  onNear?: (id: SpotId | null) => void; onReach?: (id: string) => void; onFootstep?: () => void;
  onModelStatus?: (s: ModelStatus) => void; onInteract?: (near: SpotId | null) => void;
  className?: string; style?: CSSProperties;
};
export function MarsWorld3D({ shared, onNear, onReach, onFootstep, onModelStatus, onInteract, className, style }: MarsWorldProps) {
  const noop = useCallback(() => undefined, []);
  useWorldInput(shared, onInteract ?? noop);
  const drag = useRef<number | null>(null);
  return <div className={className} style={{ position: "absolute", inset: 0, touchAction: "none", ...style }}
    onPointerDown={e => { if (e.button === 0 || e.pointerType === "touch") drag.current = e.clientX; }}
    onPointerMove={e => { if (drag.current != null) { shared.current.yaw -= (e.clientX - drag.current) * 0.006; drag.current = e.clientX; } }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
    <Canvas shadows dpr={[1, 1.6]} camera={{ position: [30, 14, 26], fov: 55, near: 0.1, far: 900 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <Scene shared={shared} onNear={onNear ?? noop} onReach={onReach ?? noop} onFootstep={onFootstep ?? noop} onModelStatus={onModelStatus ?? noop} />
    </Canvas>
  </div>;
}

// ===== END OF PART 1 — PART 2 CONTINUES BELOW =====

/* ============================================================================
 * PART 2 OF 2 — GAMEPLAY, TUTORIAL, STATIONS, CRISIS, DEPARTURE, ENDINGS, MISSION LOG, REPLAY, UI
 *
 * Appended directly after Part 1. Uses ONLY Part 1's imports, types, helpers and components. No new imports.
 * Honest notes:
 *  - All percentages, thresholds, Sol labels, the 10:00 countdown and the four endings are GAME SIMULATION values.
 *  - NASA text is taken verbatim from Part 1's SCIENCE library (entries flagged verified:false are shown with that warning).
 *  - Saves are written at the START of each mission interval (and at the ending), so a reload can never double-apply an action.
 *  - Level 3's save key is only ever READ (readLevel3). It is never written or deleted here.
 * ========================================================================== */

/* ---- SECTION I — local types and constants ---- */
type L4Panel = "none" | "pause" | "help" | "map" | "library";
type L4Debrief = { kind: "act" | "crisis"; title: string; note: string; before: Res; after: Res; sci: Sci[] };
type L4Practice = { phase: "read" | "choose" | "done"; pick: Act | null; before: Res | null; after: Res | null };
type L4Req = { label: string; have: number; need: number; atMost?: boolean };

const TUT_MOVE: ReadonlySet<TutorialStep> = new Set<TutorialStep>(["look", "move", "run", "approach", "interact", "habitat"]);
const rd = (n: number) => Math.round(n);

const SPOT_ICON: Record<SpotId, string> = { door: "🚪", hydro: "🌱", water: "💧", rocket: "🚀", solar: "☀️", shelter: "🛡️", console: "🖥️", rack: "🧪", exit: "🚪" };
const RES_LABEL: Record<keyof Res, string> = {
  food: "Food", water: "Water", power: "Power", life: "Life support", shield: "Shelter protection", rocket: "Rocket readiness",
  crops: "Crop growth", recycle: "Recycling", dust: "Panel dust", exposure: "Radiation risk",
};
/** Meters where a HIGHER number is WORSE. */
const BAD_HIGH: ReadonlySet<keyof Res> = new Set<keyof Res>(["dust", "exposure"]);
const HUD_ROWS: { k: keyof Res; label: string; icon: string; tip: string }[] = [
  { k: "food", label: "Food", icon: "🌱", tip: "Your food reserve. It shrinks every interval. Hydroponics refills it." },
  { k: "water", label: "Water", icon: "💧", tip: "Your water reserve. It shrinks every interval. Water recovery refills it." },
  { k: "power", label: "Power", icon: "⚡", tip: "Battery power. Most jobs spend power. Solar panels recharge it, but dust slows them down." },
  { k: "life", label: "Life support", icon: "🫁", tip: "Keeps cabin air safe. It slowly drops. A life-support check restores it." },
  { k: "shield", label: "Shelter", icon: "🛡️", tip: "Radiation-shelter protection. Higher is safer." },
  { k: "rocket", label: "Rocket", icon: "🚀", tip: "How ready the return rocket is. It only improves when you work in the Rocket Bay." },
];
const FUTURE: Record<Act, string> = {
  hydro: "Crops keep growing, so food drains a little more slowly in every later interval.",
  water: "Better recycling means less water is lost in every later interval.",
  rocket: "Moves the return vehicle closer to ready. It does not fix food, water or life support.",
  habitat: "Life support drifts down a little each interval, so this keeps the cabin safe for the rest of the mission.",
  shelter: "Higher shelter protection slows how fast radiation risk grows. It matters most during the solar event.",
  solar: "Cleaning the panels lowers dust, so power recovers faster. Dust episodes later in the mission cut power.",
  contingency: "Modest gains to shelter, rocket and life support at a high power cost. Only available after a finished run.",
};
const POSTURES: { id: Posture; icon: string; title: string; body: string }[] = [
  { id: "storm_shelter", icon: "🛡️", title: "SHELTER FIRST", body: "Move to the shelter and pause rocket work. Safest for the crew. The return vehicle falls a little behind." },
  { id: "storm_essential", icon: "⚖️", title: "ESSENTIAL SYSTEMS ONLY", body: "Keep only life support and critical power running. A cautious middle path with small gains everywhere." },
  { id: "storm_limited", icon: "🚀", title: "PUSH THE ROCKET", body: "Keep working on the return vehicle with limited protection. Faster rocket progress, much higher radiation risk." },
];
const POSTURE_LABEL: Record<Posture, string> = { storm_shelter: "Shelter first", storm_essential: "Essential systems only", storm_limited: "Push the rocket" };
const STATION_LIST: { name: string; icon: string; spot: SpotId; note: string }[] = [
  { name: "Living Habitat", icon: "🏠", spot: "console", note: "Enter the airlock, then use the life-support console." },
  { name: "Hydroponics", icon: "🌱", spot: "hydro", note: "Grow food. Uses power." },
  { name: "Water Recycler", icon: "💧", spot: "water", note: "Recover water. Uses power." },
  { name: "Radiation Shelter", icon: "🛡️", spot: "shelter", note: "Improve protection. Uses power." },
  { name: "Solar Power Station", icon: "☀️", spot: "solar", note: "Clean panels and recharge." },
  { name: "Return Rocket Bay", icon: "🚀", spot: "rocket", note: "Prepare the return vehicle. Uses power." },
];
const LIB_GROUPS: { name: string; ids: string[] }[] = [
  { name: "Life support (ECLSS)", ids: ["eclss98", "eclss90", "eclss-air"] },
  { name: "Radiation (Curiosity RAD)", ids: ["rad-gcr", "rad-types", "rad-data"] },
  { name: "Weather and dust (MEDA)", ids: ["meda", "dust-power"] },
  { name: "Crew health", ids: ["std3001", "diet"] },
  { name: "Plant research", ids: ["plants"] },
  { name: "Mars return and suits", ids: ["window", "suit"] },
  { name: "Game rules (fictional)", ids: ["game"] },
];

/* ---- pure helpers ---- */
function deltaList(a: Res, b: Res) {
  return (Object.keys(RES_LABEL) as (keyof Res)[]).map(k => ({ k, d: b[k] - a[k] })).filter(x => Math.abs(x.d) >= 0.5);
}
function deltaText(a: Res, b: Res) {
  const main: (keyof Res)[] = ["food", "water", "power", "life", "shield", "rocket", "exposure"];
  const t = deltaList(a, b).filter(x => main.includes(x.k)).map(x => `${RES_LABEL[x.k]} ${x.d > 0 ? "+" : "−"}${Math.abs(rd(x.d))}`).join(", ");
  return t ? `Changes: ${t}.` : "";
}
function reqsFor(r: Res, tier: "success" | "partial" | "compromised"): L4Req[] {
  const s = OUTCOME_RULES.success, p = OUTCOME_RULES.partial, c = OUTCOME_RULES.compromised;
  if (tier === "success") return [
    { label: "Rocket readiness", have: r.rocket, need: s.rocket }, { label: "Shelter protection", have: r.shield, need: s.shield },
    { label: "Life support", have: r.life, need: s.life }, { label: "Food", have: r.food, need: s.food }, { label: "Water", have: r.water, need: s.water },
    { label: "Power", have: r.power, need: s.power }, { label: "Radiation risk", have: r.exposure, need: s.exposure, atMost: true },
  ];
  const t = tier === "partial" ? p : c;
  return [{ label: "Rocket readiness", have: r.rocket, need: t.rocket }, { label: "Food", have: r.food, need: t.food }, { label: "Water", have: r.water, need: t.water }, { label: "Power", have: r.power, need: t.power }];
}
const reqMet = (q: L4Req) => (q.atMost ? q.have <= q.need : q.have >= q.need);
function explainOutcome(o: Outcome, r: Res): { head: string; reqs: L4Req[] } {
  if (o === "success") return { head: "Every requirement for a full success was met at the checkpoint.", reqs: reqsFor(r, "success") };
  if (o === "partial") return { head: "The vehicle was ready to leave, but these full-success requirements were missed:", reqs: reqsFor(r, "success").filter(q => !reqMet(q)) };
  if (o === "compromised") return { head: "The vehicle missed the partial-return line, so the fictional standby support asset (Relay-2, held in reserve since mission start) had to assist. Missed:", reqs: reqsFor(r, "partial").filter(q => !reqMet(q)) };
  return { head: "The vehicle missed even the assisted-return line, so the checkpoint was missed. Missed:", reqs: reqsFor(r, "compromised").filter(q => !reqMet(q)) };
}
/** AURA's advice. A hint, never a requirement. */
function suggestAct(r: Res, day: number): { act: Act; why: string } {
  const left = TOTAL_DAYS - day + 1, need = Math.max(0, Math.ceil((OUTCOME_RULES.success.rocket + 3 - r.rocket) / 14));
  if (r.power < 24) return { act: "solar", why: "Battery power is getting low." };
  if (r.food < 22) return { act: "hydro", why: "Food reserve is getting low." };
  if (r.water < 22) return { act: "water", why: "Water reserve is getting low." };
  if (r.life < 40) return { act: "habitat", why: "Life-support reliability is low." };
  if (left <= need) return { act: "rocket", why: "The rocket needs every remaining interval to be ready." };
  if (r.dust > 55) return { act: "solar", why: "Dust on the panels is cutting your power." };
  if (r.shield < 66) return { act: "shelter", why: "Shelter protection is below a safe level." };
  if (r.power < 40) return { act: "solar", why: "Power is lower than ideal." };
  if (r.food < 40) return { act: "hydro", why: "Food is lower than ideal." };
  if (r.water < 40) return { act: "water", why: "Water is lower than ideal." };
  return { act: "rocket", why: "Basic systems are stable. Time to advance the return vehicle." };
}
const promptFor = (id: SpotId): string =>
  id === "door" ? "Enter the habitat airlock" : id === "exit" ? "Leave the habitat (suit up)" : id === "console" ? "Use the life-support console"
    : id === "rack" ? "Read the ECLSS rack" : `Use the ${SPOT_LABEL[id].toLowerCase()}`;
const fmtClock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Smoothly animates a displayed number toward `value`. Respects reduced motion. Cleans up its frame request. */
function useTween(value: number, reduced: boolean, ms = 650) {
  const [v, setV] = useState(value), cur = useRef(value);
  useEffect(() => {
    if (reduced || cur.current === value) { cur.current = value; setV(value); return; }
    const a = cur.current, b = value, t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / ms), e = k * k * (3 - 2 * k); cur.current = a + (b - a) * e; setV(cur.current); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, ms]);
  return v;
}

/* ---- SECTION J — stylesheet ---- */
const L4_CSS = `
.l4{--c:#59e3f0;--o:#ff9a4d;--ink:#e9f7fa;--dim:#9db9c3;position:relative;width:100%;height:100vh;height:100dvh;overflow:hidden;background:#070d14;color:var(--ink);font-family:Bahnschrift,"Segoe UI",system-ui,sans-serif;letter-spacing:.012em;user-select:none;-webkit-user-select:none}
.l4 *{box-sizing:border-box}.l4 button{font:inherit;cursor:pointer;color:inherit}.l4 button:disabled{opacity:.45;cursor:not-allowed}.l4 button:focus-visible,.l4 a:focus-visible{outline:3px solid #8df1ff;outline-offset:2px}
.l4-world{position:absolute;inset:0;z-index:0}.l4-vig{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,#020609a8 100%),linear-gradient(0deg,#02080bb0,transparent 26%)}
.l4-alertfx{position:absolute;inset:0;z-index:2;pointer-events:none;box-shadow:inset 0 0 140px #ff3b2e66;animation:l4pulse 1.6s ease-in-out infinite}
.l4-flash{position:absolute;inset:0;z-index:3;pointer-events:none;background:radial-gradient(circle,#7dffe244,transparent 65%);animation:l4flash .7s ease-out both}
.l4-top{position:absolute;z-index:6;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));display:flex;gap:10px;align-items:flex-start;justify-content:space-between;pointer-events:none}
.l4-top>*{pointer-events:auto}.l4-brand{display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:12px;background:#071a27b8;border:1px solid #a2dbe533;backdrop-filter:blur(10px)}
.l4-orb{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 30% 25%,#ffd6a2,#c86144 55%,#702b2e);box-shadow:0 0 18px #e26a3670}.l4-brand small{display:block;font-size:9px;letter-spacing:.18em;color:#89c3d0;font-weight:800}.l4-brand strong{font-size:15px;letter-spacing:.1em}
.l4-track{display:flex;gap:4px;align-items:center;padding:9px 13px;border-radius:12px;background:#071a27b8;border:1px solid #a2dbe522;backdrop-filter:blur(10px);font-size:10px;letter-spacing:.14em;color:#a8dbe6;font-weight:800}.l4-track i{width:12px;height:6px;border-radius:3px;background:#27475a}.l4-track i.done{background:#59e3f0}.l4-track i.cur{background:#ff9a4d;box-shadow:0 0 8px #ff9a4d}.l4-track span{margin-left:8px;white-space:nowrap}
.l4-tools{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.l4-btn,.l4-mini{border:1px solid #8cd5e052;background:#092330cc;border-radius:11px;padding:11px 16px;font-weight:800;letter-spacing:.07em;font-size:12px;backdrop-filter:blur(10px);transition:transform .15s,background .15s,border-color .15s;min-height:44px}
.l4-mini{padding:8px 12px;font-size:11px;min-height:40px}.l4-btn:hover:not(:disabled),.l4-mini:hover:not(:disabled){background:#145168e6;border-color:#90f5ef;transform:translateY(-1px)}.l4-primary{background:linear-gradient(120deg,#ee9450,#cf5a43)!important;border-color:#ffbd8e!important;color:#1b1010!important}
.l4-hud{position:absolute;z-index:5;left:max(12px,env(safe-area-inset-left));top:calc(max(10px,env(safe-area-inset-top)) + 64px);width:min(250px,40vw)}
.l4-panel{background:linear-gradient(135deg,#071b2de6,#071820c4);border:1px solid #7db6c433;border-radius:14px;box-shadow:0 14px 34px #04070b4d;backdrop-filter:blur(12px);padding:13px 14px}.l4-hudtitle{font-size:10px;letter-spacing:.16em;color:#9bdcea;font-weight:850;margin-bottom:6px}
.l4-meter{margin:7px 0;border-radius:8px}.l4-meter.hl{animation:l4hl 1.4s ease-in-out infinite}.l4-mrow{display:flex;justify-content:space-between;font-size:12px;color:#d3e6ec}.l4-mrow b{font-variant-numeric:tabular-nums}.l4-bar{height:5px;border-radius:9px;background:#244050;margin-top:4px;overflow:hidden}.l4-bar i{display:block;height:100%;background:linear-gradient(90deg,#327f9c,#91f2d7)}.l4-bar i.low{background:linear-gradient(90deg,#e58b50,#ff625e)}.l4-bar i.time{background:linear-gradient(90deg,#c9783d,#ffb26b)}
.l4-hudlive{position:absolute;z-index:5;inset:0;pointer-events:none}.l4-hudlive>*{pointer-events:auto}
.l4-obj{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:calc(max(12px,env(safe-area-inset-bottom)) + 4px);max-width:min(380px,56vw);display:flex;gap:12px;align-items:center;padding:12px 15px;border-radius:14px;background:#051924db;border:1px solid #80cbd74d;backdrop-filter:blur(10px)}
.l4-obj small{display:block;font-size:9px;letter-spacing:.18em;color:#89c3d0;font-weight:800}.l4-obj strong{display:block;font-size:14px;margin:2px 0}.l4-obj span.d{font-size:11px;color:#a8c4ce}.l4-arrow{font-size:22px;color:#59e3f0;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;border:1px solid #59e3f066;flex:none;transition:transform .15s}
.l4-prompt{position:absolute;left:50%;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 74px);transform:translateX(-50%);padding:10px 18px;border-radius:12px;background:#0b4a5ae8;border:1px solid #91f6e8;font-weight:850;letter-spacing:.07em;font-size:13px;text-align:center;max-width:90vw}
.l4-prompt kbd{display:inline-block;padding:2px 8px;margin-right:7px;border-radius:6px;background:#e9f7fa;color:#06222c;font-weight:900}
.l4-touch{position:absolute;inset:0;pointer-events:none}.l4-touch>*{pointer-events:auto}.l4-pad{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:calc(max(18px,env(safe-area-inset-bottom)) + 70px);width:128px;height:128px;border-radius:50%;background:#0a2a39a8;border:2px solid #59e3f066;touch-action:none;display:grid;place-items:center}.l4-pad i{width:50px;height:50px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#a8f6ff,#2a8da1);box-shadow:0 0 18px #59e3f088;pointer-events:none}
.l4-tbtn{position:absolute;right:max(18px,env(safe-area-inset-right));width:68px;height:68px;border-radius:50%;border:2px solid #ffbd8e99;background:#4a2412c4;font-weight:900;font-size:20px;touch-action:none}.l4-tbtn.e{bottom:calc(max(18px,env(safe-area-inset-bottom)) + 84px)}.l4-tbtn.run{bottom:calc(max(18px,env(safe-area-inset-bottom)) + 10px);width:58px;height:58px;font-size:11px;letter-spacing:.06em;border-color:#59e3f099;background:#0a2a39c4}
.l4-coach{position:absolute;z-index:7;left:50%;top:calc(max(10px,env(safe-area-inset-top)) + 66px);transform:translateX(-50%);width:min(560px,calc(100vw - 24px));padding:14px 18px;border-radius:15px;background:#07202ee8;border:1px solid #59e3f066;backdrop-filter:blur(12px);animation:l4rise .35s both}
.l4-coach small,.l4-kicker{display:block;font-size:10px;letter-spacing:.2em;color:#87dce9;font-weight:850}.l4-coach strong{display:block;font-size:17px;margin:4px 0}.l4-coach p{margin:0;color:#c3d9e0;font-size:13px;line-height:1.55}.l4-coach .row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:10px}
.l4-brief{position:absolute;z-index:6;left:50%;transform:translateX(-50%);top:calc(max(10px,env(safe-area-inset-top)) + 66px);width:min(620px,calc(100vw - 24px));padding:13px 16px;border-radius:14px;background:#07202eeb;border:1px solid #ff9a4d66;backdrop-filter:blur(12px);animation:l4rise .4s both}.l4-brief p{margin:5px 0;font-size:12.5px;line-height:1.55;color:#c8dde3}.l4-brief .ev{border-left:3px solid #ff9a4d;padding-left:10px;margin:8px 0}
.l4-overlay{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:calc(max(12px,env(safe-area-inset-top)) + 54px) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:linear-gradient(90deg,#050b11e6,#08131dc4 55%,#070d1580);overflow-y:auto}
.l4-overlay.lower{align-items:flex-end;justify-content:flex-start;background:linear-gradient(0deg,#02080bdd,#02080b55 55%,transparent)}.l4-overlay.side{justify-content:flex-end;background:linear-gradient(270deg,#050b11e8,#050b1166 70%,transparent)}.l4-overlay.panelz{z-index:30}.l4-overlay.danger{box-shadow:inset 0 0 120px #d8453540}
.l4-dialog{width:min(780px,100%);max-height:100%;overflow-y:auto;background:linear-gradient(145deg,#102638f7,#07131ff0);border:1px solid #9dcad45c;border-radius:20px;padding:clamp(18px,3vw,34px);box-shadow:0 20px 90px #000a;animation:l4rise .45s both}.l4-dialog.wide{width:min(1000px,100%)}.l4-overlay.side .l4-dialog{width:min(540px,100%)}
.l4-h1{font-size:clamp(34px,6.4vw,78px);line-height:.98;letter-spacing:-.045em;margin:10px 0 8px;font-weight:950}.l4-h1 em{font-style:normal;color:#f5a76d}.l4-h2{font-size:clamp(22px,3vw,36px);line-height:1.08;letter-spacing:-.03em;margin:8px 0 12px}.l4-sub{letter-spacing:.3em;font-size:clamp(11px,1.5vw,15px);font-weight:900;color:#ffb98a;margin:0 0 14px}
.l4-copy{color:#c3d6dd;line-height:1.65;font-size:clamp(13px,1.15vw,15.5px);margin:8px 0}.l4-quote{margin:14px 0;padding:13px 16px;border-left:3px solid #70d7e4;background:#163244a6;color:#d0f7f8;line-height:1.6;font-size:14px}.l4-quote.late{animation:l4rise .6s .9s both}.l4-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.l4-note,.l4-dim{color:#9bb0bb;font-size:11.5px;line-height:1.6}.l4-dim.warn{color:#ffc3a0}
.l4-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin:14px 0}.l4-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.l4-card{padding:14px;border:1px solid #80bcc34a;background:#12304393;border-radius:13px}.l4-card h3{font-size:12px;margin:0 0 6px;letter-spacing:.1em;color:#bdf3f8}.l4-card p{color:#b8d1d8;font-size:12px;line-height:1.55;margin:4px 0}.l4-card.sel{border-color:#85e4dc;background:#145063c4}.l4-card.warn{border-color:#ff9a4d88}
.l4-choice{display:flex;gap:11px;text-align:left;width:100%;padding:13px;border:1px solid #80bcc34a;background:#12304393;border-radius:13px}.l4-choice:hover{border-color:#90f5ef}.l4-choice.sel{border-color:#85e4dc;background:#145063c4}.l4-choice>span:first-child{font-size:24px}.l4-choice strong{display:block;font-size:13px;letter-spacing:.05em}.l4-choice small{display:block;font-size:11.5px;line-height:1.5;color:#a9c7d1;margin-top:4px}
.l4-delta{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0}.l4-delta td{padding:5px 4px;border-bottom:1px solid #9bc0c722}.l4-delta td:last-child{text-align:right;font-weight:850}.up{color:#8ff5c3}.dn{color:#ff9d86}
.l4-sci{margin:10px 0;padding:13px 15px;border:1px solid #7bc1d44d;border-radius:12px;background:#0d2c3ab0}.l4-sci h4{margin:6px 0 4px;font-size:14px}.l4-sci p{margin:5px 0;font-size:12.5px;line-height:1.6;color:#c0d6dd}.l4-sci a,.l4-dialog a{color:#9eeef5;text-underline-offset:3px}.l4-sci.k-game{border-color:#ff9a4d77;background:#2b1d1a99}.l4-badge{display:inline-block;padding:4px 9px;border-radius:99px;font-size:9.5px;letter-spacing:.1em;font-weight:900;color:#a4e6f2;background:#0d3845;border:1px solid #7bc1d459}.k-game .l4-badge{color:#ffcfa6;background:#3a2314;border-color:#ff9a4d88}
.l4-lib{display:grid;grid-template-columns:240px 1fr;gap:14px;margin-top:8px}.l4-libnav{max-height:56vh;overflow-y:auto;padding-right:4px}.l4-libnav h5{margin:12px 0 5px;font-size:10px;letter-spacing:.14em;color:#87dce9}.l4-libnav button{display:block;width:100%;text-align:left;padding:9px 10px;margin:3px 0;border:1px solid transparent;border-radius:9px;background:#0d2c3a99;font-size:12px}.l4-libnav button.sel{border-color:#85e4dc;background:#145063c4}
.l4-pips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.l4-log{max-height:230px;overflow-y:auto;margin-top:8px;padding-right:6px}.l4-logrow{padding:8px 0;border-bottom:1px solid #9bc0c725;font-size:12px;line-height:1.55;color:#bcd7dc}.l4-logrow b{color:#e2fafc}
.l4-counter{font-size:clamp(54px,13vw,128px);font-weight:950;letter-spacing:-.03em;text-align:center;font-variant-numeric:tabular-nums;color:#f6c493;text-shadow:0 0 40px #c96e4b88}.l4-launch{position:absolute;z-index:20;left:0;right:0;bottom:max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 16px;text-align:center;pointer-events:none}.l4-launch>*{pointer-events:auto}
.l4-end.success h1{color:#a3f6d6}.l4-end.partial h1{color:#f8d29a}.l4-end.compromised h1{color:#ffb184}.l4-end.failed h1{color:#ffd4cc}
.l4-fade{position:absolute;inset:0;z-index:40;background:#02060a;opacity:0;pointer-events:none;transition:opacity .55s}.l4-fade.on{opacity:1;pointer-events:all}
.l4-toast{position:absolute;z-index:50;left:50%;top:46%;transform:translate(-50%,-50%);padding:10px 18px;border-radius:12px;border:1px solid #8de1dca6;background:#053340ea;color:#d5fffb;font-weight:800;font-size:13px;letter-spacing:.05em;pointer-events:none;max-width:90vw;text-align:center;animation:l4rise .3s both}
.l4-map{display:grid;grid-template-columns:minmax(0,340px) 1fr;gap:16px;align-items:start}.l4-map svg{width:100%;height:auto;background:#07202e;border:1px solid #59e3f044;border-radius:14px}.l4-st{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:9px 11px;margin:6px 0;border:1px solid #80bcc33a;border-radius:11px;background:#12304380;font-size:12.5px}.l4-st.sel{border-color:#ff9a4d}
.l4 input[type=range]{width:100%}.l4 label.row{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 0;font-size:13px}
@keyframes l4rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}.l4-coach,.l4-prompt{animation-name:l4fadein}@keyframes l4fadein{from{opacity:0}to{opacity:1}}
@keyframes l4pulse{0%,100%{opacity:.45}50%{opacity:1}}@keyframes l4flash{from{opacity:1}to{opacity:0}}@keyframes l4hl{0%,100%{background:transparent}50%{background:#59e3f02e}}

/* Story finale — full-width cinematic storyboards, original CSS visuals */
.l4-cockpit{position:absolute;inset:0;z-index:16;overflow:hidden;background:linear-gradient(180deg,#0b233b 0%,#391d29 48%,#080d19 90%);pointer-events:none}
.l4-cockpit-glass{position:absolute;inset:5% 9% 17%;overflow:hidden;border:clamp(8px,2.5vw,26px) solid #101e2d;border-radius:46% 46% 14% 14% / 33% 33% 12% 12%;box-shadow:inset 0 0 80px #050812,0 0 0 3px #6b88965a;background:linear-gradient(180deg,#241e38,#bb6e53 65%,#6c352b)}
.l4-cockpit-sky{position:absolute;inset:0;background:radial-gradient(circle at 79% 20%,#fff0c1 0%,#ffc485 3%,transparent 21%),linear-gradient(#352741,#ce7852)}
.l4-cockpit-horizon{position:absolute;bottom:-13%;left:-15%;width:130%;height:48%;border-radius:47% 46% 0 0;background:repeating-linear-gradient(160deg,transparent 0 18px,#73362724 18px 24px),linear-gradient(#a55a3d,#492921);box-shadow:0 -20px 90px #ffb88677}
.l4-cockpit-readout{position:absolute;left:5%;top:8%;display:flex;flex-direction:column;gap:9px;color:#abe5ef;font:700 clamp(9px,1.2vw,14px)/1.3 monospace;letter-spacing:.13em;text-shadow:0 0 12px #40b9c8}.l4-cockpit-readout span{color:#ffc59b}
.l4-cockpit-reticle{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);width:100px;height:100px;border:1px solid #8deafa77;border-radius:50%;opacity:.85}.l4-cockpit-reticle:before,.l4-cockpit-reticle:after{content:"";position:absolute;background:#b5ffff88}.l4-cockpit-reticle:before{height:1px;width:140px;left:-20px;top:50%}.l4-cockpit-reticle:after{width:1px;height:140px;top:-20px;left:50%}
.l4-cockpit-frame{position:absolute;top:0;bottom:0;left:48%;width:5%;background:linear-gradient(90deg,#101d28,#384c5c,#172330);transform:skewX(-2deg);opacity:.76;box-shadow:0 0 30px #09121d}
.l4-cockpit-pilot{position:absolute;bottom:11%;left:clamp(20px,12vw,220px);width:clamp(85px,13vw,170px);height:clamp(155px,24vw,300px);filter:drop-shadow(0 14px 13px #030b10);transform:rotate(-6deg)}
.l4-cockpit-helmet{position:absolute;top:0;left:22%;width:58%;aspect-ratio:1;border-radius:47%;background:linear-gradient(135deg,#f0f3f2,#aabdc8 57%,#657b89);border:5px solid #e4ecf0;box-shadow:0 0 0 3px #394d60}.l4-cockpit-visor{position:absolute;inset:22% 10% 13%;border-radius:40%;background:radial-gradient(circle at 30% 25%,#e7cc9c66,transparent 45%),linear-gradient(130deg,#163754,#020b19 70%);border:3px solid #c9dcda;box-shadow:inset 0 0 16px #58c8ce55}
.l4-cockpit-suit{position:absolute;left:0;right:0;top:34%;bottom:0;border-radius:40% 40% 9% 9%;background:linear-gradient(90deg,#9aaeb7,#ecf1ee 32%,#dbe2e3 68%,#8297a0);border:4px solid #79909d}.l4-cockpit-suit span{position:absolute;top:30%;left:40%;font-size:19px;font-weight:900;color:#245b70;background:#d6eff0;padding:2px 5px;border-radius:5px}
.l4-cockpit-console{position:absolute;bottom:-3%;left:7%;width:86%;height:21%;display:flex;align-items:flex-start;justify-content:space-around;padding:14px;border:8px solid #182a3d;border-radius:42% 42% 0 0 / 48% 48% 0 0;background:linear-gradient(160deg,#1c3447,#06111e);color:#9bf3eb;box-shadow:0 -8px 20px #030c14}.l4-cockpit-console>div:not(.l4-cockpit-dots){display:flex;flex-direction:column;align-items:center;gap:1px;font-weight:800}.l4-cockpit-console small,.l4-cockpit-console span{font-size:clamp(7px,.8vw,10px);letter-spacing:.08em}.l4-cockpit-console b{font-size:clamp(18px,3vw,36px)}.l4-cockpit-dots{font-size:clamp(14px,2vw,28px);color:#ffbc74;letter-spacing:.24em;white-space:nowrap}.l4-cockpit-credit{position:absolute;right:14px;bottom:8px;font-size:9px;color:#a7c7d5;letter-spacing:.13em}
.l4-launch{left:50%;right:auto;width:min(520px,90%);transform:translateX(-50%);bottom:clamp(19%,24vh,31%);padding:14px 12px;border-radius:14px;background:#061728df;border:1px solid #6dc8d677;box-shadow:0 12px 50px #01060f;backdrop-filter:blur(9px)}.l4-launch .l4-counter{font-size:clamp(44px,8vw,91px);line-height:1.04}.l4-launch .l4-copy{margin:0;text-align:center}
.l4-film{position:absolute;inset:0;z-index:24;background:#020610;color:#f5fcff;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,.9fr);overflow:auto}
.l4-film-art{position:relative;min-height:100vh;overflow:hidden;background:radial-gradient(ellipse at 45% 25%,#143d5a,#090e20 49%,#020612 100%)}
.l4-film-stars{position:absolute;inset:0;opacity:.8;background-image:radial-gradient(1px 1px at 11% 21%,#fff 96%,transparent),radial-gradient(1.5px 1.5px at 43% 12%,#bffcff 96%,transparent),radial-gradient(1px 1px at 76% 64%,#fff 96%,transparent),radial-gradient(2px 2px at 89% 32%,#fff 96%,transparent),radial-gradient(1.5px 1.5px at 14% 81%,#fff 96%,transparent),radial-gradient(1px 1px at 53% 43%,#b2defc 96%,transparent);background-size:227px 199px;animation:l4starDrift 27s linear infinite}
.l4-film-planet{position:absolute;width:min(55vw,500px);aspect-ratio:1;left:14%;top:12%;border-radius:50%;filter:drop-shadow(0 0 70px #a7694b25);box-shadow:inset -50px -30px 80px #06101fd8,0 0 130px #af684739;background:radial-gradient(ellipse at 25% 25%,#efbe82,#aa593e 44%,#472532 80%,#160f20);animation:l4planetFloat 12s ease-in-out infinite}
.l4-film-planet:before{content:"";position:absolute;inset:14%;border-radius:50%;opacity:.65;background:repeating-linear-gradient(27deg,transparent 0 30px,#bd775b80 31px 35px,transparent 36px 60px)}
.l4-film-planet.is-earth{background:radial-gradient(ellipse at 25% 22%,#c3ecfa,#58bbdc 35%,#166aab 54%,#07346e 81%,#06142c 100%);box-shadow:inset -70px -30px 100px #010a25d7,0 0 75px #41b1e777;filter:none}.l4-film-planet.is-earth:before{inset:18%;opacity:.85;background:radial-gradient(ellipse at 22% 30%,#8fcb86 0%,#2f945f 27%,transparent 35%),radial-gradient(ellipse at 58% 52%,#9ed48e 0%,#428a53 26%,transparent 32%),radial-gradient(ellipse at 84% 12%,#e3f1ff 0%,transparent 28%)}
.l4-film-ship{position:absolute;left:20%;bottom:19%;width:180px;height:55px;transform:rotate(-25deg);animation:l4shipFly 11s ease-in-out infinite;filter:drop-shadow(0 0 20px #76d9ff66)}.l4-film-ship:before{content:"";position:absolute;left:-42px;top:20px;width:70px;height:16px;border-radius:60% 20% 20% 60%;background:linear-gradient(90deg,#e4ae60aa,transparent);filter:blur(8px)}.l4-film-ship i{position:absolute;inset:8px 5px 8px 22px;background:linear-gradient(#f9f7ec,#a3baca 65%,#506d8c);clip-path:polygon(0 48%,13% 15%,74% 15%,100% 50%,74% 85%,13% 85%);border-radius:40%}.l4-film-ship span{position:absolute;top:17px;left:85px;color:#223a55;font-size:11px;font-weight:950}
.l4-film-relay{position:absolute;right:10%;bottom:28%;width:130px;height:54px;background:linear-gradient(120deg,#e8f8f6,#90b5c2);clip-path:polygon(0 50%,24% 10%,65% 11%,100% 50%,65% 90%,24% 90%);animation:l4relayFly 7s ease-in-out infinite;filter:drop-shadow(0 0 15px #80f9e6)}.l4-film-relay:after{content:"";position:absolute;top:21px;left:20%;right:25%;height:10px;background:#2784a1}.l4-film-relay span{position:absolute;left:25px;top:15px;font-size:8px;color:#144766;font-weight:950}
.l4-film-habitat{position:absolute;left:13%;bottom:11%;width:74%;height:40%;border-radius:60% 60% 16% 16%;background:linear-gradient(135deg,#e1d8cc,#a3aab3 60%,#364659);border:14px solid #667887;box-shadow:0 14px 70px #0009,0 0 80px #f0b17155}.l4-film-habitat i{position:absolute;left:42%;bottom:0;width:19%;height:67%;background:linear-gradient(#1c6075,#0a1d33);border:9px solid #9db4bd;border-radius:15px 15px 0 0;box-shadow:0 0 17px #8af1ed}.l4-film-habitat span{position:absolute;top:20%;left:15%;color:#1b3d51;font-size:clamp(10px,1.4vw,16px);letter-spacing:.15em;font-weight:900}
.l4-film-crew{position:absolute;left:9%;bottom:8%;display:flex;align-items:flex-end;gap:clamp(9px,2vw,28px)}.l4-film-crew span{position:relative;width:clamp(29px,6vw,71px);height:clamp(100px,17vw,180px);border-radius:40% 40% 17% 17%;background:linear-gradient(90deg,#173f52,#3387a1 58%,#13263b);animation:l4clap .7s ease-in-out infinite alternate;box-shadow:0 0 20px #59ccdc22}.l4-film-crew span:before{content:"";position:absolute;left:25%;top:-33px;width:50%;height:49px;border-radius:50%;background:linear-gradient(#eec49a,#be886f)}.l4-film-crew span:after{content:"";position:absolute;left:-18%;top:18%;width:130%;height:36%;border-left:9px solid #3b91ad;border-right:9px solid #3b91ad;transform:rotate(-10deg);border-radius:28%}
.l4-film-health{position:absolute;bottom:18%;left:12%;width:75%;min-height:120px;border-radius:16px;border:2px solid #79c6db8c;padding:22px;background:linear-gradient(130deg,#0c3c53b8,#081424e6);box-shadow:0 0 70px #67cbe577}.l4-film-health span{display:block;color:#ccfaff;font-size:clamp(11px,1.8vw,20px);font-weight:900;letter-spacing:.15em}.l4-film-health i{display:inline-block;width:25%;height:8px;background:#8addd4;border-radius:9px;margin:22px 5px 0 0;animation:l4pulse 1.4s infinite alternate}
.l4-film-scan{position:absolute;top:25px;left:24px;border:1px solid #81d7e377;padding:9px 13px;border-radius:8px;background:#031a29bf;color:#beecf9;font-size:clamp(9px,1vw,13px);font-weight:800;letter-spacing:.17em}
.l4-film-welcome .l4-film-art{background:linear-gradient(180deg,#447ba8,#eec89c 61%,#668477)}.l4-film-welcome .l4-film-planet{left:60%;top:-23%;width:400px;opacity:.23}.l4-film-welcome .l4-film-stars{display:none}.l4-film-welcome .l4-film-scan{color:#d3fff0;background:#093a4c}
.l4-film-mars .l4-film-art,.l4-film-habitat .l4-film-art{background:linear-gradient(180deg,#42304c 0%,#ac664d 61%,#482f2b 100%)}
.l4-film-narrative{position:relative;display:flex;justify-content:center;flex-direction:column;gap:12px;padding:clamp(25px,5vw,72px);background:linear-gradient(145deg,#0c1c30,#070d19);border-left:1px solid #83dbef33}
.l4-film-index{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:11px;letter-spacing:.16em;font-weight:900;color:#99dfe8}.l4-film-index span:last-child{color:#ffbf8d}
.l4-film-narrative h2{font-weight:950;font-size:clamp(32px,4.5vw,68px);line-height:1;letter-spacing:-.045em;margin:20px 0 6px}.l4-film-narrative p{line-height:1.7;color:#c9e1e8;font-size:clamp(13px,1.2vw,17px);margin:0}.l4-film-narrative blockquote{border-left:3px solid #62d9e6;padding:13px 17px;margin:8px 0;background:#13344980;color:#c5f1f6;line-height:1.6;font-size:clamp(13px,1.15vw,16px)}.l4-film-narrative blockquote b{display:block;font-size:11px;letter-spacing:.17em;color:#7df0df;margin-bottom:5px}
.l4-film-pips{display:flex;gap:7px;margin-top:8px}.l4-film-pips i{height:4px;flex:1;border-radius:6px;background:#345061}.l4-film-pips i.active{background:#6ce3df;box-shadow:0 0 13px #5ad6ec88}.l4-film-actions{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0 0}.l4-film-footnote{font-size:11px!important;color:#91b5c6!important}
.l4-evidence{margin:15px 0}.l4-evidence p{line-height:1.65}
@keyframes l4starDrift{to{background-position:120px 60px}}@keyframes l4planetFloat{50%{transform:translateY(14px) rotate(2deg)}}@keyframes l4shipFly{50%{transform:translate(24px,-24px) rotate(-24deg)}}@keyframes l4relayFly{50%{transform:translate(-13px,-20px)}}@keyframes l4clap{to{transform:translateY(4px)}}
@media(max-width:820px){.l4-film{grid-template-columns:1fr;grid-template-rows:minmax(240px,42vh) auto}.l4-film-art{min-height:240px}.l4-film-narrative{padding:26px 19px 40px}.l4-film-narrative h2{margin:6px 0}.l4-film-planet{width:330px;top:-9%;left:22%}.l4-film-crew{bottom:3%}.l4-film-habitat{bottom:0;height:63%}.l4-film-ship{bottom:10%}.l4-film-relay{bottom:22%}.l4-launch{bottom:clamp(13%,21vh,25%)}.l4-cockpit-pilot{left:7%;bottom:14%}}
@media(max-width:500px){.l4-cockpit-glass{inset:5% 3% 14%;border-width:10px}.l4-cockpit-readout{top:6%;left:5%}.l4-cockpit-pilot{left:4%;bottom:13%}.l4-cockpit-console{left:3%;width:94%;height:18%;padding:8px}.l4-cockpit-dots{display:none}.l4-launch{width:94%;bottom:24%;padding:7px}.l4-film-narrative h2{font-size:clamp(30px,8vw,48px)}}
@media(max-width:900px){.l4-track{display:none}.l4-lib,.l4-map{grid-template-columns:1fr}.l4-libnav{max-height:150px}.l4-grid.three{grid-template-columns:1fr 1fr}}
@media(max-width:620px){.l4-brand small{display:none}.l4-brand strong{font-size:12px}.l4-mini{padding:6px 9px;font-size:10px;min-height:36px}.l4-hud{width:150px;top:calc(max(10px,env(safe-area-inset-top)) + 54px)}.l4-panel{padding:8px 10px}.l4-mrow{font-size:10.5px}.l4-grid,.l4-grid.three{grid-template-columns:1fr}.l4-overlay.side{align-items:flex-end}.l4-obj{max-width:calc(100vw - 24px);bottom:auto;top:calc(max(10px,env(safe-area-inset-top)) + 54px);left:auto;right:12px;width:170px;padding:8px 10px}.l4-obj strong{font-size:11px}.l4-coach,.l4-brief{top:auto;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 160px)}.l4-pad{width:112px;height:112px;bottom:calc(max(18px,env(safe-area-inset-bottom)) + 12px)}.l4-tbtn.e{bottom:calc(max(18px,env(safe-area-inset-bottom)) + 78px)}.l4-tbtn.run{bottom:calc(max(18px,env(safe-area-inset-bottom)) + 8px)}.l4-prompt{bottom:calc(max(12px,env(safe-area-inset-bottom)) + 140px);font-size:12px}}
@media(prefers-reduced-motion:reduce){.l4 *{animation:none!important;transition:none!important}}
/* Rocket approach, short auto-boarding sequence and full-screen responsive MP4 */
.l4-departure-hud{position:absolute;z-index:8;right:max(12px,env(safe-area-inset-right));bottom:calc(max(12px,env(safe-area-inset-bottom)) + 12px);width:min(370px,calc(100% - 24px));padding:16px 18px;border-radius:16px;border:1px solid #84e2ec8a;background:#061b2ce8;box-shadow:0 12px 42px #0009;backdrop-filter:blur(12px)}
.l4-departure-hud .l4-departure-clock{font-size:clamp(28px,5vw,46px);font-weight:950;color:#ffbe7c;letter-spacing:.08em;font-variant-numeric:tabular-nums;line-height:1.1;margin:6px 0}
.l4-departure-hud strong{font-size:12px;letter-spacing:.11em}.l4-departure-hud p{font-size:12px;color:#cfeaf0;line-height:1.6;margin:6px 0}.l4-departure-hud small{font-size:10px;color:#95bbc8;line-height:1.5;display:block}
.l4-departure-hud kbd{background:#f2f7f9;border-radius:4px;color:#052533;padding:1px 5px;font-weight:900}
.l4-board-overlay{position:absolute;z-index:23;left:50%;bottom:8%;transform:translateX(-50%);width:min(530px,calc(100% - 24px));padding:19px 24px;background:#071927e8;border:1px solid #8be0e477;border-radius:18px;text-align:center;box-shadow:0 18px 48px #0009;backdrop-filter:blur(10px)}
.l4-board-overlay h2{margin:6px 0;font-size:clamp(20px,4vw,35px)}.l4-board-overlay p{color:#c8e5e7;font-size:13px;line-height:1.6}
.l4-board-progress{height:5px;background:#254658;border-radius:6px;overflow:hidden}.l4-board-progress i{display:block;width:100%;height:100%;transform-origin:left;background:linear-gradient(90deg,#48afd9,#7ef1d9);animation:l4Board 1.7s linear forwards}
@keyframes l4Board{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.l4-video-overlay{position:absolute;inset:0;z-index:100;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}
.l4-video-player{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;background:#000}
.l4-video-caption{position:absolute;left:max(14px,env(safe-area-inset-left));top:max(14px,env(safe-area-inset-top));max-width:calc(100% - 28px);color:#e6fafd;text-shadow:0 2px 9px #000;pointer-events:none;display:flex;flex-direction:column;gap:4px}
.l4-video-caption small{font-size:10px;letter-spacing:.18em;font-weight:850}.l4-video-caption span{font-size:12px;letter-spacing:.08em}
.l4-video-skip{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:103;border:1px solid #7ddde3aa;border-radius:12px;background:#051726e0;color:#efffff;padding:12px 16px;font-weight:850;min-height:44px;backdrop-filter:blur(10px)}
.l4-video-message{position:absolute;z-index:102;width:min(500px,calc(100% - 24px));padding:24px;text-align:center;background:#071c2af5;border:1px solid #7fe1e3;border-radius:18px;box-shadow:0 10px 50px #000b}
.l4-video-message strong{display:block;font-size:21px;margin-bottom:8px}.l4-video-message p{font-size:13px;color:#b4d7df;line-height:1.5;overflow-wrap:anywhere}.l4-video-message button{margin-top:15px}
@media(max-width:620px){.l4-departure-hud{left:50%;right:auto;transform:translateX(-50%);bottom:calc(max(18px,env(safe-area-inset-bottom)) + 142px);width:min(300px,calc(100% - 24px));padding:10px 13px}.l4-departure-hud p{font-size:11px}.l4-departure-hud small{display:none}.l4-video-caption span{font-size:10px}.l4-video-skip{font-size:11px;padding:10px 12px}.l4-board-overlay{bottom:18%}}
`;

/* ---- SECTION K — small UI components ---- */
function UiMeter({ label, icon, value, bad, hl, tip }: { label: string; icon: string; value: number; bad?: boolean; hl?: boolean; tip?: string }) {
  const reduced = useReducedMotion(), v = useTween(value, reduced), low = bad ? v > 70 : v < 25;
  return <div className={`l4-meter${hl ? " hl" : ""}`} title={tip}>
    <div className="l4-mrow"><span>{icon} {label}</span><b>{rd(v)}%</b></div>
    <div className="l4-bar"><i className={low ? "low" : ""} style={{ width: `${clamp(v)}%`, transition: reduced ? "none" : "width .1s linear" }} /></div>
  </div>;
}
function UiHud({ res, day, hl, label }: { res: Res; day: number; hl: boolean; label: string }) {
  return <aside className="l4-hud" aria-label="Mission resources"><div className="l4-panel">
    <div className="l4-hudtitle">{label}</div>
    {HUD_ROWS.map(r => <UiMeter key={r.k} label={r.label} icon={r.icon} value={res[r.k]} hl={hl} tip={r.tip} />)}
    <UiMeter label="Radiation risk" icon="☢️" value={res.exposure} bad hl={hl} tip="Game score for radiation exposure risk. Lower is safer. It is not a NASA dose reading." />
    <div className={`l4-meter${hl ? " hl" : ""}`} title="Each interval is a time-lapse of many sols.">
      <div className="l4-mrow"><span>⏱ Mission time</span><b>{Math.min(day, TOTAL_DAYS)}/{TOTAL_DAYS}</b></div>
      <div className="l4-bar"><i className="time" style={{ width: `${(Math.min(day, TOTAL_DAYS) / TOTAL_DAYS) * 100}%` }} /></div>
    </div>
  </div></aside>;
}
function UiDialog({ kicker, title, children, wide, cls }: { kicker: string; title?: string; children: ReactNode; wide?: boolean; cls?: string }) {
  return <div className={`l4-overlay${cls ? " " + cls : ""}`} role="dialog" aria-modal="true" aria-label={title ?? kicker}>
    <section className={`l4-dialog${wide ? " wide" : ""}`}><div className="l4-kicker">{kicker}</div>{title && <h2 className="l4-h2">{title}</h2>}{children}</section>
  </div>;
}
function UiSci({ s }: { s: Sci }) {
  return <div className={`l4-sci k-${s.kind}`}>
    <span className="l4-badge">{KIND_LABEL[s.kind]}</span>
    <h4>{s.topic}</h4><p>{s.text}</p>
    {s.unit && <p className="l4-dim">Unit: {s.unit}</p>}
    <p className="l4-dim">Source: {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.source}</a> : s.source}</p>
    {!s.verified && <p className="l4-dim warn">This entry was not re-checked in this build. Confirm the details at the source link.</p>}
  </div>;
}
function UiDelta({ before, after }: { before: Res; after: Res }) {
  const rows = deltaList(before, after);
  if (!rows.length) return <p className="l4-dim">No meters changed.</p>;
  return <table className="l4-delta"><tbody>{rows.map(r => {
    const good = BAD_HIGH.has(r.k) ? r.d < 0 : r.d > 0;
    return <tr key={r.k}><td>{RES_LABEL[r.k]}</td><td>{rd(before[r.k])}% → {rd(after[r.k])}%</td><td className={good ? "up" : "dn"}>{r.d > 0 ? "+" : "−"}{Math.abs(rd(r.d))}</td></tr>;
  })}</tbody></table>;
}
function UiCarry({ save }: { save: Save }) {
  const a = save.allocation, s = initialRes(a);
  return <div className={`l4-card${save.carried ? "" : " warn"}`}>
    <h3>YOUR PREVIOUS DECISIONS MATTER</h3>
    {save.carried
      ? <p>Your completed Level 3 allocation was loaded. It sets your starting values below.</p>
      : <p><b>Balanced demo setup.</b> No completed Level 3 allocation was found, so this run starts from an even 25 / 25 / 25 / 25 plan. Nothing from Level 3 was loaded.</p>}
    <table className="l4-delta"><tbody>
      <tr><td>Supplies ({a.supplies})</td><td>Starting food {rd(s.food)}% · water {rd(s.water)}%</td></tr>
      <tr><td>Shielding ({a.shielding})</td><td>Shelter {rd(s.shield)}% · radiation risk {rd(s.exposure)}%</td></tr>
      <tr><td>Energy ({a.power})</td><td>Starting power {rd(s.power)}%</td></tr>
      <tr><td>Equipment condition ({a.stability})</td><td>Life support {rd(s.life)}% · rocket {rd(s.rocket)}%</td></tr>
    </tbody></table>
    <p className="l4-dim">Equipment condition uses Level 3's stability points. These are game scores, not NASA values.</p>
  </div>;
}
function UiTouchPad({ sh }: { sh: R<Shared> }) {
  const [k, setK] = useState({ x: 0, y: 0 }), on = useRef(false);
  const upd = (el: HTMLDivElement, cx: number, cy: number) => {
    const b = el.getBoundingClientRect(), r = b.width / 2, dx = cx - (b.left + r), dy = cy - (b.top + r), m = Math.hypot(dx, dy);
    if (m < 4) { setJoystick(sh, 0, 0); setK({ x: 0, y: 0 }); return; }
    const f = Math.min(1, m / (r * 0.85)), x = (dx / m) * f, y = (-dy / m) * f;
    setJoystick(sh, x, y); setK({ x, y });
  };
  const end = () => { on.current = false; setJoystick(sh, 0, 0); setK({ x: 0, y: 0 }); };
  useEffect(() => () => setJoystick(sh, 0, 0), [sh]);
  return <div className="l4-pad" role="group" aria-label="Movement pad. Push fully to run."
    onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); on.current = true; upd(e.currentTarget, e.clientX, e.clientY); }}
    onPointerMove={e => { if (on.current) upd(e.currentTarget, e.clientX, e.clientY); }}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    <i style={{ transform: `translate(${k.x * 34}px,${-k.y * 34}px)` }} />
  </div>;
}
/** Per-frame-ish readouts (objective distance, arrow, nearby prompt, touch controls). Polls at ~8 Hz and cleans up its timer. */
function UiLive({ sh, touch, onInteract }: { sh: R<Shared>; touch: boolean; onInteract: () => void }) {
  type Snap = { near: SpotId | null; label: string; dist: number; ang: number; has: boolean };
  const [v, setV] = useState<Snap>({ near: null, label: "", dist: 0, ang: 0, has: false });
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = sh.current, o = s.objective;
      let next: Snap = { near: s.near, label: "", dist: 0, ang: 0, has: false };
      if (o) {
        const tx = o.x - s.pos.x, tz = o.z - s.pos.z, d = Math.hypot(tx, tz) || 1, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
        const ang = Math.atan2((tx * rx + tz * rz) / d, (tx * fx + tz * fz) / d) * 180 / Math.PI;
        next = { near: s.near, label: o.label, dist: Math.round(d), ang: Math.round(ang / 10) * 10, has: true };
      }
      setV(p => (p.near === next.near && p.label === next.label && p.dist === next.dist && p.ang === next.ang && p.has === next.has ? p : next));
    }, 120);
    return () => window.clearInterval(id);
  }, [sh]);
  return <div className="l4-hudlive">
    {v.has && <div className="l4-obj"><span className="l4-arrow" aria-hidden="true" style={{ transform: `rotate(${v.ang}deg)` }}>▲</span>
      <div><small>CURRENT OBJECTIVE</small><strong>{v.label}</strong><span className="d">{v.dist} m away</span></div></div>}
    {v.near && <div className="l4-prompt" role="status"><kbd>E</kbd>{promptFor(v.near)}</div>}
    {touch && <div className="l4-touch">
      <UiTouchPad sh={sh} />
      <button className="l4-tbtn e" aria-label="Interact" onClick={onInteract}>E</button>
      <button className="l4-tbtn run" aria-label="Hold to run" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setTouchKey(sh, "run", true); }}
        onPointerUp={() => setTouchKey(sh, "run", false)} onPointerCancel={() => setTouchKey(sh, "run", false)} onLostPointerCapture={() => setTouchKey(sh, "run", false)}>RUN</button>
    </div>}
  </div>;
}
function UiMap({ sh, target, onTarget, onClose }: { sh: R<Shared>; target: SpotId | null; onTarget: (s: SpotId) => void; onClose: () => void }) {
  const [p, setP] = useState<{ x: number; z: number; h: number; loc: Loc; ox: number; oz: number; hasO: boolean }>({ x: 0, z: 0, h: 0, loc: "outdoor", ox: 0, oz: 0, hasO: false });
  useEffect(() => {
    const id = window.setInterval(() => { const s = sh.current, o = s.objective; setP({ x: s.pos.x, z: s.pos.z, h: s.heading, loc: s.loc, ox: o?.x ?? 0, oz: o?.z ?? 0, hasO: !!o && o.loc === s.loc }); }, 200);
    return () => window.clearInterval(id);
  }, [sh]);
  const W = 320, indoor = p.loc === "indoor";
  const gx = (x: number) => (indoor ? ((x - (IN_X - 7.5)) / 15) * W : ((x + 36) / 72) * W);
  const gz = (z: number) => (indoor ? ((z + 6.5) / 14) * W : ((z + 36) / 72) * W);
  return <UiDialog kicker={`MAP · ${indoor ? "INSIDE THE HABITAT" : "MARS SURFACE"}`} title="Where to next?" wide cls="panelz">
    <div className="l4-map">
      <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label="Base map">
        {!indoor && <circle cx={W / 2} cy={W / 2} r={(34 / 72) * W} fill="#2a1a16" stroke="#59e3f044" strokeDasharray="4 4" />}
        {!indoor && <circle cx={gx(0)} cy={gz(0)} r={(4.7 / 72) * W} fill="#31505c" stroke="#8cd5e0" />}
        {SPOTS.filter(s => s.loc === p.loc).map(s => <g key={s.id}><circle cx={gx(s.x)} cy={gz(s.z)} r={13} fill="#0b3a4a" stroke={target === s.id ? "#ff9a4d" : "#59e3f0"} strokeWidth={target === s.id ? 3 : 1.5} />
          <text x={gx(s.x)} y={gz(s.z) + 5} textAnchor="middle" fontSize="14">{SPOT_ICON[s.id]}</text></g>)}
        {p.hasO && <circle cx={gx(p.ox)} cy={gz(p.oz)} r={19} fill="none" stroke="#ff9a4d" strokeWidth={2} strokeDasharray="3 3" />}
        <circle cx={gx(p.x)} cy={gz(p.z)} r={6} fill="#ffe27a" stroke="#1b1b10" />
        <line x1={gx(p.x)} y1={gz(p.z)} x2={gx(p.x) + Math.sin(p.h) * 16} y2={gz(p.z) + Math.cos(p.h) * 16} stroke="#ffe27a" strokeWidth={2.5} />
      </svg>
      <div>
        <p className="l4-copy">Yellow dot: Mysha. Orange ring: your current objective. Pick a station to set a waypoint. You still have to walk there and press E.</p>
        {STATION_LIST.map(s => <div key={s.name} className={`l4-st${target === s.spot ? " sel" : ""}`}>
          <span>{s.icon} <b>{s.name}</b><br /><span className="l4-dim">{s.note}</span></span>
          <button className="l4-mini" onClick={() => { onTarget(s.spot); onClose(); }}>WAYPOINT</button></div>)}
      </div>
    </div>
    <div className="l4-actions"><button className="l4-btn l4-primary" onClick={onClose}>CLOSE MAP</button></div>
  </UiDialog>;
}
function UiLibrary({ topic, setTopic, onClose }: { topic: string; setTopic: (id: string) => void; onClose: () => void }) {
  const cur = sciById(topic);
  return <UiDialog kicker="NASA SCIENCE LIBRARY" title="What is real, and what is simulated?" wide cls="panelz">
    <p className="l4-copy">Entries labelled NASA are real research or observations from the stated source. They are <b>not</b> Mysha's data. Entries labelled GAME SIMULATION are invented rules for this game.</p>
    <div className="l4-lib">
      <nav className="l4-libnav" aria-label="Science topics">{LIB_GROUPS.map(g => <div key={g.name}><h5>{g.name.toUpperCase()}</h5>
        {g.ids.map(id => <button key={id} className={id === topic ? "sel" : ""} onClick={() => setTopic(id)}>{sciById(id).topic}</button>)}</div>)}</nav>
      <div><UiSci s={cur} /></div>
    </div>
    <div className="l4-actions"><button className="l4-btn l4-primary" onClick={onClose}>CLOSE LIBRARY</button></div>
  </UiDialog>;
}
/* ============================================================================
 * SECTION K2 — CINEMATIC RETURN STORY
 * Original CSS/SVG-style browser visuals; the cockpit illustration is stylized
 * and does not claim to be an authentic NASA cockpit or a photoreal 3D asset.
 * All outcomes reflect deterministic game scores, never real human medical data.
 * ========================================================================== */
type FinaleVisual = "orbit" | "earth" | "welcome" | "health" | "support" | "habitat" | "mars";
type FinaleBeat = { visual: FinaleVisual; label: string; title: string; body: string; aura: string; status: string };
function endingEvidence(save: Save): string[] {
  const { allocation: a, res: r } = save;
  const rocketJobs = save.log.filter(e => e.act === "rocket").length;
  const shelterJobs = save.log.filter(e => e.act === "shelter").length;
  const solarJobs = save.log.filter(e => e.act === "solar").length;
  const evidence: string[] = [];
  evidence.push(`Level 3 — You assigned ${a.shielding}/100 planning points to radiation protection and ${a.power}/100 to power systems. The game used these as initial preparation, not physical NASA measurements.`);
  evidence.push(`Level 4 — You prioritized return-rocket preparation ${rocketJobs} time${rocketJobs === 1 ? "" : "s"}, radiation-shelter work ${shelterJobs} time${shelterJobs === 1 ? "" : "s"}, and solar-panel maintenance ${solarJobs} time${solarJobs === 1 ? "" : "s"}.`);
  const posture = save.storm;
  evidence.push(posture === "storm_shelter" ? "Crisis — You prioritized shelter protection; this increased protection but delayed return readiness."
    : posture === "storm_essential" ? "Crisis — You prioritized essential life-support systems, balancing crew protection and mission preparation."
    : posture === "storm_limited" ? "Crisis — You chose to continue return-vehicle work despite limited shelter protection; the simulation recorded a higher radiation-risk score."
    : "Crisis — No solar-event decision is recorded in this saved run.");
  evidence.push(`Final checkpoint — Rocket ${rd(r.rocket)}%, shelter ${rd(r.shield)}%, life support ${rd(r.life)}%, food ${rd(r.food)}%, water ${rd(r.water)}%, power ${rd(r.power)}%, simulated radiation risk ${rd(r.exposure)}%.`);
  return evidence;
}
function endingForStory(save: Save): Outcome { return save.outcome ?? "failed"; }
function finaleBeats(outcome: Outcome, save: Save): FinaleBeat[] {
  const risk = rd(save.res.exposure), rocket = rd(save.res.rocket);
  const rocketJobs = save.log.filter(e => e.act === "rocket").length;
  if (outcome === "success") return [
    { visual: "orbit", label: "CHAPTER I · DEPARTURE", title: "GOODBYE, MARS", body: "The return spacecraft rises above the red surface, turns toward its planned interplanetary trajectory, and leaves the base behind.", aura: `"Return systems are green. ${rocketJobs} rocket-preparation priorities contributed to this readiness."`, status: "RETURN VEHICLE · CLEAR" },
    { visual: "earth", label: "CHAPTER II · HOMEBOUND", title: "THE PALE BLUE HOME", body: "After the story's time-compressed journey, Earth grows in the forward window. Mission records and scientific findings are safely transmitted.", aura: '"Your careful decisions gave us a path home, Mysha."', status: "MISSION DATA · SECURED" },
    { visual: "welcome", label: "CHAPTER III · HOMECOMING", title: "WELCOME HOME, MYSHA", body: "Mysha returns to Earth. The waiting research team welcomes her with applause, and AURA archives the completed mission.", aura: '"Mission successful. Every small decision brought you here."', status: "MISSION SUCCESSFUL" },
  ];
  if (outcome === "partial") return [
    { visual: "orbit", label: "CHAPTER I · DEPARTURE", title: "HOME IS STILL POSSIBLE", body: "The spacecraft leaves Mars. It meets the minimum return requirements, but some mission objectives and protection margins were not fully achieved.", aura: `"Launch confirmed. The final simulated radiation-risk score is ${risk}%. Crew-health follow-up will be needed."`, status: "RETURN APPROVED · WITH LIMITATIONS" },
    { visual: "earth", label: "CHAPTER II · THE JOURNEY", title: "SOME DATA LEFT BEHIND", body: "On the journey home, AURA flags incomplete science records for review. The mission has achieved a return, but not every objective.", aura: '"We made it away from Mars, Mysha. Our mission report must also explain what we could not complete."', status: "SCIENCE ARCHIVE · INCOMPLETE" },
    { visual: "health", label: "CHAPTER III · EARTH", title: "A SAFE RETURN. MORE TO LEARN.", body: "Mysha reaches Earth and receives a non-graphic medical assessment and post-mission recovery support. The crew reviews the protection and resource tradeoffs.", aura: '"You are home. The mission continues through recovery and what we have learned."', status: "PARTIAL SUCCESS" },
  ];
  if (outcome === "compromised") return [
    { visual: "orbit", label: "CHAPTER I · DEPARTURE", title: "A DIFFICULT RETURN", body: `The vehicle launches, but its simulated return-readiness score is only ${rocket}%. AURA flags the limited propulsion and fuel-margin readiness inferred by this fictional game model.`, aura: '"Mysha, our margins are thinner than planned. I am activating the pre-positioned support contingency."', status: "PROPULSION MARGIN · LIMITED" },
    { visual: "support", label: "CHAPTER II · EMERGENCY LINK", title: "RELAY-2 RESPONDS", body: "AURA sends a support request. Relay-2, the fictional standby mission asset introduced earlier, assists with the return. This is an imagined rescue architecture, not an actual NASA capability.", aura: '"Relay-2 confirms support. We are not making this journey alone."', status: "FICTIONAL SUPPORT LINK · ACTIVE" },
    { visual: "earth", label: "CHAPTER III · ASSISTED RETURN", title: "BACK WITH HELP", body: "With support, Mysha reaches safety. The Mission Log records the return-preparation shortfall and the choices that made assistance necessary.", aura: '"We returned, Mysha. The next mission must learn from our resource decisions."', status: "MISSION COMPROMISED" },
  ];
  return [
    { visual: "mars", label: "CHAPTER I · DEPARTURE HOLD", title: "THE ENGINES STAY SILENT", body: "The scheduled departure checkpoint reaches zero. Required mission-readiness conditions are not satisfied, so the spacecraft stays safely on the pad.", aura: '"Mysha, this departure cannot proceed. The Mission Log will show exactly which conditions were not met."', status: "LAUNCH HOLD · NOT READY" },
    { visual: "habitat", label: "CHAPTER II · THE NEXT PLAN", title: "A HOME ON MARS — FOR NOW", body: "Mysha returns to the protected, pressurized habitat. Life support and supplies remain the first priority as AURA reorganizes the survival plan.", aura: '"We are staying, but this is not the end of our work."', status: "HABITAT · PROTECTED" },
    { visual: "mars", label: "CHAPTER III · HOPE", title: "THE NEXT OPPORTUNITY", body: "The next favorable Earth–Mars transfer opportunity may come in approximately 26 months. That is an orbital-cycle approximation, not a guaranteed departure date.", aura: '"Survive. Repair. Learn. We will prepare for the next opportunity."', status: "DEPARTURE POSTPONED · ~26 MONTHS" },
  ];
}
function UiCockpitBackdrop({ power, rocket }: { power: number; rocket: number }) {
  return <div className="l4-cockpit" aria-label="Stylized fictional rocket cockpit; Mysha is seated for departure">
    <div className="l4-cockpit-glass"><div className="l4-cockpit-sky" /><div className="l4-cockpit-horizon" />
      <div className="l4-cockpit-readout"><b>MARS ASCENT · FLIGHT DECK</b><span>AURA · GUIDANCE ONLINE</span></div>
      <div className="l4-cockpit-reticle"><i /><i /></div>
    </div>
    <div className="l4-cockpit-frame" />
    <div className="l4-cockpit-pilot" aria-hidden="true"><div className="l4-cockpit-helmet"><span className="l4-cockpit-visor" /></div><div className="l4-cockpit-suit"><span>MY</span></div></div>
    <div className="l4-cockpit-console" aria-hidden="true"><div><small>RETURN VEHICLE</small><b>{rd(rocket)}%</b><span>READINESS</span></div><div className="l4-cockpit-dots">● ● ● ● ●</div><div><small>RESERVE POWER</small><b>{rd(power)}%</b><span>GAME SCORE</span></div></div>
    <div className="l4-cockpit-credit">CINEMATIC GAME ART · NOT NASA HARDWARE</div>
  </div>;
}
function UiFinaleCinematic({ outcome, beat, index, total, onNext, onSkip }: {
  outcome: Outcome; beat: FinaleBeat; index: number; total: number; onNext: () => void; onSkip: () => void;
}) {
  const earth = beat.visual === "earth" || beat.visual === "welcome" || beat.visual === "health";
  const support = beat.visual === "support";
  const habitat = beat.visual === "habitat";
  const close = index === total - 1;
  return <div className={`l4-film l4-film-${beat.visual}`} role="dialog" aria-modal="true" aria-label={`Final mission cinematic scene ${index + 1} of ${total}`}>
    <div className="l4-film-art" aria-hidden="true">
      <div className="l4-film-stars" />
      <div className={`l4-film-planet ${earth ? "is-earth" : "is-mars"}`} />
      {habitat && <div className="l4-film-habitat"><i /><span>PRESSURIZED MARS HABITAT</span></div>}
      {beat.visual === "welcome" && <div className="l4-film-crew">{[0,1,2,3,4].map(i => <span key={i} style={{ animationDelay: `${i * 0.18}s` }} />)}</div>}
      {beat.visual === "health" && <div className="l4-film-health"><span>POST-MISSION HEALTH REVIEW</span><i /><i /><i /></div>}
      {!habitat && beat.visual !== "welcome" && beat.visual !== "health" && <div className="l4-film-ship"><i /><span>MY</span></div>}
      {support && <div className="l4-film-relay"><i /><span>RELAY-2 · FICTIONAL SUPPORT</span></div>}
      <div className="l4-film-scan">{beat.status}</div>
    </div>
    <div className="l4-film-narrative">
      <div className="l4-film-index"><span>{beat.label}</span><span>SCENE {index + 1} / {total}</span></div>
      <h2>{beat.title}</h2>
      <p>{beat.body}</p>
      <blockquote><b>AURA</b> {beat.aura}</blockquote>
      <div className="l4-film-pips">{Array.from({ length: total }, (_, i) => <i key={i} className={i <= index ? "active" : ""} />)}</div>
      <div className="l4-film-actions">
        <button className="l4-btn l4-primary" onClick={onNext}>{close ? "OPEN MY MISSION LOG →" : "NEXT SCENE →"}</button>
        <button className="l4-btn" onClick={onSkip}>SKIP TO MISSION LOG</button>
      </div>
      <p className="l4-film-footnote">{outcome === "compromised" ? "Relay-2 is fictional; not a real NASA rescue service." : "Cinematic fictional story. Mission scores are educational gameplay values."}</p>
    </div>
  </div>;
}

function UiMissionLog({ save, ending, contUnlockedNow, modelNote }: { save: Save; ending: Outcome; contUnlockedNow: boolean; modelNote: string }) {
  const copy = outcomeCopy(ending), why = explainOutcome(ending, save.res), crisis = save.log.find(e => e.act === "crisis");
  const ids = Array.from(new Set<string>([...save.log.map(e => e.sci ?? ""), "window", "std3001"].filter(Boolean)));
  const a = save.allocation;
  return <>
    <h1 className="l4-h1">{copy.title}</h1><p className="l4-sub">{copy.sub.toUpperCase()}</p>
    <p className="l4-copy">{copy.desc}</p>
    <div className="l4-quote"><strong>AURA:</strong> "There was another decision you could have made. Would you like to discover it?"</div>
    <div className="l4-grid">
      <div className="l4-card"><h3>WHY THIS ENDING</h3><p>{why.head}</p>
        <table className="l4-delta"><tbody>{why.reqs.map(q => <tr key={q.label}><td>{q.label}</td><td>{rd(q.have)}% (needs {q.atMost ? "≤" : "≥"} {q.need}%)</td><td className={reqMet(q) ? "up" : "dn"}>{reqMet(q) ? "MET" : "MISSED"}</td></tr>)}</tbody></table></div>
      <div className="l4-card"><h3>FINAL RESOURCES (GAME SCORES)</h3>
        <table className="l4-delta"><tbody>{(["food", "water", "power", "life", "shield", "rocket", "exposure"] as (keyof Res)[]).map(k => <tr key={k}><td>{RES_LABEL[k]}</td><td>{rd(save.res[k])}%</td><td /></tr>)}</tbody></table></div>
    </div>
    <div className="l4-grid">
      <div className="l4-card"><h3>LEVEL 3 ALLOCATION {save.carried ? "(LOADED)" : "(BALANCED DEMO)"}</h3>
        <p>Supplies {a.supplies} · Shielding {a.shielding} · Energy {a.power} · Stability {a.stability}</p>
        <p className="l4-dim">Your Level 3 record was only read, never changed.</p></div>
      <div className="l4-card"><h3>CRISIS DECISION</h3><p>{save.storm ? POSTURE_LABEL[save.storm] : "No crisis choice recorded."}</p>{crisis && <p className="l4-dim">{crisis.detail}</p>}</div>
    </div>
    <div className="l4-card l4-evidence"><h3>AURA · WHAT YOUR DECISIONS ACTUALLY CHANGED</h3>
      {endingEvidence(save).map((line, i) => <p key={i}>{line}</p>)}
      <p className="l4-dim">These explanations come from your saved mission state. They do not describe actual NASA medical predictions or measured rocket fuel.</p>
    </div>
    <h3 className="l4-hudtitle">LEVEL 4 DECISIONS</h3>
    <div className="l4-log">{save.log.map((e, i) => <div key={i} className="l4-logrow"><b>Interval {e.day} · Sol {solLabel(e.day)} · {e.title}</b> — {e.detail}</div>)}</div>
    <h3 className="l4-hudtitle" style={{ marginTop: 14 }}>NASA REFERENCES FOR YOUR RUN</h3>
    <div className="l4-pips">{ids.map(id => { const s = sciById(id); return s.url ? <a key={id} className="l4-badge" href={s.url} target="_blank" rel="noopener noreferrer">{s.topic}</a> : <span key={id} className="l4-badge">{s.topic}</span>; })}</div>
    <div className={`l4-card${contUnlockedNow ? " sel" : ""}`}><h3>{contUnlockedNow ? "🔓 ALTERNATIVE DECISION UNLOCKED" : "🔒 ALTERNATIVE DECISION (LOCKED)"} · AURA CONTINGENCY REVIEW</h3>
      <p>{contUnlockedNow ? "Available at the life-support console inside the habitat. It improves shelter, rocket and life support at a high power cost." : "A hidden option at the life-support console. Start a replay to unlock it."}</p></div>
    <p className="l4-note">Endings, thresholds and events are fictional game rules and are not NASA findings. Character: {modelNote}</p>
  </>;
}

/* ============================================================================
 * SECTION K2 — FINAL MISSION DEBRIEF + MARS DISCOVERY ARCHIVE
 * The artwork is supplied separately in public/images/level4/mars-mission-debrief.png.
 * Overlay buttons are real accessible controls, aligned to the original artwork.
 * ========================================================================== */
/**
 * src/app/Level4Debrief.tsx  (NEW FILE)
 * Final MISSION DEBRIEF screen + Mars Discovery Archive for Level 4.
 * Image: public/images/level4/mars-mission-debrief.png  (1672 x 941)
 * Play Again calls onRestartFromLevel1 (the PARENT must restart the game at Level 1).
 * Archive facts are short educational text with NASA links. Game scores are NOT NASA data.
 * Links were not re-opened while writing this file. Please check them before release.
 */

const DEBRIEF_IMG = `${import.meta.env.BASE_URL}images/level4/mars-mission-debrief.png`;
const DEBRIEF_W = 1672, DEBRIEF_H = 941;
// Button boxes measured on the 1672x941 image, stored as percentages.
const BTN_PLAY = { l: (592 / DEBRIEF_W) * 100, t: (726 / DEBRIEF_H) * 100, w: (438 / DEBRIEF_W) * 100, h: (106 / DEBRIEF_H) * 100 };
const BTN_LEARN = { l: (1073 / DEBRIEF_W) * 100, t: (726 / DEBRIEF_H) * 100, w: (468 / DEBRIEF_W) * 100, h: (106 / DEBRIEF_H) * 100 };

type Topic = { id: string; icon: string; title: string; facts: string[]; links: { t: string; u: string }[]; note?: string };
const TOPICS: Topic[] = [
  { id: "mars", icon: "🔴", title: "Discover Mars", facts: [
    "Mars is called the Red Planet because iron-rich dust on its surface looks red-orange.",
    "Mars is the fourth planet from the Sun. It is about half as wide as Earth.",
    "Its air is very thin. Scientists study Mars to learn about its past and to plan future trips."],
    links: [{ t: "NASA Mars", u: "https://science.nasa.gov/mars/" }] },
  { id: "air", icon: "🌫️", title: "The Martian Atmosphere", facts: [
    "The air on Mars is mostly carbon dioxide. People cannot breathe it.",
    "The air pressure is far lower than on Earth. Without a pressurized suit, a person would be in danger.",
    "That is why Mysha wears a suit outside and why the habitat is sealed."],
    links: [{ t: "NASA Mars", u: "https://science.nasa.gov/mars/" }] },
  { id: "weather", icon: "🌪️", title: "Weather on Mars", facts: [
    "Mars is cold, and the air is dusty. Wind can lift dust into the sky.",
    "Perseverance has a weather station called MEDA. It measures things like temperature, wind and dust.",
    "Dust can block sunlight, so it matters for solar power."],
    links: [{ t: "Perseverance instruments (MEDA)", u: "https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/" }] },
  { id: "water", icon: "💧", title: "Water on Mars", facts: [
    "Scientists have found signs that Mars had water long ago. Water ice is also found there.",
    "Water is heavy to carry, so future crews need to reuse it.",
    "NASA tested water recovery on the space station (ISS). That is real research. Your game water score is only a game number."],
    links: [{ t: "NASA ISS research 2023", u: "https://www.nasa.gov/missions/station/iss-research/nasas-2023-space-station-achievements/" }] },
  { id: "radiation", icon: "☢️", title: "Radiation on Mars", facts: [
    "Space radiation comes from far away (cosmic rays) and from the Sun (solar particles).",
    "The Curiosity rover has an instrument called RAD. It measures radiation on the surface.",
    "RAD readings are rover measurements. They are not Mysha's dose. Your radiation meter is a game score."],
    links: [{ t: "Curiosity RAD data (NASA)", u: "https://data.nasa.gov/dataset/mars-science-laboratory-msl-radiation-assessment-detector-rad-level-2-observation-dosimetr-e2695" }] },
  { id: "food", icon: "🌱", title: "Growing Food in Space", facts: [
    "NASA grows plants on the space station with tools like Veggie and the Advanced Plant Habitat.",
    "Plants need light, water and power.",
    "A small greenhouse alone is not a proven full food supply for a Mars crew. More research is needed."],
    links: [{ t: "NASA: Growing plants in space", u: "https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/" }] },
  { id: "robots", icon: "🤖", title: "Exploring Mars", facts: [
    "Robots have explored Mars for years. Curiosity and Perseverance are rovers.",
    "Ingenuity was a small helicopter that flew on Mars.",
    "No human has landed on Mars yet."],
    links: [{ t: "NASA Mars", u: "https://science.nasa.gov/mars/" }, { t: "Perseverance", u: "https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/" }] },
  { id: "humans", icon: "👩‍🚀", title: "Humans on Mars", facts: [
    "A human trip to Mars is a future idea, not a finished mission.",
    "A crew would need life support, suits, a habitat, radiation protection, power and a ride home.",
    "NASA writes health standards to help keep crews safe on long missions."],
    links: [{ t: "NASA crew health standards", u: "https://www.nasa.gov/ochmo/human-spaceflight-and-aviation-standards" }] },
  { id: "return", icon: "🚀", title: "Returning to Earth", facts: [
    "Earth and Mars move around the Sun at different speeds.",
    "Good chances to travel between them come about every 26 months.",
    "Your 10-minute game countdown is fiction. Real planning takes much longer."],
    links: [{ t: "NASA podcast: Rendezvous with Mars", u: "https://www.nasa.gov/podcasts/houston-we-have-a-podcast/rendezvous-with-mars/" }] },
  { id: "landscape", icon: "⛰️", title: "Mars Landscapes", facts: [
    "Olympus Mons is an enormous volcano on Mars, and Valles Marineris is a vast system of canyons.",
    "These landscapes record a long geological history involving volcanoes, impacts, and changes to the planet's surface.",
    "A future human landing site would require careful scientific and engineering evaluation. This game base is fictional."],
    links: [{ t: "NASA Mars", u: "https://science.nasa.gov/mars/" }] },
  { id: "compare", icon: "⚖️", title: "Your Mission vs Real NASA Science", facts: [
    "Game water percent = fictional score. NASA water recovery = real engineering tests.",
    "Game radiation meter = fictional idea. Curiosity RAD = real measurements.",
    "Game rocket readiness = fictional score. Real missions use many careful checks."],
    links: [{ t: "NASA Mars", u: "https://science.nasa.gov/mars/" }] },
];

function useReduced() {
  const [r, setR] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const q = window.matchMedia?.("(prefers-reduced-motion: reduce)"); if (!q) return; const f = () => setR(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return r;
}
/** Types text one letter at a time. Restarts only when `text` changes, never on re-render. */
function useTypewriter(text: string, paused: boolean, reduced: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(reduced ? text.length : 0); }, [text, reduced]);
  useEffect(() => {
    if (paused || reduced || n >= text.length) return;
    const id = window.setTimeout(() => setN(v => Math.min(text.length, v + 1)), 22);
    return () => window.clearTimeout(id);
  }, [n, text, paused, reduced]);
  return { shown: text.slice(0, n), done: n >= text.length, skip: useCallback(() => setN(text.length), [text]) };
}

function Archive({ onBack }: { onBack: () => void }) {
  const reduced = useReduced();
  const [ti, setTi] = useState<number | null>(null), [fi, setFi] = useState(0), [paused, setPaused] = useState(false);
  const topic = ti == null ? null : TOPICS[ti];
  const text = topic ? topic.facts[fi] : "";
  const tw = useTypewriter(text, paused, reduced);
  const open = (i: number) => { setTi(i); setFi(0); setPaused(false); };
  const last = topic ? fi >= topic.facts.length - 1 : false;
  return <div className="dbf-arch" role="dialog" aria-modal="true" aria-label="Mars Discovery Archive">
    <header><div><small>CONNECTED TO AURA</small><h2>MARS DISCOVERY ARCHIVE</h2><p>Explore the Red Planet Beyond the Mission</p></div>
      <button className="dbf-btn" onClick={onBack}>← BACK TO MISSION DEBRIEF</button></header>
    {!topic && <div className="dbf-topics">{TOPICS.map((t, i) => <button key={t.id} className="dbf-card" onClick={() => open(i)}><span>{t.icon}</span><b>{t.title}</b></button>)}</div>}
    {topic && <section className="dbf-topic" aria-live="polite">
      <small>TOPIC {ti! + 1} OF {TOPICS.length} · FACT {fi + 1} OF {topic.facts.length}</small>
      <div className="dbf-head"><div className={`dbf-globe${reduced ? " still" : ""}`} aria-hidden="true">{topic.icon}</div><h3>{topic.title}</h3></div>
      <div className="dbf-scan" aria-hidden={tw.done} />
      <p className="dbf-text" aria-label={text}><span aria-hidden="true">{tw.shown}</span><span className="dbf-caret" aria-hidden="true">{tw.done ? "" : "▌"}</span></p>
      <p className="dbf-ill">Illustration only. Not to scale. Game numbers are not NASA data.</p>
      <div className="dbf-row">
        <button className="dbf-btn" disabled={fi === 0} onClick={() => { setFi(fi - 1); setPaused(false); }}>← PREVIOUS</button>
        <button className="dbf-btn" disabled={tw.done} onClick={() => setPaused(p => !p)}>{paused ? "▶ RESUME" : "⏸ PAUSE"}</button>
        <button className="dbf-btn" disabled={tw.done} onClick={tw.skip}>SKIP TYPING</button>
        {!last ? <button className="dbf-btn dbf-go" disabled={!tw.done} onClick={() => { setFi(fi + 1); setPaused(false); }}>NEXT FACT →</button>
          : <button className="dbf-btn dbf-go" disabled={!tw.done || ti! >= TOPICS.length - 1} onClick={() => open(ti! + 1)}>NEXT TOPIC →</button>}
      </div>
      {last && tw.done && <div className="dbf-links"><b>NASA sources:</b> {topic.links.map(l => <a key={l.u + l.t} href={l.u} target="_blank" rel="noopener noreferrer">{l.t}</a>)}</div>}
      <div className="dbf-row"><button className="dbf-btn" onClick={() => setTi(null)}>ALL TOPICS</button><button className="dbf-btn" onClick={onBack}>BACK TO MISSION DEBRIEF</button></div>
    </section>}
  </div>;
}

function MissionDebrief({ onRestartFromLevel1, onBeforeRestart }: { onRestartFromLevel1?: () => void; onBeforeRestart?: () => void }) {
  const [view, setView] = useState<"image" | "archive">("image");
  const [msg, setMsg] = useState("");
  const learnRef = useRef<HTMLButtonElement>(null);
  const mobileLearnRef = useRef<HTMLButtonElement>(null);

  const again = () => {
    if (!onRestartFromLevel1) {
      setMsg("Full-game restart is not connected. Please use the game's main menu.");
      return;
    }
    onBeforeRestart?.();
    onRestartFromLevel1();
  };

  const openArchive = () => { setMsg(""); setView("archive"); };
  const closeArchive = () => {
    setView("image");
    // Restore keyboard focus to the visible Learn More control for the current layout.
    window.requestAnimationFrame(() => {
      const desktop = learnRef.current;
      if (desktop && getComputedStyle(desktop).display !== "none" && getComputedStyle(desktop).visibility !== "hidden") {
        desktop.focus();
      } else {
        mobileLearnRef.current?.focus();
      }
    });
  };
  const box = (b: typeof BTN_PLAY): CSSProperties => ({
    left: `${b.l}%`, top: `${b.t}%`, width: `${b.w}%`, height: `${b.h}%`,
  });

  return <div className="dbf" role="region" aria-label="Final Mars mission debrief">
    <style>{DEBRIEF_CSS}</style>
    <div className="dbf-frame">
      <img
        src={DEBRIEF_IMG}
        alt="Mission Debrief: Mysha in an astronaut suit, a Mars research habitat, and two choices: Play Again or Learn More About Mars."
        draggable={false}
      />
      {/* Desktop: hit targets occupy the EXACT relative coordinates of the button artwork.
          Both targets share the same scaling and crop transform as the full-bleed image. */}
      <button className="dbf-hot" style={box(BTN_PLAY)} onClick={again}
        aria-label="Play again: restart the adventure from Level 1" title="Play again from Level 1" />
      <button ref={learnRef} className="dbf-hot" style={box(BTN_LEARN)} onClick={openArchive}
        aria-label="Learn more about Mars: open the Mars Discovery Archive" title="Learn more about Mars" />
    </div>

    {/* Portrait and small-screen experience: the FULL original artwork remains visible
        in a responsive picture card while the background fills the entire viewport.
        Larger accessible controls replace too-small artwork hit targets. */}
    <div className="dbf-mobile-copy">
      <span className="dbf-mobile-kicker">MYSHA GOES TO MARS · FINAL CHAPTER</span>
      <h2>MISSION DEBRIEF</h2>
      <p>Every decision shaped your mission. Your next discovery begins here.</p>
    </div>
    <div className="dbf-below">
      <button className="dbf-btn dbf-go" onClick={again} aria-label="Play again from Level 1">
        <span aria-hidden="true">↻</span> PLAY AGAIN
      </button>
      <button ref={mobileLearnRef} className="dbf-btn dbf-learn" onClick={openArchive}>
        <span aria-hidden="true">◉</span> LEARN MORE ABOUT MARS
      </button>
    </div>
    {msg && <p className="dbf-msg" role="alert">{msg}</p>}
    {view === "archive" && <Archive onBack={closeArchive} />}
  </div>;
}

const DEBRIEF_CSS = `
/* The artwork fills ordinary landscape screens with a true proportional cover.
   On portrait screens the original artwork is shown in full, with an atmospheric
   cover background and separately accessible controls instead of cropping text. */
.dbf{
  position:absolute;inset:0;z-index:200;isolation:isolate;overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#160e12;color:#e9f7fa;
  font-family:Bahnschrift,"Segoe UI",system-ui,sans-serif;
  animation:dbfin .7s ease-out both;
}
.dbf *{box-sizing:border-box}
.dbf::before{
  content:"";position:absolute;inset:-28px;z-index:-2;pointer-events:none;
  background-image:url("${DEBRIEF_IMG}");background-size:cover;background-position:center;
  filter:blur(22px) saturate(1.2) brightness(.75);transform:scale(1.07);
}
.dbf::after{
  content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
  background:linear-gradient(180deg,#080a1644 0%,transparent 28%,#08071270 100%);
}
.dbf-frame{
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  aspect-ratio:1672 / 941;
  width:max(100vw,177.683dvh);
  flex:none;overflow:hidden;
}
.dbf-frame img{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:fill;pointer-events:none;user-select:none;-webkit-user-drag:none}
.dbf-hot{
  position:absolute;z-index:2;display:block;min-width:0;min-height:0;
  padding:0;background:transparent;border:0;border-radius:13px;cursor:pointer;
  transition:box-shadow .2s ease,background .2s ease,transform .12s ease;
}
.dbf-hot:hover{background:#59e3f01f;box-shadow:0 0 26px #59e3f099}
.dbf-hot:active{transform:scale(.985)}
.dbf-hot:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 26px #8df1ff}
.dbf-mobile-copy,.dbf-below{display:none}
.dbf-btn{
  min-height:50px;padding:12px 18px;border-radius:12px;border:1px solid #8cd5e0aa;
  background:#092330ed;color:#ecfcff;font:inherit;font-weight:800;letter-spacing:.035em;
  cursor:pointer;transition:transform .16s,background .16s,box-shadow .16s;
}
.dbf-btn:hover:not(:disabled){background:#145168;transform:translateY(-2px)}
.dbf-btn:active{transform:translateY(0)}
.dbf-btn:disabled{opacity:.4;cursor:not-allowed}
.dbf-btn:focus-visible,.dbf a:focus-visible,.dbf-card:focus-visible{outline:3px solid #8df1ff;outline-offset:2px}
.dbf-go{background:linear-gradient(120deg,#ee9450,#cf5a43);color:#1b1010;border-color:#ffbd8e}
.dbf-learn{border-color:#51d5eb;background:linear-gradient(120deg,#06324c,#0e5367)}
.dbf-btn span{font-size:1.3em;vertical-align:middle;margin-right:.3em}
.dbf-msg{position:relative;z-index:3;margin:10px 12px;padding:10px 14px;border-radius:10px;border:1px solid #ff9a4d;background:#3a1a14e9;color:#ffe9dd;max-width:440px;text-align:center;font-size:13px}
.dbf-arch{
  position:absolute;inset:0;z-index:10;overflow-y:auto;overscroll-behavior:contain;
  padding:max(16px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom));
  background:radial-gradient(ellipse at 20% 0,#3a1f1a,#070d14 60%);animation:dbfin .45s both;
}
.dbf-arch header{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;align-items:flex-start;max-width:1000px;margin:0 auto 16px}
.dbf-arch small{font-size:10px;letter-spacing:.2em;color:#87dce9;font-weight:800}
.dbf-arch h2{margin:4px 0;font-size:clamp(24px,5vw,40px);letter-spacing:.04em;color:#ffb98a}
.dbf-arch header p{margin:0;color:#9db9c3}
.dbf-topics{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;max-width:1000px;margin:0 auto}
.dbf-card{display:flex;gap:10px;align-items:center;text-align:left;padding:16px;border-radius:14px;border:1px solid #59e3f055;background:#0b2a3acc;color:inherit;font:inherit;cursor:pointer;transition:transform .15s,border-color .15s}
.dbf-card:hover{transform:translateY(-2px);border-color:#ff9a4d}
.dbf-card span{font-size:28px}
.dbf-topic{max-width:820px;margin:0 auto;padding:20px;border-radius:18px;border:1px solid #59e3f044;background:#0a1d2bd9;display:flex;flex-direction:column;gap:12px}
.dbf-head{display:flex;gap:14px;align-items:center}
.dbf-head h3{margin:0;font-size:clamp(20px,4vw,30px)}
.dbf-globe{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:26px;background:radial-gradient(circle at 30% 25%,#ffd6a2,#c86144 55%,#702b2e);animation:dbfspin 8s linear infinite;flex:none}
.dbf-globe.still{animation:none}
.dbf-scan{height:2px;background:linear-gradient(90deg,transparent,#59e3f0,transparent);animation:dbfscan 1.6s ease-in-out infinite}
.dbf-scan[aria-hidden=true]{opacity:0}
.dbf-text{min-height:7.5em;margin:0;font-size:clamp(15px,2.4vw,19px);line-height:1.7}
.dbf-caret{color:#59e3f0}
.dbf-ill{margin:0;font-size:11px;color:#9bb0bb}
.dbf-row{display:flex;flex-wrap:wrap;gap:8px}
.dbf-links{display:flex;flex-wrap:wrap;gap:10px;font-size:13px}
.dbf a{color:#9eeef5}
/* Ultra-wide: preserve full image and button art. Fill surrounding viewport
   with the matching blurred Mars scene instead of black letterboxing. */
@media (min-aspect-ratio:23/10){
  .dbf-frame{width:min(100vw,177.683dvh)}
}
/* Near-square and 4:3 displays: show the whole art with aligned hotspots;
   a blurred Mars background fills the remaining area without black gutters. */
@media (min-aspect-ratio:1/1) and (max-aspect-ratio:157/100){
  .dbf-frame{width:min(100vw,177.683dvh)}
}
/* Portrait tablets and phones: cannot fit 16:9 art into a tall screen without
   losing either title, character, or buttons. Preserve FULL poster instead;
   fill every surrounding pixel with the art-based ambient background. */
@media (max-aspect-ratio:1/1){
  .dbf{
    justify-content:flex-start;gap:clamp(12px,2.8dvh,26px);
    padding:max(20px,env(safe-area-inset-top)) 14px max(24px,env(safe-area-inset-bottom));
    overflow-y:auto;overscroll-behavior:contain;
  }
  .dbf::before{background-position:37% center;filter:blur(24px) saturate(1.12) brightness(.5)}
  .dbf-frame{
    position:relative;left:auto;top:auto;transform:none;
    width:min(100%,780px);height:auto;aspect-ratio:1672/941;
    flex:none;border-radius:clamp(8px,2vw,16px);
    box-shadow:0 16px 54px #000a,0 0 0 1px #7bdbe755;
  }
  .dbf-hot{display:none}
  .dbf-mobile-copy{display:block;position:relative;z-index:1;text-align:center;max-width:500px;padding:0 10px}
  .dbf-mobile-kicker{font-size:clamp(10px,2.4vw,12px);font-weight:900;letter-spacing:.15em;color:#a6f0ff}
  .dbf-mobile-copy h2{font-size:clamp(24px,6vw,42px);line-height:1.06;margin:8px 0;color:#e8faff;text-shadow:0 3px 16px #000}
  .dbf-mobile-copy p{font-size:clamp(13px,3vw,17px);line-height:1.45;margin:0;color:#ebdbd0}
  .dbf-below{position:relative;z-index:1;display:flex;flex-wrap:wrap;justify-content:center;gap:12px;width:min(100%,540px)}
  .dbf-below .dbf-btn{flex:1 1 220px;min-height:56px;font-size:clamp(12px,2.7vw,15px)}
}
@media (max-width:420px) and (orientation:portrait){
  .dbf{gap:clamp(12px,3vh,22px);padding-top:max(24px,env(safe-area-inset-top))}
  .dbf-below{flex-direction:column}
  .dbf-below .dbf-btn{flex:auto;width:100%}
  .dbf-topic{padding:14px}
  .dbf-arch{padding-left:12px;padding-right:12px}
}
@media (max-height:520px) and (max-aspect-ratio:1/1){
  .dbf{gap:8px;padding-top:8px}
  .dbf-mobile-copy p{display:none}
  .dbf-below .dbf-btn{min-height:44px}
}
@keyframes dbfin{from{opacity:0}to{opacity:1}}
@keyframes dbfspin{to{transform:rotate(360deg)}}
@keyframes dbfscan{50%{transform:scaleX(.4)}}
@media(prefers-reduced-motion:reduce){.dbf,.dbf *{animation:none!important;transition:none!important}}
`;

/* ============================================================================
 * SECTION L — THE FINAL LEVEL 4 COMPONENT
 * Flow: INTRODUCTION → TUTORIAL → SURVIVAL (12 intervals) → CRISIS → DEPARTURE → ENDING. No landing, no Level 3 remount.
 * ========================================================================== */
/**
 * Keeps the bridge's optional onBackToLevel3 prop type for compatibility, but
 * deliberately does not call it: Level 4's replay stays inside Level 4.
 * The Level 2 → Level 3 transition is owned by the parent / bridge, not here.
 */
export function Level4Mars(_props: { onBackToLevel3?: () => void; onRestartFromLevel1?: () => void } = {}) {
  const audio = useMissionAudio();
  const [l3] = useState(readLevel3);
  const [resume] = useState(loadSave);
  const [legacy] = useState(legacyAttempts);
  const [g, setG] = useState<Save>(() => newSave(l3));
  const gRef = useRef<Save>(g);
  const commit = useCallback((n: Save) => { gRef.current = n; setG(n); }, []);
  const sh = useSharedWorld(1, g.res);

  const [stage, setStage] = useState<Stage>("intro");
  const [panel, setPanel] = useState<L4Panel>("none");
  const [libTopic, setLibTopic] = useState("eclss98");
  const [loc, setLoc] = useState<Loc>("outdoor");
  const [near, setNear] = useState<SpotId | null>(null);
  const [target, setTarget] = useState<SpotId | null>(null);
  const [busy, setBusy] = useState(false);
  const [fade, setFade] = useState(false);
  const [flash, setFlash] = useState(0);
  const [toast, setToast] = useState("");
  const [tutIdx, setTutIdx] = useState(0);
  const [tutReplay, setTutReplay] = useState(false);
  const [train, setTrain] = useState<Res>(() => initialRes(DEFAULT_PLAN));
  const [practice, setPractice] = useState<L4Practice>({ phase: "read", pick: null, before: null, after: null });
  const [decSpot, setDecSpot] = useState<SpotId | null>(null);
  const [selAct, setSelAct] = useState<Act | null>(null);
  const [debrief, setDebrief] = useState<L4Debrief | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [crisisPick, setCrisisPick] = useState<Posture>("storm_shelter");
  const [cd, setCd] = useState(600);
  const [windowReady, setWindowReady] = useState(false);
  const [videoProblem, setVideoProblem] = useState("");
  const [videoGestureNeeded, setVideoGestureNeeded] = useState(false);
  const [videoSeconds, setVideoSeconds] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoHandledRef = useRef(false);
  const boardingStartedRef = useRef(false);
  const [finaleBeat, setFinaleBeat] = useState(0);
  const [finaleDone, setFinaleDone] = useState(false);
  const [modelNote, setModelNote] = useState("loading");
  const [touchUI, setTouchUI] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [vol, setVol] = useState(60);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);

  const timers = useRef<number[]>([]);
  const busyRef = useRef(false);
  const outRef = useRef<Outcome>("failed");
  const doneRef = useRef(false);
  const tutAcc = useRef({ move: 0, run: 0, yaw0: 0, lock: false });
  const tutRef = useRef(0);
  tutRef.current = tutIdx;

  const contUnlocked = g.contingency || legacy;
  const step = TUTORIAL_STEPS[tutIdx];
  const hudRes = stage === "tutorial" ? train : g.res;
  const worldDay = stage === "tutorial" ? 1 : g.day;

  const later = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => { timers.current = timers.current.filter(x => x !== id); fn(); }, ms);
    timers.current.push(id);
  }, []);
  useEffect(() => () => { timers.current.forEach(id => window.clearTimeout(id)); timers.current = []; }, []);
  const say = useCallback((m: string) => setToast(m), []);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(id); }, [toast]);
  // Browsers block audio until a gesture; unlock on the first one (buttons also unlock explicitly).
  useEffect(() => {
    const u = () => audio.unlock();
    window.addEventListener("pointerdown", u, { once: true }); window.addEventListener("keydown", u, { once: true });
    return () => { window.removeEventListener("pointerdown", u); window.removeEventListener("keydown", u); };
  }, [audio]);

  /* ---- world wiring ---- */
  useEffect(() => {
    const ev = stage === "tutorial" || stage === "intro" ? [] : eventsForDay(worldDay);
    const crisis = stage === "crisis" || (stage === "debrief" && debrief?.kind === "crisis");
    setWorldState(sh, { res: hudRes, day: worldDay, storm: crisis || ev.some(e => e.kind === "dust"), alert: crisis || ev.some(e => e.kind === "solar_particle") });
  }, [sh, hudRes, worldDay, stage, debrief]);
  useEffect(() => { audio.setMood(moodFor(stage, loc, g.outcome)); audio.setAmbience(loc); }, [audio, stage, loc, g.outcome]);
  useEffect(() => {
    if (stage === "intro" || stage === "boarding" || stage === "video" || stage === "ending") return;
    const sp = decSpot ? SPOTS.find(s => s.id === decSpot) : undefined;
    if (stage === "decision" && sp && sp.loc === "outdoor") focusOnSpot(sh, sp.id); else setCameraMode(sh, "follow");
  }, [sh, stage, decSpot]);
  const moveOK = (stage === "explore" || (stage === "tutorial" && TUT_MOVE.has(step.id)) || (stage === "window" && windowReady)) && panel === "none" && !busy;
  useEffect(() => { setWorldEnabled(sh, moveOK); }, [sh, moveOK]);
  const objId = useMemo<SpotId | null>(() => {
    let want: SpotId | null = null;
    if (stage === "tutorial") want = step.id === "approach" || step.id === "interact" ? "door" : step.id === "habitat" ? "console" : null;
    else if (stage === "window" && windowReady) want = "rocket";
    else if (stage === "explore") want = target;
    const sp = want ? SPOTS.find(s => s.id === want) : undefined;
    if (!want || !sp) return null;
    if (sp.loc === "indoor" && loc === "outdoor") return "door";
    if (sp.loc === "outdoor" && loc === "indoor") return "exit";
    return want;
  }, [stage, step.id, target, loc, windowReady]);
  useEffect(() => { setObjective(sh, objId ? objectiveForSpot(objId) : null); }, [sh, objId]);

  /* ---- campaign helpers ---- */
  const beginInterval = useCallback((save: Save) => {
    commit(save);
    if (save.stage === "mission") writeSave(save);
    const s = suggestAct(save.res, save.day);
    setDebrief(null); setPanel("none"); setStage("explore"); setBriefOpen(true); setTarget(ACTS[s.act].spot);
  }, [commit]);
  const hardReset = useCallback((fresh: Save) => {
    stopLaunchCinematic(sh); resetPlayer(sh); setCameraMode(sh, "follow");
    setWorldState(sh, { res: fresh.res, day: fresh.day, storm: false, alert: false, outcome: null });
    setLoc("outdoor"); setNear(null); setCd(600); setWindowReady(false);
    setVideoProblem(""); setVideoGestureNeeded(false); setVideoSeconds(0); videoHandledRef.current = false; boardingStartedRef.current = false;
    setFinaleBeat(0); setFinaleDone(false); setShowDebrief(false); doneRef.current = false; setConfirmRestart(false);
    beginInterval(fresh);
  }, [sh, beginInterval]);
  const startNew = () => {
    audio.unlock(); audio.cue("science"); setShowDebrief(false);
    const fresh = newSave(readLevel3(), resume ? (resume.stage === "ended" ? resume.replays + 1 : resume.replays) : 0, resume ? resume.contingency : false);
    commit(fresh);
    if (!isTutorialDone()) { setTutReplay(false); setTutIdx(0); setTrain(initialRes(fresh.allocation)); setPractice({ phase: "read", pick: null, before: null, after: null }); setStage("tutorial"); }
    else beginInterval(fresh);
  };
  const continueSave = () => {
    if (!resume) return;
    audio.unlock(); audio.cue("science"); setShowDebrief(false);
    if (resume.stage === "ended" && resume.outcome) { commit(resume); setFinaleDone(true); setFinaleBeat(0); setCameraMode(sh, "launch"); setWorldState(sh, { res: resume.res, day: resume.day, outcome: resume.outcome }); setStage("ending"); }
    else beginInterval(resume);
  };
  const restartWholeAdventure = () => {
    audio.cue("confirm");
    // Reset only known game campaign records. Never clear unrelated browser data.
    try {
      const campaignKeys = Object.keys(window.localStorage).filter(k =>
        /^mysha-goes-to-mars:level[1234](?::|$)/i.test(k) && !/:(?:settings|volume|music|sfx)(?::|$)/i.test(k)
      );
      for (const key of campaignKeys) window.localStorage.removeItem(key);
    } catch { /* localStorage may be disabled. */ }
    if (_props.onRestartFromLevel1) {
      _props.onRestartFromLevel1();
    } else {
      // Existing App entry starts at its intro. The game's PLAY button then begins Level 1.
      window.location.assign(import.meta.env.BASE_URL);
    }
  };
  const replay = () => { audio.cue("confirm"); hardReset(newSave(readLevel3(), gRef.current.replays + 1, true)); };
  const restartMission = () => { audio.cue("tap"); hardReset(newSave(readLevel3(), gRef.current.replays, gRef.current.contingency)); };

  /* ---- airlock transition ---- */
  const transit = useCallback((to: Loc, after?: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setFade(true); audio.cue("airlock");
    later(650, () => { if (to === "indoor") enterHabitat(sh); else exitHabitat(sh); setLoc(to); setNear(null); });
    later(1300, () => { setFade(false); busyRef.current = false; setBusy(false); after?.(); });
  }, [audio, later, sh]);

  /* ---- tutorial ---- */
  const advanceTut = useCallback(() => {
    if (tutAcc.current.lock) return;
    tutAcc.current.lock = true; audio.cue("confirm");
    setTutIdx(i => Math.min(TUTORIAL_STEPS.length - 1, i + 1));
  }, [audio]);
  useEffect(() => {
    tutAcc.current = { move: 0, run: 0, yaw0: sh.current.yaw, lock: false };
    if (stage === "tutorial" && step.id === "complete") markTutorialDone();
  }, [sh, stage, tutIdx, step.id]);
  useEffect(() => {
    if (stage !== "tutorial") return;
    const id = window.setInterval(() => {
      const s = sh.current, a = tutAcc.current, cur = TUTORIAL_STEPS[tutRef.current].id;
      if (!s.enabled || a.lock) return;
      if (cur === "look" && Math.abs(s.yaw - a.yaw0) > 0.4) advanceTut();
      else if (cur === "move") { if (s.moving) a.move += 0.1; if (a.move >= 1.2) advanceTut(); }
      else if (cur === "run") { if (s.running) a.run += 0.1; if (a.run >= 0.8) advanceTut(); }
    }, 100);
    return () => window.clearInterval(id);
  }, [sh, stage, advanceTut]);
  const pickPractice = (a: Act) => {
    audio.cue("tap");
    const r = applyAct(train, a, 1);
    setPractice({ phase: "choose", pick: a, before: train, after: r.res });
  };
  const confirmPractice = () => {
    if (!practice.pick || !practice.after) return;
    audio.cue("done"); setFlash(n => n + 1); setPractice(p => ({ ...p, phase: "done" }));
  };
  const finishTutorial = () => {
    audio.cue("confirm");
    const go = () => { if (tutReplay) { setTutReplay(false); setStage("explore"); setBriefOpen(false); } else beginInterval(gRef.current); };
    if (loc === "indoor") transit("outdoor", go); else go();
  };
  const skipTutorial = () => { markTutorialDone(); finishTutorial(); };
  const replayTutorial = () => {
    if (stage !== "explore") { say("Finish this decision first, then replay the guide."); return; }
    setPanel("none"); setTutReplay(true); setTutIdx(0); setTrain(initialRes(gRef.current.allocation));
    setPractice({ phase: "read", pick: null, before: null, after: null }); setStage("tutorial");
  };

  /* ---- stations and decisions ---- */
  const openStation = (spot: SpotId) => {
    const list = (Object.keys(ACTS) as Act[]).filter(a => ACTS[a].spot === spot && (a !== "contingency" || contUnlocked));
    if (!list.length) return;
    audio.cue("tap"); setDecSpot(spot); setSelAct(list[0]); setBriefOpen(false); setStage("decision");
  };
  const cancelDecision = () => { audio.cue("tap"); setStage("explore"); };
  const confirmAct = () => {
    if (stage !== "decision" || !selAct) return;
    const cur = gRef.current, r = applyAct(cur.res, selAct, cur.day);
    const entry: LogEntry = { day: cur.day, title: ACTS[selAct].label, detail: `${r.note} ${deltaText(cur.res, r.res)}`.trim(), act: selAct, sci: ACTS[selAct].sci };
    commit({ ...cur, res: r.res, log: [...cur.log, entry].slice(-60) });
    setDebrief({ kind: "act", title: ACTS[selAct].label, note: r.note, before: cur.res, after: r.res, sci: [sciForAct(selAct)] });
    audio.cue("done"); setFlash(n => n + 1); setStage("debrief");
  };
  const confirmCrisis = () => {
    if (stage !== "crisis") return;
    const cur = gRef.current, r = applyCrisis(cur.res, crisisPick);
    const entry: LogEntry = { day: cur.day, title: "Solar particle event + dust alert", detail: `${POSTURE_LABEL[crisisPick]}. ${r.note} ${deltaText(cur.res, r.res)}`.trim(), act: "crisis", sci: "rad-types" };
    commit({ ...cur, res: r.res, storm: crisisPick, log: [...cur.log, entry].slice(-60) });
    setDebrief({ kind: "crisis", title: "Crisis response recorded", note: r.note, before: cur.res, after: r.res, sci: [sciById("rad-types"), sciById("dust-power")] });
    audio.cue("done"); setFlash(n => n + 1); setStage("debrief");
  };
  const nextAfterDebrief = () => {
    audio.cue("tap");
    const cur = gRef.current;
    if (debrief?.kind === "act") {
      if (cur.day >= TOTAL_DAYS) { setDebrief(null); setStage("window"); return; }
      if (cur.day === CRISIS_DAY && cur.storm === null) { audio.cue("warning"); setDebrief(null); setStage("crisis"); return; }
    }
    beginInterval({ ...cur, day: cur.day + 1 });
  };
  const nextLabel = debrief?.kind === "crisis" ? "BEGIN NEXT INTERVAL →"
    : g.day >= TOTAL_DAYS ? "FINAL READINESS CHECK →" : g.day === CRISIS_DAY && g.storm === null ? "CONTINUE · EMERGENCY ALERT →" : "BEGIN NEXT INTERVAL →";

  /* ---- one-time rocket boarding, departure video and decision-based outcome ---- */
  const completeDeparture = useCallback((forced?: Outcome) => {
    if (videoHandledRef.current) return;
    videoHandledRef.current = true;
    const cur = gRef.current;
    const outcome = forced ?? outRef.current;
    const ended: Save = { ...cur, stage: "ended", outcome, contingency: true };
    commit(ended);
    writeSave(ended);
    if (outcome !== "failed") startLaunchCinematic(sh);
    else stopLaunchCinematic(sh);
    setWorldState(sh, { outcome });
    setWindowReady(false);
    setPanel("none");
    setFinaleBeat(0);
    setFinaleDone(false);
    setStage("ending");
    audio.cue(outcome === "failed" ? "warning" : "done");
  }, [audio, commit, sh]);

  const approachRocket = () => {
    audio.unlock(); audio.cue("confirm");
    setWindowReady(true);
    setCd(600);
    setTarget("rocket");
    setCameraMode(sh, "follow");
    if (loc === "indoor") transit("outdoor");
    say("Follow the rocket beacon. Approach the hatch and press E to board.");
  };

  const boardRocket = () => {
    if (stage !== "window" || !windowReady || busyRef.current || boardingStartedRef.current || videoHandledRef.current) return;
    if (sh.current.loc !== "outdoor" || distanceToSpot(sh, "rocket") > 4.6) {
      say("Move closer to the return rocket's hatch.");
      return;
    }
    boardingStartedRef.current = true;
    audio.unlock(); audio.cue("airlock");
    outRef.current = evaluateOutcome(gRef.current.res);
    setWindowReady(false);
    setStage("boarding");
    setTarget(null);
    setObjective(sh, null);
    setCameraMode(sh, "follow");
    // The 3D astronaut automatically approaches the boarding side of the rocket.
    const w = sh.current;
    w.enabled = false;
    w.keys.f = w.keys.b = w.keys.l = w.keys.r = w.keys.run = false;
    w.joy.x = w.joy.y = 0;
    w.boarding = true;
    w.boardT = 0;
    w.boardFrom.copy(w.pos);
    w.boardTo.set(ROCKET.x - 3.0, 0, ROCKET.z + 2.4);
    setVideoProblem("");
    setVideoGestureNeeded(false);
    setVideoSeconds(0);
    videoHandledRef.current = false;
    later(1750, () => {
      w.boarding = false; w.moving = false;
      setStage("video");
    });
  };

  // The fictional 10:00 window begins only when the player agrees to go to the rocket.
  // The on-screen game clock is accelerated: 6 game seconds per real second.
  useEffect(() => {
    if (stage !== "window" || !windowReady || panel !== "none" || busy) return;
    const id = window.setInterval(() => setCd(t => Math.max(0, t - 6)), 1000);
    return () => window.clearInterval(id);
  }, [stage, windowReady, panel, busy]);
  useEffect(() => {
    if (stage === "window" && windowReady && cd === 0 && !videoHandledRef.current) {
      // Missing the scheduled departure checkpoint NEVER plays a launch video.
      completeDeparture("failed");
    }
  }, [stage, windowReady, cd, completeDeparture]);

  // Browser autoplay may be blocked after the automatic boarding animation.
  // The accessible PLAY button is the fallback for mobile/Safari.
  useEffect(() => {
    if (stage !== "video") return;
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    const play = v.play();
    if (play && typeof play.catch === "function") {
      void play.then(() => setVideoGestureNeeded(false)).catch(() => setVideoGestureNeeded(true));
    }
  }, [stage]);
  useEffect(() => {
    if (stage !== "video") return;
    audio.setMusic(false); // Let the actual cutscene's own audio be heard.
    return () => { audio.setMusic(musicOn); };
  }, [stage, audio, musicOn]);

  /* ---- story scenes: players can always advance or skip; no unskippable ending. ---- */
  const finaleScenes = useMemo(() => finaleBeats(endingForStory(g), g), [g]);
  const reducedFinale = useReducedMotion();
  useEffect(() => {
    if (stage !== "ending" || finaleDone || reducedFinale || panel !== "none") return;
    const id = window.setTimeout(() => {
      if (finaleBeat >= finaleScenes.length - 1) setFinaleDone(true);
      else setFinaleBeat(i => i + 1);
    }, 7800);
    return () => window.clearTimeout(id);
  }, [stage, finaleBeat, finaleDone, finaleScenes.length, reducedFinale, panel]);
  const nextFinale = () => { audio.cue("confirm"); if (finaleBeat >= finaleScenes.length - 1) setFinaleDone(true); else setFinaleBeat(i => i + 1); };

  /* ---- interaction, reach, keyboard ---- */
  const interact = (n: SpotId | null) => {
    if (busy || (stage !== "explore" && stage !== "tutorial" && stage !== "window") || panel !== "none") return;
    audio.unlock();
    if (stage === "window") {
      if (windowReady && n === "rocket") boardRocket();
      else say("Follow the highlighted rocket beacon and press E at the hatch.");
      return;
    }
    if (!n) { say("Walk closer to a glowing station first."); return; }
    if (n === "door") { audio.cue("tap"); transit("indoor", () => { if (stage === "tutorial" && (step.id === "approach" || step.id === "interact")) { tutAcc.current.lock = false; advanceTut(); } }); return; }
    if (n === "exit") { audio.cue("tap"); transit("outdoor"); return; }
    if (n === "rack") { audio.cue("science"); setLibTopic("eclss-air"); setPanel("library"); return; }
    if (stage === "tutorial") { say("Stations unlock after training."); return; }
    openStation(n);
  };
  const reach = (id: string) => {
    if (stage === "tutorial") { if ((step.id === "approach" && id === "door") || (step.id === "habitat" && id === "console")) advanceTut(); return; }
    if (stage === "window" && windowReady && id === "rocket") { audio.cue("confirm"); say("Rocket hatch in range. Press E to begin boarding."); }
    if (stage === "explore") { audio.cue("confirm"); say(`Arrived: ${SPOT_LABEL[id as SpotId] ?? id}. Press E.`); }
  };
  const togglePanel = (p: L4Panel) => {
    if (stage === "intro" && p === "map") return;
    if (stage === "boarding" || stage === "video") return;
    audio.cue("tap"); setPanel(cur => (cur === p ? "none" : p));
  };
  const escape = () => {
    if (panel !== "none") { setPanel("none"); setConfirmRestart(false); return; }
    if (stage === "decision") { cancelDecision(); return; }
    if (stage === "explore" || stage === "tutorial") setPanel("pause");
  };
  const latest = useRef({ interact, reach, escape, togglePanel });
  latest.current = { interact, reach, escape, togglePanel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.repeat) return;
      if (e.code === "Escape") latest.current.escape();
      else if (e.code === "KeyM") latest.current.togglePanel("map");
      else if (e.code === "KeyH") latest.current.togglePanel("help");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const onNear = useCallback((id: SpotId | null) => setNear(id), []);
  const onReach = useCallback((id: string) => latest.current.reach(id), []);
  const onFoot = useCallback(() => audio.cue("step"), [audio]);
  const onModel = useCallback((s: ModelStatus) => setModelNote(s.state === "ready" ? s.note : s.note), []);
  const onInteractKey = useCallback((n: SpotId | null) => latest.current.interact(n), []);
  const world = useMemo(() => <MarsWorld3D shared={sh} onNear={onNear} onReach={onReach} onFootstep={onFoot} onModelStatus={onModel} onInteract={onInteractKey} />, [sh, onNear, onReach, onFoot, onModel, onInteractKey]);

  /* ---- derived view data ---- */
  const sug = suggestAct(g.res, g.day);
  const events = stage === "explore" ? eventsForDay(g.day) : [];
  const decOptions = decSpot ? (Object.keys(ACTS) as Act[]).filter(a => ACTS[a].spot === decSpot && (a !== "contingency" || contUnlocked)) : [];
  const preview = selAct ? applyAct(g.res, selAct, g.day) : null;
  const crisisPreview = applyCrisis(g.res, crisisPick);
  const ending: Outcome = g.outcome ?? "failed";
  const showHud = stage === "tutorial" || stage === "explore" || stage === "decision" || stage === "debrief" || stage === "crisis" || (stage === "window" && windowReady);
  const missionStage = stage === "explore" || stage === "decision" || stage === "debrief" || stage === "crisis" || stage === "window";
  const hl = stage === "tutorial" && step.id === "resources";
  const practiceOpts: Act[] = ["hydro", "solar", "shelter"];
  const touch = touchUI;

  return <div className="l4" data-stage={stage}>
    <style>{L4_CSS}</style>
    <div className="l4-world">{world}</div>
    <div className="l4-vig" />
    {(stage === "crisis" || (events.length > 0 && stage === "explore")) && <div className="l4-alertfx" />}
    {flash > 0 && <div key={flash} className="l4-flash" />}

    {stage !== "intro" && stage !== "boarding" && stage !== "video" && <header className="l4-top">
      <div className="l4-brand"><span className="l4-orb" /><span><small>MYSHA GOES TO MARS · LEVEL 04</small><strong>LIFE ON MARS</strong></span></div>
      {missionStage && <div className="l4-track" aria-label={`Interval ${Math.min(g.day, TOTAL_DAYS)} of ${TOTAL_DAYS}`}>
        {Array.from({ length: TOTAL_DAYS }, (_, i) => <i key={i} className={i + 1 < g.day ? "done" : i + 1 === g.day ? "cur" : ""} />)}<span>SOL {solLabel(g.day)}</span></div>}
      <nav className="l4-tools" aria-label="Menu">
        {missionStage || stage === "tutorial" ? <button className="l4-mini" onClick={() => togglePanel("map")}>MAP · M</button> : null}
        <button className="l4-mini" onClick={() => { setPanel("library"); audio.cue("tap"); }}>SCIENCE</button>
        <button className="l4-mini" onClick={() => togglePanel("help")}>HELP · H</button>
        {(stage === "explore" || stage === "tutorial") && <button className="l4-mini" onClick={() => togglePanel("pause")}>PAUSE · ESC</button>}
      </nav>
    </header>}

    {showHud && <UiHud res={hudRes} day={worldDay} hl={hl} label={stage === "tutorial" ? "TRAINING · PRACTICE VALUES" : `SURFACE MISSION · SOL ${solLabel(g.day)}`} />}
    {moveOK && <UiLive sh={sh} touch={touch} onInteract={() => interact(near)} />}

    {/* ---------- INTRODUCTION ---------- */}
    {stage === "intro" && <div className="l4-overlay lower" role="dialog" aria-label="Level 4 introduction"><section className="l4-dialog">
      <div className="l4-kicker">LEVEL 04 — LIFE ON MARS</div>
      <h1 className="l4-h1">THE SURVIVAL <em>WINDOW</em></h1>
      <p className="l4-sub">BUILD. SURVIVE. PREPARE TO RETURN.</p>
      <div className="l4-quote late"><strong>AURA:</strong> "Welcome to Mars, Mysha. The landing is complete, but our mission is far from over."</div>
      <details className="l4-card"><summary style={{ cursor: "pointer", fontWeight: 800 }}>YOUR PREVIOUS DECISIONS MATTER — see how</summary><UiCarry save={resume && resume.stage === "mission" ? resume : g} /></details>
      <div className="l4-actions">
        <button className="l4-btn l4-primary" onClick={startNew}>BEGIN MARS MISSION →</button>
        {resume && <button className="l4-btn" onClick={continueSave}>{resume.stage === "ended" ? "VIEW LAST MISSION LOG" : `CONTINUE · INTERVAL ${resume.day}/${TOTAL_DAYS}`}</button>}
      </div>
      <p className="l4-note">Educational game. NASA context comes from the Science Library. All meters, countdowns and endings are fictional game rules.</p>
    </section></div>}

    {/* ---------- TUTORIAL ---------- */}
    {stage === "tutorial" && step.id === "welcome" && <UiDialog kicker="FIRST-TIME TRAINING · STEP 1 OF 9" title={step.title}>
      <p className="l4-copy">{step.body} In 12 time-lapse intervals you will keep the base alive, survive a space-weather emergency, and prepare the return rocket.</p>
      <div className="l4-quote"><strong>AURA:</strong> "Mysha, I've recorded every decision from Level 3. A fictional standby support asset, Relay-2, is held in reserve as a contingency."</div>
      <UiCarry save={g} />
      <div className="l4-actions"><button className="l4-btn l4-primary" onClick={advanceTut}>START TRAINING →</button><button className="l4-btn" onClick={skipTutorial}>SKIP TRAINING</button></div>
    </UiDialog>}
    {stage === "tutorial" && TUT_MOVE.has(step.id) && panel === "none" && <div className="l4-coach" role="status">
      <small>TRAINING · STEP {tutIdx + 1} OF {TUTORIAL_STEPS.length}</small><strong>{step.title}</strong>
      <p>{step.body}{step.id === "move" && " (Keep moving for a moment.)"}{step.id === "interact" && near === "door" ? " You are close enough now. Press E." : ""}</p>
      <div className="row"><span className="l4-dim">{touch ? "Drag the view to look. Use the pad to walk." : "W A S D / arrows · Shift · E"}</span>
        <span>{step.id === "look" && <button className="l4-mini" onClick={() => { rotateCamera(sh, 0.5); }}>ROTATE ↷</button>} <button className="l4-mini" onClick={() => { tutAcc.current.lock = false; advanceTut(); }}>SKIP STEP</button></span></div>
    </div>}
    {stage === "tutorial" && step.id === "resources" && <UiDialog kicker="TRAINING · STEP 8 OF 9" title={practice.phase === "read" ? step.title : "Practice decision"}>
      {practice.phase === "read" && <>
        <p className="l4-copy">Watch the meters on the left. {step.body}</p>
        <div className="l4-grid">{HUD_ROWS.map(r => <div className="l4-card" key={r.k}><h3>{r.icon} {r.label.toUpperCase()}</h3><p>{r.tip}</p></div>)}
          <div className="l4-card"><h3>⏱ MISSION TIME</h3><p>You have 12 intervals. Each one is a time-lapse of many Mars sols, and you get ONE main job per interval.</p></div></div>
        <div className="l4-actions"><button className="l4-btn l4-primary" onClick={() => { audio.cue("confirm"); setPractice(p => ({ ...p, phase: "choose" })); }}>TRY A PRACTICE DECISION →</button></div></>}
      {practice.phase === "choose" && <>
        <p className="l4-copy">Pick one job and read the preview. This is training only. <b>Nothing here changes your real mission.</b></p>
        <div className="l4-grid three">{practiceOpts.map(a => <button key={a} className={`l4-choice${practice.pick === a ? " sel" : ""}`} onClick={() => pickPractice(a)}><span>{ACTS[a].icon}</span><span><strong>{ACTS[a].label.toUpperCase()}</strong><small>{ACTS[a].summary}</small></span></button>)}</div>
        {practice.pick && practice.before && practice.after && <><p className="l4-dim">Preview (includes time passing):</p><UiDelta before={practice.before} after={practice.after} /></>}
        <div className="l4-actions"><button className="l4-btn l4-primary" disabled={!practice.pick} onClick={confirmPractice}>CONFIRM TRAINING DECISION</button></div></>}
      {practice.phase === "done" && practice.pick && practice.before && practice.after && <>
        <div className="l4-quote"><strong>AURA:</strong> "Good. {ACTS[practice.pick].label} changed these practice meters. Every real choice has a cost and a benefit like this."</div>
        <UiDelta before={practice.before} after={practice.after} /><UiSci s={sciForAct(practice.pick)} />
        <div className="l4-actions"><button className="l4-btn l4-primary" onClick={() => { tutAcc.current.lock = false; advanceTut(); }}>CONTINUE →</button></div></>}
    </UiDialog>}
    {stage === "tutorial" && step.id === "complete" && <UiDialog kicker="TRAINING · STEP 9 OF 9" title="YOU ARE READY TO SURVIVE ON MARS">
      <p className="l4-copy">{step.body} Your real mission starts with your own starting values. The training decision did not change them.</p>
      <UiCarry save={g} />
      <div className="l4-actions"><button className="l4-btn l4-primary" onClick={finishTutorial}>{tutReplay ? "BACK TO MY MISSION →" : "START REAL MISSION →"}</button></div>
    </UiDialog>}

    {/* ---------- DAILY BRIEFING ---------- */}
    {stage === "explore" && briefOpen && panel === "none" && <div className="l4-brief" role="region" aria-label="Daily briefing">
      <div className="l4-kicker">DAILY BRIEFING · INTERVAL {g.day} OF {TOTAL_DAYS} · SOL {solLabel(g.day)}</div>
      <p>Choose <b>one</b> main job this interval. Walk to a station and press E (or tap E).{g.day === 1 && " The base is yours. Relay-2 stands by as a fictional contingency."}</p>
      {events.map(e => <div className="ev" key={e.id}><b>{e.title}.</b> {e.body}</div>)}
      <p><b>AURA suggests:</b> {ACTS[sug.act].icon} {ACTS[sug.act].label}. {sug.why} <span className="l4-dim">(A hint only. You decide.)</span></p>
      <div className="l4-actions" style={{ marginTop: 8 }}>
        <button className="l4-mini" onClick={() => { setTarget(ACTS[sug.act].spot); say("Waypoint set."); }}>SET WAYPOINT</button>
        <button className="l4-mini" onClick={() => setBriefOpen(false)}>HIDE</button></div>
    </div>}

    {/* ---------- STATION DECISION ---------- */}
    {stage === "decision" && decSpot && <div className="l4-overlay side" role="dialog" aria-modal="true" aria-label={SPOT_LABEL[decSpot]}><section className="l4-dialog">
      <div className="l4-kicker">INTERVAL {g.day} OF {TOTAL_DAYS} · SOL {solLabel(g.day)} · ONE ACTION</div>
      <h2 className="l4-h2">{SPOT_ICON[decSpot]} {SPOT_LABEL[decSpot]}</h2>
      <div style={{ display: "grid", gap: 8 }}>{decOptions.map(a => <button key={a} className={`l4-choice${selAct === a ? " sel" : ""}`} onClick={() => { audio.cue("tap"); setSelAct(a); }}><span>{ACTS[a].icon}</span><span><strong>{ACTS[a].label.toUpperCase()}</strong><small>{ACTS[a].summary}</small></span></button>)}</div>
      {selAct && preview && <>
        <h3 className="l4-hudtitle" style={{ marginTop: 14 }}>PREVIEW · WHAT CHANGES (INCLUDES TIME PASSING)</h3>
        <UiDelta before={g.res} after={preview.res} />
        <div className="l4-card"><h3>LATER EFFECTS</h3><p>{FUTURE[selAct]}</p></div>
        <UiSci s={sciForAct(selAct)} />
      </>}
      <div className="l4-actions"><button className="l4-btn l4-primary" disabled={!selAct} onClick={confirmAct}>CONFIRM DECISION →</button><button className="l4-btn" onClick={cancelDecision}>BACK TO MARS</button></div>
      <p className="l4-note">Percentages are game scores, not NASA measurements.</p>
    </section></div>}

    {/* ---------- DEBRIEF ---------- */}
    {stage === "debrief" && debrief && <UiDialog kicker={`AURA · DECISION RECORDED · SOL ${solLabel(g.day)}`} title={debrief.title}>
      <p className="l4-copy">{debrief.note}</p>
      <UiDelta before={debrief.before} after={debrief.after} />
      {debrief.sci.map(s => <UiSci key={s.id} s={s} />)}
      <div className="l4-actions"><button className="l4-btn l4-primary" onClick={nextAfterDebrief}>{nextLabel}</button></div>
    </UiDialog>}

    {/* ---------- CRISIS ---------- */}
    {stage === "crisis" && <UiDialog kicker="CRITICAL EVENT · SOLAR PARTICLE ALERT + SEPARATE DUST ALERT" title="THE SKY HAS CHANGED." cls="danger" wide>
      <div className="l4-quote"><strong>AURA:</strong> "Radiation alert. A solar particle event is expected within the next interval. Separately, dust is building and will cut solar power. These are two different hazards. Choose how to protect the crew."</div>
      <div className="l4-grid">
        <div className="l4-card"><h3>☢️ SOLAR PARTICLE EVENT</h3><p>A radiation hazard. It raises exposure risk. It does not switch off the solar panels by itself.</p></div>
        <div className="l4-card"><h3>🌪️ MARTIAN DUST</h3><p>A power hazard. Dust in the air and on panels reduces the sunlight they can use. It is not a radiation hazard.</p></div></div>
      <div className="l4-grid three">{POSTURES.map(p => <button key={p.id} className={`l4-choice${crisisPick === p.id ? " sel" : ""}`} onClick={() => { audio.cue("tap"); setCrisisPick(p.id); }}><span>{p.icon}</span><span><strong>{p.title}</strong><small>{p.body}</small></span></button>)}</div>
      <h3 className="l4-hudtitle">PREVIEW · {POSTURE_LABEL[crisisPick].toUpperCase()}</h3>
      <UiDelta before={g.res} after={crisisPreview.res} />
      <UiSci s={sciById("rad-types")} />
      <div className="l4-actions"><button className="l4-btn l4-primary" onClick={confirmCrisis}>CONFIRM CRISIS RESPONSE →</button></div>
    </UiDialog>}

    {stage === "window" && !windowReady && <UiCockpitBackdrop power={g.res.power} rocket={g.res.rocket} />}

    {/* ---------- FINAL READINESS ---------- */}
    {stage === "window" && !windowReady && <UiDialog kicker="THE FINAL CHAPTER" title="RETURN MISSION — FINAL READINESS" wide>
      <div className="l4-quote"><strong>AURA:</strong> "Mysha, I've recorded every decision you made. Let's see whether we're ready to return."</div>
      <div className="l4-grid three">{([["Food", g.res.food], ["Water", g.res.water], ["Power", g.res.power], ["Life support", g.res.life], ["Radiation protection", g.res.shield], ["Rocket readiness", g.res.rocket]] as [string, number][]).map(([n, v]) =>
        <div className="l4-card" key={n}><h3>{n.toUpperCase()}</h3><p style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{rd(v)}%</p><p className="l4-dim">game score</p></div>)}</div>
      <p className="l4-copy">Approaching the rocket activates an accelerated <b>game</b> departure checkpoint (10:00). It is <b>not</b> the length of a real Mars launch window. Real favorable transfer opportunities come about every 26 months. The result is decided only by the numbers above, with no randomness.</p>
      <UiSci s={sciById("window")} />
      <p className="l4-copy"><b>Next objective:</b> walk to the RETURN ROCKET BAY, approach the hatch, then press <b>E</b> (or the mobile E button) to let Mysha board automatically. Your 10-minute fictional countdown starts when you choose to go to the rocket.</p>
      <div className="l4-actions"><button className="l4-btn l4-primary" onClick={approachRocket}>GO TO THE ROCKET BAY →</button></div>
    </UiDialog>}

    {/* ---------- WALK TO THE ROCKET / PRESS E ---------- */}
    {stage === "window" && windowReady && <div className="l4-departure-hud" role="status">
      <div className="l4-kicker">AURA · FINAL DEPARTURE CHECKPOINT</div>
      <div className="l4-departure-clock">{fmtClock(cd)}</div>
      <strong>GO TO RETURN ROCKET BAY</strong>
      <p>Follow the blue marker. Walk near the rocket hatch and press <kbd>E</kbd> (or the touch E button). Mysha will board automatically.</p>
      <small>Fictional accelerated 10-minute mission checkpoint · Next favorable transfer opportunity ≈ 26 months</small>
    </div>}

    {/* ---------- AUTOMATIC BOARDING ANIMATION ---------- */}
    {stage === "boarding" && <div className="l4-board-overlay" role="status">
      <div className="l4-kicker">RETURN VEHICLE · HATCH ACCESS</div>
      <h2>MYSHA IS BOARDING</h2>
      <p>AURA: "Mysha, I have recorded every decision. Now let's see whether you're ready to return."</p>
      <div className="l4-board-progress"><i /></div>
    </div>}

    {/* ---------- USER-SUPPLIED 30-SECOND VIDEO ---------- */}
    {stage === "video" && <div className="l4-video-overlay" role="dialog" aria-modal="true" aria-label="Return rocket boarding and departure cutscene">
      <video ref={videoRef} className="l4-video-player" src={LAUNCH_VIDEO_SRC} playsInline preload="auto" autoPlay
        onPlaying={() => setVideoGestureNeeded(false)}
        onTimeUpdate={e => {
          const t = e.currentTarget.currentTime;
          if (Number.isFinite(t)) setVideoSeconds(Math.floor(t));
          if (outRef.current === "failed" && t >= 18) {
            e.currentTarget.pause();
            completeDeparture("failed"); // Never show a liftoff in a failed outcome.
          }
        }}
        onLoadedMetadata={e => {
          const duration = e.currentTarget.duration;
          if (outRef.current === "failed" && Number.isFinite(duration) && duration < 24) {
            // A short launch-only clip would falsely depict a failed mission taking off.
            e.currentTarget.pause(); completeDeparture("failed");
          }
        }}
        onEnded={() => completeDeparture()}
        onError={() => setVideoProblem(`Cannot play ${LAUNCH_VIDEO_SRC}. Check the video location and format (MP4 H.264 recommended).`)}
      />
      <div className="l4-video-caption">
        <small>MYSHA GOES TO MARS · RETURN MISSION</small>
        <span>{outRef.current === "failed" ? "PRE-DEPARTURE CHECK · AURA" : "BOARDING → ENGINE START → DEPARTURE"}</span>
      </div>
      {videoProblem && <div className="l4-video-message" role="alert">
        <strong>Cutscene could not be loaded</strong><p>{videoProblem}</p>
        <button className="l4-btn l4-primary" onClick={() => completeDeparture()}>CONTINUE TO MISSION RESULT →</button>
      </div>}
      {!videoProblem && videoGestureNeeded && <div className="l4-video-message">
        <strong>Ready to play the cinematic</strong>
        <p>Your browser requires a tap before playing video with sound.</p>
        <button className="l4-btn l4-primary" onClick={() => { const v = videoRef.current; if (v) void v.play().then(() => setVideoGestureNeeded(false)).catch(() => setVideoProblem("Your browser blocked video playback.")); }}>▶ PLAY CUTSCENE</button>
      </div>}
      <button className="l4-video-skip" onClick={() => { videoRef.current?.pause(); completeDeparture(); }}>
        SKIP VIDEO · VIEW RESULT → {videoSeconds > 0 ? `(${videoSeconds}s)` : ""}
      </button>
    </div>}

    {/* ---------- FOUR OUTCOME-SPECIFIC CINEMATIC STORY SCENES ---------- */}
    {stage === "ending" && g.outcome && !finaleDone && finaleScenes.length > 0 && <UiFinaleCinematic
      outcome={g.outcome} beat={finaleScenes[Math.min(finaleBeat, finaleScenes.length - 1)]}
      index={Math.min(finaleBeat, finaleScenes.length - 1)} total={finaleScenes.length}
      onNext={nextFinale} onSkip={() => { audio.cue("tap"); setFinaleDone(true); }} />}

    {/* ---------- ENDING + MISSION LOG ---------- */}
    {stage === "ending" && g.outcome && finaleDone && !showDebrief && <div className={`l4-overlay l4-end ${ending}`}  role="dialog" aria-modal="true" aria-label="Mission log"><section className="l4-dialog wide">
      <div className="l4-kicker">MISSION LOG · FINAL OUTCOME</div>
      <UiMissionLog save={g} ending={ending} contUnlockedNow={g.replays > 0 || legacy} modelNote={modelNote} />
      <div className="l4-actions">
        <button className="l4-btn l4-primary" onClick={() => { audio.cue("confirm"); setShowDebrief(true); }}>CONTINUE TO MISSION DEBRIEF →</button>
        <button className="l4-btn" onClick={replay}>↺ REPLAY LEVEL 4 · DISCOVER THE OTHER DECISION</button>
      </div>
    </section></div>}

    {/* ---------- FINAL MARS DEBRIEF IMAGE + INTERACTIVE LEARNING ARCHIVE ---------- */}
    {stage === "ending" && !!g.outcome && finaleDone && showDebrief &&
      <MissionDebrief onRestartFromLevel1={restartWholeAdventure} />}

    {/* ---------- PANELS ---------- */}
    {panel === "map" && <UiMap sh={sh} target={target} onTarget={s => { setTarget(s); say("Waypoint set."); }} onClose={() => setPanel("none")} />}
    {panel === "library" && <UiLibrary topic={libTopic} setTopic={setLibTopic} onClose={() => setPanel("none")} />}
    {panel === "help" && <UiDialog kicker="MISSION HELP" title="HOW TO PLAY" cls="panelz">
      <div className="l4-grid">
        <div className="l4-card"><h3>DESKTOP</h3><p>W A S D / arrows: walk · Shift: run · Drag: look around · E: interact · M: map · H: help · Esc: pause</p></div>
        <div className="l4-card"><h3>TOUCH</h3><p>Use the left pad to walk (push fully to run), the RUN and E buttons, and drag the scene to look around.</p></div>
        <div className="l4-card"><h3>EACH INTERVAL</h3><p>Pick ONE job at a station. Read the preview, confirm, then read the debrief. Twelve intervals, one emergency, one final checkpoint.</p></div>
        <div className="l4-card"><h3>ENDINGS</h3><p>Four endings depend only on your final meters. Nothing is random. Replay to find the hidden alternative decision.</p></div></div>
      <div className="l4-actions"><button className="l4-btn l4-primary" onClick={() => setPanel("none")}>CLOSE</button>
        <button className="l4-btn" onClick={replayTutorial} disabled={stage !== "explore"}>REPLAY FIRST-TIME GUIDE</button>
        <button className="l4-btn" onClick={() => { setPanel("library"); }}>NASA SCIENCE LIBRARY</button></div>
      <p className="l4-note">Replaying the guide uses practice values only. It never resets your campaign.</p>
    </UiDialog>}
    {panel === "pause" && <UiDialog kicker="PAUSED" title="MISSION MENU" cls="panelz">
      <label className="row"><span>Music</span><input type="checkbox" checked={musicOn} onChange={e => { setMusicOn(e.target.checked); audio.setMusic(e.target.checked); }} /></label>
      <label className="row"><span>Sound effects</span><input type="checkbox" checked={sfxOn} onChange={e => { setSfxOn(e.target.checked); audio.setSfx(e.target.checked); }} /></label>
      <label className="row"><span>Volume {vol}%</span><input type="range" min={0} max={100} value={vol} onChange={e => { const v = Number(e.target.value); setVol(v); audio.setVolume(v / 100); }} /></label>
      <label className="row"><span>Touch controls</span><input type="checkbox" checked={touchUI} onChange={e => setTouchUI(e.target.checked)} /></label>
      <p className="l4-dim">Character: {modelNote}</p>
      <div className="l4-actions">
        <button className="l4-btn l4-primary" onClick={() => setPanel("none")}>RESUME</button>
        <button className="l4-btn" onClick={() => setPanel("help")}>HELP</button>
        <button className="l4-btn" onClick={() => setPanel("library")}>SCIENCE</button>
        <button className="l4-btn" onClick={replayTutorial} disabled={stage !== "explore"}>REPLAY GUIDE</button>
        {!confirmRestart ? <button className="l4-btn" onClick={() => setConfirmRestart(true)}>RESTART MISSION</button>
          : <button className="l4-btn" onClick={() => { setPanel("none"); restartMission(); }}>CONFIRM RESTART (progress resets)</button>}
      </div>
    </UiDialog>}

    <div className={`l4-fade${fade ? " on" : ""}`} aria-hidden="true" />
    {toast && <div className="l4-toast" role="status">{toast}</div>}
  </div>;
}
export default Level4Mars;
