import type { Card } from "./cards";
import { legalCards, type GameState } from "./engine";

/** Pick a card for the given player using simple, sensible Bhabhi heuristics. */
export function chooseBotCard(state: GameState, playerIdx: number): Card | null {
  const legal = legalCards(state, playerIdx);
  if (legal.length === 0) return null;
  const byRankAsc = [...legal].sort((a, b) => a.rank - b.rank);

  // Leading: play the lowest card, preferring the suit we hold the most of.
  if (state.trick.length === 0) {
    const counts = new Map<string, number>();
    for (const c of legal) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
    const best = [...legal].sort((a, b) => {
      const d = (counts.get(b.suit) ?? 0) - (counts.get(a.suit) ?? 0);
      return d !== 0 ? d : a.rank - b.rank;
    });
    return best[0] ?? null;
  }

  const lead = state.leadSuit!;
  const canFollow = legal[0]!.suit === lead;

  // Cannot follow suit: dump the highest card (thulla).
  if (!canFollow) return byRankAsc[byRankAsc.length - 1] ?? null;

  const currentMax = Math.max(...state.trick.filter((p) => p.card.suit === lead).map((p) => p.card.rank));
  const isLast = state.trick.length === state.trickPlayers.length - 1;

  // Play the highest card that still stays under the current max (ducking).
  const under = byRankAsc.filter((c) => c.rank < currentMax);
  if (under.length > 0) return under[under.length - 1] ?? null;

  // Forced to go over: if last to play, get rid of the biggest; otherwise minimise exposure.
  return (isLast ? byRankAsc[byRankAsc.length - 1] : byRankAsc[0]) ?? null;
}
