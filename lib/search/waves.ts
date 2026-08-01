// Pure wave planning, split out so the widening strategy is testable without a network call.
//
// A wave is the unit of "look harder". Volume is reached by covering more phrases and deeper
// pages — never by loosening the filter or the scoring gate, which are identical in every wave.

// Four rather than three: each phrase is one query per venue, and the fan-out is parallel, so a
// wider wave costs almost nothing in wall-clock time while covering more of the real vocabulary.
export const PHRASES_PER_WAVE = 4;

// Interleaves the two phrase pools so each wave mixes "shopping right now" with "describing the
// pain". A previous build concatenated them and then sliced to two, which meant problemPhrases
// were never searched at all.
export function buildPhrasePool(seekingPhrases: string[], problemPhrases: string[]): string[] {
  const pool: string[] = [];
  const maxLen = Math.max(seekingPhrases.length, problemPhrases.length);
  for (let i = 0; i < maxLen; i++) {
    if (seekingPhrases[i]) pool.push(seekingPhrases[i]);
    if (problemPhrases[i]) pool.push(problemPhrases[i]);
  }
  return pool.filter(Boolean);
}

// Once the phrase pool is exhausted it wraps and moves to the next page, so waves keep reaching
// genuinely new results instead of stalling on the same ones.
export function planWave(pool: string[], wave: number): { phrases: string[]; page: number } {
  if (pool.length === 0) return { phrases: [], page: 1 };
  const offset = (wave * PHRASES_PER_WAVE) % pool.length;
  const phrases = Array.from({ length: Math.min(PHRASES_PER_WAVE, pool.length) }, (_, i) => pool[(offset + i) % pool.length]);
  const page = 1 + Math.floor((wave * PHRASES_PER_WAVE) / pool.length);
  return { phrases, page };
}
