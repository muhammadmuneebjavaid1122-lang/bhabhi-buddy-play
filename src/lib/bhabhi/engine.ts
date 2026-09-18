import { ACE_OF_SPADES, createDeck, shuffle, sortHand, cardLabel, type Card, type Suit } from "./cards";

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  hand: Card[];
}

export interface Play {
  player: number;
  card: Card;
}

export type GameEvent =
  | { type: "play"; player: number; card: Card; thulla: boolean }
  | { type: "thulla"; picker: number; count: number; thrower: number }
  | { type: "trick"; winner: number }
  | { type: "getaway"; player: number }
  | { type: "over"; loser: number | null }
  | null;

export type Phase = "playing" | "resolving" | "over";

export interface GameState {
  players: Player[];
  turn: number;
  trick: Play[];
  trickPlayers: number[];
  leadSuit: Suit | null;
  discardCount: number;
  phase: Phase;
  finished: number[];
  loser: number | null;
  log: string[];
  firstTrick: boolean;
  trickNo: number;
  event: GameEvent;
  eventSeq: number;
  /** Suits each player is known to be out of (learned from off-suit plays). */
  voids: Record<number, Suit[]>;
}

export type Action =
  | { type: "PLAY_CARD"; player: number; cardId: string }
  | { type: "RESOLVE_TRICK" }
  | { type: "NEW_GAME" };

const BOT_NAMES = [
  "Aarav", "Aisha", "Ali", "Amara", "Arjun", "Daniyal", "Fatima", "Hamza",
  "Hira", "Ibrahim", "Kabir", "Layla", "Maya", "Noor", "Omar", "Priya",
  "Rayan", "Sara", "Veer", "Zara",
];

function randomPlayerNames(): string[] {
  const names = shuffle(BOT_NAMES).slice(0, 3);
  return ["You", ...names];
}

export function newGame(): GameState {
  const deck = shuffle(createDeck());
  const players: Player[] = randomPlayerNames().map((name, id) => ({
    id,
    name,
    isHuman: id === 0,
    hand: sortHand(deck.slice(id * 13, id * 13 + 13)),
  }));
  const starter = players.findIndex((p) => p.hand.some((c) => c.id === ACE_OF_SPADES));
  return {
    players,
    turn: starter,
    trick: [],
    trickPlayers: [0, 1, 2, 3],
    leadSuit: null,
    discardCount: 0,
    phase: "playing",
    finished: [],
    loser: null,
    log: [`New deal. ${players[starter]!.name} ${starter === 0 ? "hold" : "holds"} the Ace of Spades and must lead it.`],
    firstTrick: true,
    trickNo: 1,
    event: null,
    eventSeq: 0,
    voids: { 0: [], 1: [], 2: [], 3: [] },
  };
}

export function legalCards(state: GameState, playerIdx: number): Card[] {
  const hand = state.players[playerIdx]!.hand;
  if (state.phase !== "playing" || state.turn !== playerIdx) return [];
  if (state.trick.length === 0) {
    if (state.firstTrick) return hand.filter((c) => c.id === ACE_OF_SPADES);
    return hand;
  }
  const followers = hand.filter((c) => c.suit === state.leadSuit);
  return followers.length > 0 ? followers : hand;
}

export function isLegal(state: GameState, playerIdx: number, cardId: string) {
  return legalCards(state, playerIdx).some((c) => c.id === cardId);
}

function nextActive(state: GameState, from: number, hands: Player[]): number {
  for (let i = 1; i <= 4; i++) {
    const idx = (from + i) % 4;
    if (hands[idx]!.hand.length > 0) return idx;
  }
  return from;
}

function highestOfLead(trick: Play[], lead: Suit): Play {
  return trick
    .filter((p) => p.card.suit === lead)
    .reduce((best, p) => (p.card.rank > best.card.rank ? p : best));
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "NEW_GAME":
      return newGame();

    case "PLAY_CARD": {
      const { player, cardId } = action;
      if (!isLegal(state, player, cardId)) return state;
      const card = state.players[player]!.hand.find((c) => c.id === cardId)!;
      const players = state.players.map((p, i) =>
        i === player ? { ...p, hand: p.hand.filter((c) => c.id !== cardId) } : p,
      );
      const leadSuit = state.leadSuit ?? card.suit;
      const trick = [...state.trick, { player, card }];
      const thulla = card.suit !== leadSuit && !state.firstTrick;
      const log = [...state.log, `${state.players[player]!.name} played ${cardLabel(card)}${thulla ? " — THULLA!" : ""}`];
      const complete = thulla || trick.length >= state.trickPlayers.length;
      const offSuit = state.trick.length > 0 && card.suit !== leadSuit;
      const voids = offSuit && !(state.voids[player] ?? []).includes(leadSuit)
        ? { ...state.voids, [player]: [...(state.voids[player] ?? []), leadSuit] }
        : state.voids;
      return {
        ...state,
        players,
        voids,
        trick,
        leadSuit,
        log,
        phase: complete ? "resolving" : "playing",
        turn: complete ? state.turn : nextActive(state, player, players),
        event: { type: "play", player, card, thulla },
        eventSeq: state.eventSeq + 1,
      };
    }

    case "RESOLVE_TRICK": {
      if (state.phase !== "resolving" || !state.leadSuit) return state;
      const lead = state.leadSuit;
      const winnerPlay = highestOfLead(state.trick, lead);
      const winner = winnerPlay.player;
      const thullaPlay = state.trick.find((p) => p.card.suit !== lead);
      const isThulla = !!thullaPlay && !state.firstTrick;

      let players = state.players;
      let discardCount = state.discardCount;
      let voids = state.voids;
      const log = [...state.log];
      let event: GameEvent;

      if (isThulla) {
        const picked = state.trick.map((p) => p.card);
        players = players.map((p, i) =>
          i === winner ? { ...p, hand: sortHand([...p.hand, ...picked]) } : p,
        );
        // The picker now holds these suits again, so forget their voids for them.
        const pickedSuits = new Set(picked.map((c) => c.suit));
        voids = { ...voids, [winner]: (voids[winner] ?? []).filter((s) => !pickedSuits.has(s)) };
        log.push(`${state.players[winner]!.name} had the highest ${lead} and picks up ${picked.length} cards.`);
        event = { type: "thulla", picker: winner, count: picked.length, thrower: thullaPlay!.player };
      } else {
        discardCount += state.trick.length;
        log.push(`${state.players[winner]!.name} won the trick with ${cardLabel(winnerPlay.card)}.`);
        event = { type: "trick", winner };
      }

      // Getaway detection
      const finished = [...state.finished];
      for (const p of players) {
        if (p.hand.length === 0 && !finished.includes(p.id)) {
          finished.push(p.id);
          log.push(`${p.name} got away!`);
          event = { type: "getaway", player: p.id };
        }
      }

      const remaining = players.filter((p) => p.hand.length > 0).map((p) => p.id);
      if (remaining.length <= 1) {
        const loser = remaining[0] ?? null;
        log.push(loser === null ? "Everyone got away — no Bhabhi this round!" : `${players[loser]!.name} ${loser === 0 ? "are" : "is"} the Bhabhi!`);
        return {
          ...state,
          players,
          voids,
          discardCount,
          finished,
          loser,
          log,
          trick: [],
          leadSuit: null,
          phase: "over",
          event: { type: "over", loser },
          eventSeq: state.eventSeq + 1,
        };
      }

      const turn = players[winner]!.hand.length > 0 ? winner : nextActive(state, winner, players);
      return {
        ...state,
        players,
        voids,
        discardCount,
        finished,
        log,
        trick: [],
        leadSuit: null,
        trickPlayers: remaining,
        turn,
        firstTrick: false,
        trickNo: state.trickNo + 1,
        phase: "playing",
        event,
        eventSeq: state.eventSeq + 1,
      };
    }
  }
  return state;
}
