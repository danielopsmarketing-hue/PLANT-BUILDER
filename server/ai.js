// Stub AI plant-input planner (Phase 5c/5d). Turns a free-text plant
// description into the same plant-specification shape ai-plan.js expects
// on the client (public/js/ai-plan.js), so the whole prompt -> preview ->
// confirm pipeline is real and testable end to end -- but the "AI" part
// here is deliberately NOT a real language model. Per the phased
// instructions, Phase 5d (wiring an actual LLM provider) stays a stub
// until a provider/API-key decision is made; this is that stub.
//
// What it actually does: splits the prompt into rough phrases on common
// separators/connector words, and for each phrase calls db.search (the
// same search_equipment lookup an eventual real AI would call) to find
// the single best-matching real catalog item -- so it can never invent
// equipment, same guarantee as the real thing will have. Phrases with no
// match are dropped and reported back, not guessed at. Matched items are
// chained in the order their phrases appeared in the prompt.

const db = require("./db");

const MAX_STAGES = 10;
const SPLIT_PATTERN = /,|;|\n|\bthen\b|\binto\b|\bfeeding\b|\bfeeds\b|\bto an?\b|\bfollowed by\b|->/gi;

function splitIntoPhrases(prompt) {
  return (prompt || "")
    .split(SPLIT_PATTERN)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STAGES);
}

function planFromPrompt(prompt) {
  const phrases = splitIntoPhrases(prompt);
  const equipment = [];
  const unmatchedPhrases = [];

  phrases.forEach((phrase, i) => {
    const [match] = db.search(phrase, { limit: 1 });
    if (match) {
      equipment.push({ ref: `e${i + 1}`, equipmentId: match.id, matchedPhrase: phrase, matchedName: match.name });
    } else {
      unmatchedPhrases.push(phrase);
    }
  });

  const connections = [];
  for (let i = 0; i < equipment.length - 1; i++) {
    connections.push({ from: equipment[i].ref, to: equipment[i + 1].ref });
  }

  return {
    spec: {
      equipment: equipment.map(({ ref, equipmentId }) => ({ ref, equipmentId })),
      connections,
    },
    matched: equipment.map(({ ref, matchedPhrase, matchedName }) => ({ ref, phrase: matchedPhrase, name: matchedName })),
    unmatchedPhrases,
    stub: true,
  };
}

module.exports = { planFromPrompt };
