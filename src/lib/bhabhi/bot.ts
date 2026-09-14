import type { Card, Suit } from "./cards";
import { isLegal, legalCards, type GameState } from "./engine";

const jitter = (n = 1) => Math.random() * n;

/**
 * Pick a card for the given player. Always returns a card that is legal
 * *right now* according to the engine, recomputed from the live hand, so a
 * bot can never replay a card it no longer holds or loop on an illegal move.
 */
export function chooseBotCard(state: GameState, playerIdx: number): Card | null {
  const legal = legalCards(state, playerIdx);
  if (legal.length === 0) return null;

  const pick = decide(state, playerIdx, legal);
  // Belt and braces: if a heuristic ever produced a stale card, fall back to a legal one.
  if (!pick || !isLegal(state, playerIdx, pick.id)) return legal[0] ?? null;
  return pick;
}

function decide(state: GameState, me: number, legal: Card[]): Card | undefined {
  const hand = state.players[me]!.hand;
  const opponentsStillToPlay = state.trickPlayers.filter(
    (p) => p !== me && !state.trick.some((t) => t.player === p),
  );
  const voidIn = (p: number, s: Suit) => (state.voids[p] ?? []).includes(s);
  const suitCount = (s: Suit) => hand.filter((c) => c.suit === s).length;
  const byRankAsc = [...legal].sort((a, b) => a.rank - b.rank);

  // ── Leading ────────────────────────────────────────────────────────────
  if (state.trick.length === 0) {
    if (state.firstTrick) return legal[0];
    const others = state.trickPlayers.filter((p) => p !== me);
    // Lower score = better lead. Avoid suits an opponent is void in (they'd
    // throw a Thulla and we might eat it), prefer low cards and long suits.
    const scored = legal.map((c) => {
      const danger = others.filter((p) => voidIn(p, c.suit)).length;
      const highestInSuit = Math.max(...hand.filter((h) => h.suit === c.suit).map((h) => h.rank));
      let score = c.rank;
      score += danger * (c.rank > 7 ? 25 : 8);
      score -= suitCount(c.suit) * 1.5;
      if (c.rank === highestInSuit && suitCount(c.suit) > 1) score += 3; // keep control cards
      score += jitter(2.5);
      return { c, score };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0]?.c;
  }

  const lead = state.leadSuit!;
  const canFollow = legal[0]!.suit === lead;

  // ── Cannot follow: throw a Thulla, dump the most dangerous card ────────
  if (!canFollow) {
    const scored = legal.map((c) => ({
      c,
      score: c.rank * 2 + (suitCount(c.suit) === 1 ? 6 : 0) + jitter(3),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.c;
  }

  // ── Following suit ─────────────────────────────────────────────────────
  const currentMax = Math.max(...state.trick.filter((p) => p.card.suit === lead).map((p) => p.card.rank));
  const isLast = opponentsStillToPlay.length === 0;
  const thullaRisk = opponentsStillToPlay.some((p) => voidIn(p, lead));
  const under = byRankAsc.filter((c) => c.rank < currentMax);

  if (under.length > 0) {
    // Duck: play the highest card that still loses. If someone still to play
    // is void, ducking is essential; otherwise occasionally shed the lowest to
    // keep mid cards for later ducks.
    if (!thullaRisk && under.length > 2 && Math.random() < 0.25) return under[0];
    return under[under.length - 1];
  }

  // Forced to go over the current max.
  if (isLast) {
    // Winning a clean trick just means leading next; dump the biggest card.
    return byRankAsc[byRankAsc.length - 1];
  }
  // Others still to play: minimise exposure unless it's the last card of the suit anyway.
  return byRankAsc[0];
}
