import { useEffect, useReducer, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isLegal, legalCards, newGame, reducer, type GameState } from "@/lib/bhabhi/engine";
import { chooseBotCard } from "@/lib/bhabhi/bot";
import { sfx } from "@/lib/bhabhi/sound";
import { cardLabel } from "@/lib/bhabhi/cards";
import { PlayingCard } from "./PlayingCard";
import { ChatPanel, ReactionLayer, SpeechBubble, StickerDrawer, useSocial, type ChatMsg } from "./social";

type Speed = "slow" | "normal" | "fast";
const SPEED_MS: Record<Speed, number> = { slow: 1100, normal: 650, fast: 220 };

// Seat positions: 0 = South (human), 1 = West, 2 = North, 3 = East
const SEAT = ["bottom", "left", "top", "right"] as const;

export function GameTable({ onGameOver }: { onGameOver?: () => void } = {}) {
  const [state, dispatch] = useReducer(reducer, undefined, newGame);
  const reportedOver = useRef(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [sound, setSound] = useState(true);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [banner, setBanner] = useState<{ text: string; tone: "thulla" | "good" | "neutral" } | null>(null);
  const [thullaBurst, setThullaBurst] = useState<{ picker: string; count: number } | null>(null);
  const [flyingThullaCard, setFlyingThullaCard] = useState<string | null>(null);
  const [thullaImpact, setThullaImpact] = useState(false);
  const lastSeq = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const { reactions, chat, bubbles, humanSay, humanReact } = useSocial(state, sound);

  const delay = autoPlay ? Math.min(SPEED_MS[speed], 300) : SPEED_MS[speed];
  const human = state.players[0]!;
  const playable = new Set(legalCards(state, 0).map((c) => c.id));
  const humanTurn = state.phase === "playing" && state.turn === 0 && !autoPlay;

  // Bot / auto turns and trick resolution timers.
  // Keyed on the engine's event counter + turn so every state transition
  // schedules exactly one fresh decision from the *live* hand.
  useEffect(() => {
    if (state.phase === "over") {
      if (!reportedOver.current) {
        reportedOver.current = true;
        onGameOver?.();
      }
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (state.phase === "resolving") {
      const isThulla = state.trick.some((p) => p.card.suit !== state.leadSuit) && !state.firstTrick;
      timers.push(setTimeout(() => dispatch({ type: "RESOLVE_TRICK" }), delay * (isThulla ? 2.2 : 1.4)));
    } else {
      const p = state.players[state.turn]!;
      if (!p.isHuman || autoPlay) {
        const seatIdx = state.turn;
        const seq = state.eventSeq;
        const act = (fallback: boolean) => {
          const live = stateRef.current;
          // Stale timer guard: only act if the game hasn't moved on.
          if (live.eventSeq !== seq || live.phase !== "playing" || live.turn !== seatIdx) return;
          let card = fallback ? null : chooseBotCard(live, seatIdx);
          if (!card || !isLegal(live, seatIdx, card.id)) card = legalCards(live, seatIdx)[0] ?? null;
          if (card) dispatch({ type: "PLAY_CARD", player: seatIdx, cardId: card.id });
        };
        timers.push(setTimeout(() => act(false), delay));
        // Watchdog: if the move somehow didn't register, force a legal play.
        timers.push(setTimeout(() => act(true), delay * 3 + 500));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [state.eventSeq, state.phase, state.turn, autoPlay, delay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound + banner feedback
  useEffect(() => {
    if (state.eventSeq === lastSeq.current || !state.event) return;
    lastSeq.current = state.eventSeq;
    const ev = state.event;
    const names = state.players.map((p) => p.name);
    let bannerTimeout: ReturnType<typeof setTimeout> | undefined;
    const effectTimers: ReturnType<typeof setTimeout>[] = [];
    const show = (text: string, tone: "thulla" | "good" | "neutral", ms = 1400) => {
      setBanner({ text, tone });
      bannerTimeout = setTimeout(() => setBanner(null), ms);
    };
    switch (ev.type) {
      case "play":
        if (sound) sfx.play();
        if (ev.thulla) {
          setFlyingThullaCard(ev.card.id);
          setThullaImpact(false);
          effectTimers.push(setTimeout(() => setThullaImpact(true), 680));
          effectTimers.push(setTimeout(() => setThullaImpact(false), 1250));
          effectTimers.push(setTimeout(() => setFlyingThullaCard(null), 1450));
          show("THULLA!", "thulla", delay * 2);
        }
        break;
      case "thulla":
        if (sound) sfx.thulla();
        setThullaBurst({ picker: names[ev.picker] ?? "Player", count: ev.count });
        setTimeout(() => setThullaBurst(null), 1800);
        show(`${names[ev.picker]} ${ev.picker === 0 ? "pick" : "picks"} up ${ev.count} cards`, "thulla");
        break;
      case "trick":
        if (sound) sfx.trick();
        break;
      case "getaway":
        if (sound) sfx.getaway();
        show(`${names[ev.player]} got away!`, "good");
        break;
      case "over":
        if (sound) (ev.loser === 0 ? sfx.lose : sfx.win)();
        break;
    }
    return () => {
      clearTimeout(bannerTimeout);
      effectTimers.forEach(clearTimeout);
    };
  }, [state, sound, delay]);

  const statusText = (() => {
    if (state.phase === "over") return state.loser === null ? "Everyone got away!" : `${state.players[state.loser]!.name} ${state.loser === 0 ? "are" : "is"} the Bhabhi`;
    if (state.phase === "resolving") return "Resolving trick…";
    if (state.turn === 0 && !autoPlay) {
      if (state.firstTrick && state.trick.length === 0) return "Lead the Ace of Spades";
      return state.leadSuit && playable.size < human.hand.length ? `Your turn — follow ${state.leadSuit}` : "Your turn — play any card";
    }
    return `${state.players[state.turn]!.name} is thinking…`;
  })();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gold/20 px-4 py-3 md:px-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-gold md:text-3xl">Bhabhi</h1>
          <p className="text-xs text-muted-foreground">Thulla · Getaway · Trick {state.trickNo} · {state.discardCount} cards discarded</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Toggle active={autoPlay} onClick={() => setAutoPlay((v) => !v)} label={autoPlay ? "Quick-play: ON" : "Quick-play"} title="Let a bot play your hand" />
          <Toggle active={sound} onClick={() => setSound((v) => !v)} label={sound ? "Sound on" : "Sound off"} />
          <div className="flex overflow-hidden rounded-full border border-gold/30">
            {(["slow", "normal", "fast"] as Speed[]).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn("px-3 py-1 capitalize transition-colors", speed === s ? "bg-gold text-gold-foreground" : "text-gold hover:bg-gold/10")}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => dispatch({ type: "NEW_GAME" })}
            className="rounded-full bg-primary px-4 py-1.5 font-medium text-primary-foreground shadow transition hover:brightness-110"
          >
            New deal
          </button>
        </div>
      </header>

      {/* Table */}
      <main className="relative flex flex-1 flex-col items-center px-2 py-4 md:px-8">
        <div className="relative w-full max-w-6xl">
          <div className={cn("relative aspect-[4/5] min-h-[34rem] w-full overflow-hidden rounded-[2.25rem] border-[12px] border-table-rim bg-felt shadow-[inset_0_0_120px_var(--table-inner-shadow),0_30px_60px_var(--table-drop-shadow)] sm:aspect-[4/3] sm:min-h-0 md:aspect-[16/10] md:rounded-[4rem] md:border-[16px]", thullaBurst && "animate-thulla-table", thullaImpact && "animate-thulla-impact")}> 
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--felt-highlight),transparent_68%)]" />
            <div className="pointer-events-none absolute inset-2 rounded-[1.6rem] border border-gold/15 md:rounded-[3rem]" />

            {/* Seats */}
            {state.players.map((p) => (
              <Seat
                key={p.id}
                state={state}
                playerIdx={p.id}
                position={SEAT[p.id]!}
                bubble={bubbles[p.id]}
              />
            ))}

            <ReactionLayer reactions={reactions} />

            {thullaBurst && (
              <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden" aria-live="assertive">
                <div className="absolute inset-0 animate-thulla-flash bg-destructive/35" />
                {Array.from({ length: Math.min(thullaBurst.count, 7) }).map((_, index) => (
                  <span key={index} className="absolute text-4xl animate-thulla-card" style={{ "--thulla-i": index } as React.CSSProperties}>🂠</span>
                ))}
                <div className="relative animate-thulla-slam text-center">
                  <p className="font-display text-5xl font-bold text-destructive-foreground drop-shadow-2xl md:text-7xl">THULLA!</p>
                  <p className="mt-2 rounded-full bg-background/80 px-5 py-2 font-bold text-foreground">{thullaBurst.picker} takes {thullaBurst.count}</p>
                </div>
              </div>
            )}

            {/* Trick area */}
            <div className="absolute left-1/2 top-1/2 h-[42%] w-[54%] -translate-x-1/2 -translate-y-1/2 md:h-[48%] md:w-[48%]">
              {state.trick.map((play, i) => {
                const pos = trickPos(play.player);
                return (
                  <div
                    key={play.card.id}
                    className={cn(
                      "absolute animate-in fade-in zoom-in-75 duration-300",
                      flyingThullaCard === play.card.id && "thulla-airborne",
                      thullaImpact && flyingThullaCard !== play.card.id && "animate-card-judder",
                    )}
                    style={{ ...pos, zIndex: i + 1 }}
                  >
                    <PlayingCard card={play.card} size="table" style={{ transform: `rotate(${(play.player * 37) % 15 - 7}deg)` }} />
                  </div>
                );
              })}
              {state.trick.length === 0 && state.phase !== "over" && (
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="rounded-full border border-gold/30 bg-background/25 px-4 py-2 text-center font-display text-sm text-gold/90 backdrop-blur-sm">
                    {statusText}
                  </div>
                </div>
              )}
            </div>

            {/* Discard pile */}
             <div className="absolute bottom-4 right-4 flex flex-col items-center gap-1 md:bottom-7 md:right-8">
               <div className="relative h-[5.25rem] w-[3.75rem]">
                {Array.from({ length: Math.min(4, Math.ceil(state.discardCount / 4)) }).map((_, i) => (
                  <PlayingCard key={i} faceDown size="sm" className="absolute" style={{ top: -i * 2, left: -i * 2 }} />
                ))}
                  {state.discardCount === 0 && <div className="h-[5.25rem] w-[3.75rem] rounded-md border border-dashed border-gold/30" />}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gold/70">Discard {state.discardCount}</span>
            </div>

            {/* Lead suit badge */}
            {state.leadSuit && (
                 <div className="absolute left-4 top-4 rounded-full bg-background/30 px-3 py-1 text-xs text-gold md:left-6 md:top-6">
                Lead: <span className="text-base">{state.leadSuit}</span>
              </div>
            )}

            {/* Banner */}
            {banner && (
              <div className="pointer-events-none absolute inset-x-0 top-[38%] z-30 flex justify-center animate-in fade-in slide-in-from-top-4 duration-300">
                <div
                  className={cn(
                    "rounded-2xl px-6 py-3 font-display text-xl font-bold tracking-wide shadow-2xl md:text-3xl",
                    banner.tone === "thulla" && "bg-destructive text-destructive-foreground animate-pulse",
                    banner.tone === "good" && "bg-gold text-gold-foreground",
                    banner.tone === "neutral" && "bg-black/60 text-foreground",
                  )}
                >
                  {banner.text}
                </div>
              </div>
            )}

            {/* Game over overlay */}
            {state.phase === "over" && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
                <div className="mx-4 rounded-3xl border border-gold/40 bg-card p-8 text-center shadow-2xl animate-in zoom-in-90 duration-500">
                  <p className="font-display text-sm uppercase tracking-[0.3em] text-gold">Game over</p>
                  <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">
                    {state.loser === 0 ? "You are the Bhabhi!" : state.loser === null ? "Nobody is the Bhabhi!" : `${state.players[state.loser]!.name} is the Bhabhi`}
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    {state.loser === 0 ? "Better luck next deal." : "You got away safely."}
                  </p>
                  <ol className="mt-4 space-y-1 text-left text-sm">
                    {state.finished.map((id, i) => (
                      <li key={id} className="flex justify-between gap-6">
                        <span>{i + 1}. {state.players[id]!.name}</span>
                        <span className="text-gold">Got away</span>
                      </li>
                    ))}
                    {state.loser !== null && (
                      <li className="flex justify-between gap-6">
                        <span>{state.finished.length + 1}. {state.players[state.loser]!.name}</span>
                        <span className="text-destructive">Bhabhi</span>
                      </li>
                    )}
                  </ol>
                  <button
                    onClick={() => dispatch({ type: "NEW_GAME" })}
                    className="mt-6 rounded-full bg-gold px-6 py-2 font-semibold text-gold-foreground shadow hover:brightness-110"
                  >
                    Deal again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Human hand */}
        <section className="mt-6 w-full max-w-6xl" aria-label="Your hand">
          <div className="mb-2 flex items-center justify-between px-2 text-sm">
            <span className={cn("font-display", humanTurn ? "text-gold" : "text-muted-foreground")}>
              {humanTurn ? statusText : `Your hand · ${human.hand.length} cards`}
            </span>
            {humanTurn && <span className="text-xs text-muted-foreground">Highlighted cards are playable</span>}
          </div>
          <div className="flex h-48 items-end justify-center overflow-visible md:h-52">
            {human.hand.map((card, i) => {
              const n = human.hand.length;
              const mid = (n - 1) / 2;
              const rot = (i - mid) * Math.min(4, 60 / Math.max(n, 1));
              const lift = Math.abs(i - mid) * Math.min(3, 40 / Math.max(n, 1));
              const ok = playable.has(card.id) && !autoPlay;
              return (
                <PlayingCard
                  key={card.id}
                  card={card}
                  size="lg"
                  highlight={ok}
                  disabled={!ok}
                  onClick={() => ok && dispatch({ type: "PLAY_CARD", player: 0, cardId: card.id })}
                  className={cn("origin-bottom -mx-5 sm:-mx-4 md:-mx-3", !ok && humanTurn && "opacity-45 saturate-50", !humanTurn && "opacity-90")}
                  style={{ transform: `rotate(${rot}deg) translateY(${lift}px)`, zIndex: i }}
                />
              );
            })}
            {human.hand.length === 0 && state.phase !== "over" && (
              <p className="pb-10 font-display text-gold">You got away — watching the rest play out.</p>
            )}
          </div>
        </section>

        {/* Reactions + chat */}
        <div className="mt-4 flex w-full max-w-5xl items-start gap-3">
          <div className="min-w-0 flex-1"><ChatPanel chat={chat} names={state.players.map((p) => p.name)} onSend={humanSay} /></div>
          <StickerDrawer onPick={humanReact} />
        </div>

        <details className="mt-3 w-full max-w-5xl text-xs text-muted-foreground">
          <summary className="cursor-pointer font-display text-gold/80">How to play</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>52 cards, 13 each. Whoever holds the Ace of Spades leads it to start.</li>
            <li>You must follow the lead suit if you can. Highest card of the lead suit wins the trick, the cards are discarded, and the winner leads next.</li>
            <li>If you cannot follow suit you throw a <strong>Thulla</strong>: the trick ends at once and whoever played the highest card of the lead suit picks up every card in it and leads next.</li>
            <li>The first trick is safe — no pickups. Empty your hand to <strong>get away</strong>. The last player holding cards is the <strong>Bhabhi</strong>.</li>
          </ul>
        </details>
      </main>
    </div>
  );
}

function Toggle({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 transition-colors",
        active ? "border-gold bg-gold text-gold-foreground" : "border-gold/30 text-gold hover:bg-gold/10",
      )}
    >
      {label}
    </button>
  );
}

function trickPos(player: number): React.CSSProperties {
  switch (player) {
    case 0: return { left: "50%", bottom: 0, transform: "translateX(-50%)" };
    case 1: return { left: 0, top: "50%", transform: "translateY(-50%)" };
    case 2: return { left: "50%", top: 0, transform: "translateX(-50%)" };
    default: return { right: 0, top: "50%", transform: "translateY(-50%)" };
  }
}

function Seat({ state, playerIdx, position, bubble }: { state: GameState; playerIdx: number; position: (typeof SEAT)[number]; bubble?: ChatMsg | undefined }) {
  const p = state.players[playerIdx]!;
  const isTurn = state.phase === "playing" && state.turn === playerIdx;
  const out = p.hand.length === 0 && state.finished.includes(playerIdx);
  const isLoser = state.loser === playerIdx;
  const lastPlay = state.trick.find((t) => t.player === playerIdx);

  const posClass = {
    bottom: "bottom-3 left-1/2 -translate-x-1/2 flex-row",
    top: "top-3 left-1/2 -translate-x-1/2 flex-row",
    left: "left-3 top-1/2 -translate-y-1/2 flex-col",
    right: "right-3 top-1/2 -translate-y-1/2 flex-col",
  }[position];

  const vertical = position === "left" || position === "right";
  const backs = Math.min(p.hand.length, 8);

  return (
    <div className={cn("absolute z-10 flex items-center gap-2", posClass)}>
      <div className={cn("flex items-center gap-2", vertical && "flex-col")}>
        <div className="relative">
          <SpeechBubble msg={bubble} position={position} />
          <div
            className={cn(
               "relative flex h-12 w-12 items-center justify-center rounded-full border-2 font-display text-lg font-bold transition-all md:h-16 md:w-16 md:text-xl",
               isTurn ? "scale-110 border-gold bg-gold text-gold-foreground shadow-[0_0_24px_var(--turn-glow)]" : "border-gold/40 bg-background/30 text-gold",
              out && "opacity-50",
              isLoser && "border-destructive bg-destructive text-destructive-foreground",
            )}
            aria-label={`${p.name}${isTurn ? " (current turn)" : ""}`}
          >
            {p.name[0]}
            {isTurn && <span className="absolute -inset-1 animate-ping rounded-full border-2 border-gold/60" />}
          </div>
        </div>
        <div className={cn("text-center text-xs leading-tight", vertical ? "w-16" : "text-left")}>
          <div className={cn("font-display font-semibold", isTurn ? "text-gold" : "text-foreground/90")}>{p.name}</div>
          <div className="text-foreground/60">
            {out ? "Got away" : isLoser ? "Bhabhi" : `${p.hand.length} cards`}
          </div>
          {lastPlay && !p.isHuman && <div className="text-gold/80">{cardLabel(lastPlay.card)}</div>}
        </div>
      </div>
      {!p.isHuman && p.hand.length > 0 && (
         <div className={cn("relative", vertical ? "h-32 w-[3.75rem]" : "h-[5.25rem] w-32")}>
          {Array.from({ length: backs }).map((_, i) => (
            <PlayingCard
              key={i}
              faceDown
              size="sm"
              className={cn("absolute", vertical && "rotate-90")}
              style={vertical ? { top: i * (60 / Math.max(backs, 1)), left: 0 } : { left: i * (60 / Math.max(backs, 1)), top: 0 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
