/**
 * Token names and symbols come straight off-chain and are attacker-controlled.
 * On a link meant to be shared publicly, a handful of them are slurs or explicit
 * — so they are masked behind a reveal by default.
 *
 * This is a display filter, never a claim about a token's safety. It also does
 * not touch the data: the raw string stays one click away, and nothing is
 * removed from the API responses.
 */

// Matched as whole words (or with common leetspeak substitutions) so ordinary
// names like "Scunthorpe" or "Analysis" are not caught.
const BLOCKED = [
  "anal", "anus", "arse", "ass", "asshole", "bastard", "bitch", "blowjob",
  "boner", "boob", "boobs", "bollock", "bollocks", "clit", "cock", "coon",
  "cum", "cunt", "dick", "dildo", "dyke", "ejaculate", "erection", "fag",
  "faggot", "fap", "fellatio", "fuck", "fucker", "fucking", "gook", "handjob",
  "hentai", "horny", "incest", "jizz", "kike", "labia", "milf", "molest",
  "nigga", "nigger", "nipple", "nudes", "orgasm", "orgy", "paki", "pedo",
  "penis", "porn", "pussy", "queer", "rape", "rapist", "retard", "rimjob",
  "scrotum", "semen", "sex", "shit", "slut", "spic", "sperm", "testicle",
  "tit", "tits", "titty", "tranny", "twat", "vagina", "whore", "wank",
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
};

function normalise(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

const BLOCKED_SET = new Set(BLOCKED);

/** True when the string contains a blocked term as a discrete word. */
export function isCrude(input?: string | null): boolean {
  if (!input) return false;
  const words = normalise(input).split(/\s+/).filter(Boolean);
  if (words.some((w) => BLOCKED_SET.has(w))) return true;

  // Also catch the term run together with other characters, e.g. "GIANTTITS",
  // but only for terms long enough that substring matching is not noisy.
  const joined = words.join("");
  return BLOCKED.some((term) => term.length >= 4 && joined.includes(term));
}

export const SAFE_MODE_KEY = "refract.safeMode";

export function loadSafeMode(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SAFE_MODE_KEY) !== "off";
  } catch {
    return true; // storage blocked — stay on the cautious default
  }
}

export function saveSafeMode(on: boolean) {
  try {
    localStorage.setItem(SAFE_MODE_KEY, on ? "on" : "off");
  } catch {
    /* session-only */
  }
}
