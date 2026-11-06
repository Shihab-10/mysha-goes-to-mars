/** Small save record for story continuity, shared with later levels. */
export type StoryProgress = {
  engineerNoteReceived: boolean;
  level1DepartureSeen: boolean;
  level1Complete: boolean;
};

export const ENGINEER_NOTE_TITLE = "ENGINEER'S NOTE — PRIVATE MISSION ITEM";
export const ENGINEER_NOTE_TEXT = "Mars never goes according to plan. Keep your eyes open.";

const STORAGE_KEY = "mysha-goes-to-mars:story:v1";
const defaults: StoryProgress = {
  engineerNoteReceived: false,
  level1DepartureSeen: false,
  level1Complete: false,
};
let memory: StoryProgress = { ...defaults };

export function readStoryProgress(): StoryProgress {
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === "object") {
          const item = value as Partial<StoryProgress>;
          memory = {
            engineerNoteReceived: item.engineerNoteReceived === true || memory.engineerNoteReceived,
            level1DepartureSeen: item.level1DepartureSeen === true || memory.level1DepartureSeen,
            level1Complete: item.level1Complete === true || memory.level1Complete,
          };
        }
      }
    }
  } catch {
    // Private browsing can block localStorage; memory still works this session.
  }
  return { ...memory };
}

export function updateStoryProgress(patch: Partial<StoryProgress>): StoryProgress {
  memory = { ...readStoryProgress(), ...patch };
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    }
  } catch {
    // The in-memory copy remains usable if storage is unavailable.
  }
  return { ...memory };
}
