export const SUITS = ["♠", "♥", "♣", "♦"] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  id: string;
  suit: Suit;
  rank: number; // 2..14 (14 = Ace)
}

export const SUIT_NAMES: Record<Suit, string> = {
  "♠": "Spades",
  "♥": "Hearts",
  "♣": "Clubs",
  "♦": "Diamonds",
};

export const rankLabel = (r: number): string =>
  ({ 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[r] ?? String(r);

export const cardLabel = (c: Card) => `${rankLabel(c.rank)}${c.suit}`;

export const isRed = (s: Suit) => s === "♥" || s === "♦";

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ id: `${rank}${suit}`, suit, rank });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const s = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return s !== 0 ? s : b.rank - a.rank;
  });
}

export const ACE_OF_SPADES = "14♠";
