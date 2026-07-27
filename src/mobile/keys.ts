/**
 * Tiny mobile key store.
 *
 * OpenRouter has no Rust backend on mobile yet, so its key lives in
 * localStorage until mobile Luna lands. Fish keys are pushed straight to the
 * Rust credential store via provider.setFishCredential — we only remember
 * simple UI flags (e.g. the one-time Fish prompt dismissal) here.
 */

const OPENROUTER_KEY = "cadmium.mobile.openrouterKey";
const FISH_PROMPT_DISMISSED = "cadmium.mobile.fishPromptDismissed";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable; ignore */
  }
}

export function getOpenRouterKey(): string | null {
  return safeGet(OPENROUTER_KEY);
}

export function setOpenRouterKey(key: string | null): void {
  safeSet(OPENROUTER_KEY, key && key.trim() ? key.trim() : null);
}

export function isFishPromptDismissed(): boolean {
  return safeGet(FISH_PROMPT_DISMISSED) === "1";
}

export function dismissFishPrompt(): void {
  safeSet(FISH_PROMPT_DISMISSED, "1");
}
