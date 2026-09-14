import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { GameState } from "@/lib/bhabhi/engine";
import { sfx } from "@/lib/bhabhi/sound";

// ─── Data ────────────────────────────────────────────────────────────────────

export type StickerKind = "pop" | "float" | "toss";
export interface Sticker { emoji: string; label: string; kind: StickerKind }

export const STICKERS: Sticker[] = [
  { emoji: "😂", label: "Laughing crying", kind: "float" },
  { emoji: "😱", label: "Shocked", kind: "pop" },
  { emoji: "🔥", label: "Fire", kind: "float" },
  { emoji: "🍅", label: "Tomato toss", kind: "toss" },
  { emoji: "🫏", label: "Bhabhi ears", kind: "pop" },
  { emoji: "👏", label: "Clap", kind: "float" },
  { emoji: "😎", label: "Cool", kind: "pop" },
  { emoji: "💀", label: "Dead", kind: "pop" },
  { emoji: "🙈", label: "Can't watch", kind: "pop" },
  { emoji: "🃏", label: "Cards", kind: "float" },
];

export const TAUNTS = [
  "Nice Thulla!",
  "Who is the Bhabhi now?",
  "Good game!",
  "Watch this move!",
  "Pick them up! 🃏",
  "Not today!",
  "Oops 😅",
  "Too easy.",
];

const BOT_LINES = {
  thullaThrower: ["Thulla! 😈", "Catch! 🍅", "Enjoy those cards.", "Watch this move!", "Oops… did I do that?"],
  thullaVictim: ["Nooo 😩", "Why me?!", "Fine. FINE.", "That's just rude.", "I'll remember this."],
  thullaWatcher: ["Nice Thulla!", "Ouch 😂", "Brutal.", "Somebody call an ambulance."],
  getaway: ["Bye bye! 👋", "Free at last!", "Catch me if you can.", "Good luck, you lot."],
  overWinner: ["Who is the Bhabhi now?", "GG!", "Better luck next deal 😎", "Good game!"],
  overLoser: ["Ugh. Rematch!", "Rigged.", "I demand a re-deal.", "Not my day 🫏"],
  replyTaunt: ["Talk is cheap.", "We'll see about that.", "Big words for someone holding 13 cards.", "😂😂", "Cute.", "Play your cards then!"],
  replyGG: ["GG!", "Good game! 🤝", "Well played."],
  replyGeneric: ["Hmm.", "Focus on your cards!", "Sure sure.", "🤔", "Less chatting, more playing.", "Ha!"],
  idle: ["Anyone got spades?", "This hand is cursed.", "Hurry up 😴", "I have a plan…"],
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// ─── State ───────────────────────────────────────────────────────────────────

export interface Reaction {
  id: number;
  player: number;
  emoji: string;
  kind: StickerKind;
  target?: number | undefined;
}
export interface ChatMsg { id: number; player: number; text: string; time: number }

let seq = 1;

export function useSocial(state: GameState, sound: boolean) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, ChatMsg | undefined>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastSeq = useRef(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const react = useCallback((player: number, sticker: Sticker, target?: number) => {
    const id = seq++;
    setReactions((r) => [...r, { id, player, emoji: sticker.emoji, kind: sticker.kind, target }]);
    if (soundRef.current) (sticker.kind === "toss" ? sfx.toss : sfx.pop)();
    later(() => setReactions((r) => r.filter((x) => x.id !== id)), sticker.kind === "pop" ? 2200 : 2600);
  }, [later]);

  const say = useCallback((player: number, text: string) => {
    const msg: ChatMsg = { id: seq++, player, text: text.trim().slice(0, 120), time: Date.now() };
    if (!msg.text) return;
    setChat((c) => [...c.slice(-99), msg]);
    setBubbles((b) => ({ ...b, [player]: msg }));
    if (soundRef.current) sfx.chat();
    later(() => setBubbles((b) => (b[player]?.id === msg.id ? { ...b, [player]: undefined } : b)), 3500);
  }, [later]);

  // Human sends a message → bots may reply
  const humanSay = useCallback((text: string) => {
    say(0, text);
    const alive = state.players.filter((p) => !p.isHuman);
    const lower = text.toLowerCase();
    const responder = pick(alive);
    let pool = BOT_LINES.replyGeneric;
    if (/bhabhi|thulla|easy|watch|not today|pick/.test(lower)) pool = BOT_LINES.replyTaunt;
    if (/gg|good game|well played/.test(lower)) pool = BOT_LINES.replyGG;
    if (Math.random() < 0.85) later(() => say(responder.id, pick(pool)), 900 + Math.random() * 1500);
    if (/bhabhi/.test(lower) && Math.random() < 0.6) later(() => react(pick(alive).id, STICKERS[0]!), 600);
  }, [say, react, later, state.players]);

  const humanReact = useCallback((sticker: Sticker) => {
    // Tomatoes fly at whoever holds the most cards (or the Bhabhi).
    const target = state.loser ?? [...state.players].filter((p) => p.id !== 0).sort((a, b) => b.hand.length - a.hand.length)[0]?.id;
    react(0, sticker, sticker.kind === "toss" ? target : undefined);
    if (sticker.kind === "toss" && target !== undefined && target !== 0 && Math.random() < 0.7) {
      later(() => say(target, pick(["Hey! 🍅", "Rude!", "You'll pay for that.", "Missed me 😎"])), 900);
    } else if (Math.random() < 0.35) {
      later(() => react(pick(state.players.filter((p) => !p.isHuman)).id, pick(STICKERS.filter((s) => s.kind !== "toss"))), 700 + Math.random() * 800);
    }
  }, [react, say, later, state.players, state.loser]);

  // Bots react dynamically to game events
  useEffect(() => {
    if (state.eventSeq === lastSeq.current || !state.event) return;
    lastSeq.current = state.eventSeq;
    const ev = state.event;
    const bots = state.players.filter((p) => !p.isHuman).map((p) => p.id);
    const isBot = (i: number) => i !== 0;
    const byEmoji = (e: string) => STICKERS.find((s) => s.emoji === e)!;

    switch (ev.type) {
      case "thulla": {
        if (isBot(ev.thrower) && Math.random() < 0.8) later(() => say(ev.thrower, pick(BOT_LINES.thullaThrower)), 300);
        if (isBot(ev.picker) && Math.random() < 0.8) later(() => { say(ev.picker, pick(BOT_LINES.thullaVictim)); react(ev.picker, byEmoji("😱")); }, 900);
        const watchers = bots.filter((b) => b !== ev.thrower && b !== ev.picker);
        if (watchers.length && Math.random() < 0.6) later(() => { const w = pick(watchers); react(w, byEmoji("😂")); if (Math.random() < 0.5) say(w, pick(BOT_LINES.thullaWatcher)); }, 1500);
        if (ev.count >= 4 && Math.random() < 0.5) later(() => react(pick(bots.filter((b) => b !== ev.picker)) ?? 1, byEmoji("🍅"), ev.picker), 1900);
        break;
      }
      case "getaway":
        if (isBot(ev.player)) later(() => { say(ev.player, pick(BOT_LINES.getaway)); react(ev.player, byEmoji("😎")); }, 400);
        else if (Math.random() < 0.7) later(() => react(pick(bots), byEmoji("👏")), 500);
        break;
      case "over": {
        const loser = ev.loser;
        bots.forEach((b, i) => {
          later(() => {
            if (b === loser) { say(b, pick(BOT_LINES.overLoser)); react(b, byEmoji("🙈")); }
            else {
              if (Math.random() < 0.7) say(b, pick(BOT_LINES.overWinner));
              if (loser !== null) react(b, Math.random() < 0.5 ? byEmoji("🫏") : byEmoji("🍅"), loser);
              else react(b, byEmoji("🔥"));
            }
          }, 500 + i * 700);
        });
        if (loser !== null) later(() => react(loser, byEmoji("🫏")), 300);
        break;
      }
      case "play":
        if (Math.random() < 0.04 && isBot(ev.player)) later(() => say(ev.player, pick(BOT_LINES.idle)), 200);
        break;
    }
  }, [state, say, react, later]);

  // Clear on a new deal
  useEffect(() => {
    if (state.trickNo === 1 && state.trick.length === 0 && state.log.length === 1) {
      setReactions([]);
      setBubbles({});
    }
  }, [state.trickNo, state.trick.length, state.log.length]);

  return { reactions, chat, bubbles, humanSay, humanReact };
}

// ─── UI ──────────────────────────────────────────────────────────────────────

/** Seat anchor points in table percentages: 0 South, 1 West, 2 North, 3 East */
const ANCHOR: Record<number, [number, number]> = { 0: [50, 86], 1: [12, 50], 2: [50, 14], 3: [88, 50] };

export function ReactionLayer({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-live="polite">
      {reactions.map((r) => {
        const [x, y] = ANCHOR[r.player] ?? [50, 50];
        if (r.kind === "toss") {
          const [tx, ty] = ANCHOR[r.target ?? (r.player + 2) % 4] ?? [50, 50];
          return (
            <span
              key={r.id}
              className="absolute text-4xl md:text-5xl animate-toss"
              style={{ "--fx": `${x}%`, "--fy": `${y}%`, "--tx": `${tx}%`, "--ty": `${ty}%` } as React.CSSProperties}
              role="img"
              aria-label="tomato toss"
            >
              {r.emoji}
            </span>
          );
        }
        if (r.kind === "float") {
          const dx = (Math.random() - 0.5) * 160;
          return (
            <span
              key={r.id}
              className="absolute text-4xl md:text-5xl animate-float-up"
              style={{ left: `${x}%`, top: `${y}%`, "--dx": `${dx}px` } as React.CSSProperties}
              role="img"
            >
              {r.emoji}
            </span>
          );
        }
        return (
          <span
            key={r.id}
            className="absolute -translate-x-1/2 -translate-y-full text-5xl md:text-6xl animate-sticker-pop drop-shadow-lg"
            style={{ left: `${x}%`, top: `${y - (r.player === 2 ? -6 : 6)}%` }}
            role="img"
          >
            {r.emoji}
          </span>
        );
      })}
    </div>
  );
}

export function SpeechBubble({ msg, position }: { msg?: ChatMsg | undefined; position: "bottom" | "left" | "top" | "right" }) {
  if (!msg) return null;
  const place = {
    bottom: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    top: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "left-full top-1/2 -translate-y-1/2 ml-2",
    right: "right-full top-1/2 -translate-y-1/2 mr-2",
  }[position];
  return (
    <div
      key={msg.id}
      className={cn(
        "absolute z-40 max-w-[11rem] rounded-2xl bg-card-face px-3 py-1.5 text-xs font-semibold text-card-black shadow-lg animate-in zoom-in-75 fade-in duration-200 md:text-sm",
        place,
      )}
    >
      {msg.text}
    </div>
  );
}

export function StickerDrawer({ onPick, disabled }: { onPick: (s: Sticker) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("rounded-full border border-gold/40 px-3 py-1.5 text-lg transition hover:bg-gold/10", open && "bg-gold/20")}
        title="Reactions"
      >
        😂
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 grid grid-cols-5 gap-1 rounded-2xl border border-gold/30 bg-card p-2 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
          {STICKERS.map((s) => (
            <button
              key={s.emoji}
              type="button"
              disabled={disabled}
              title={s.label}
              aria-label={s.label}
              onClick={() => { onPick(s); setOpen(false); }}
              className="relative rounded-xl p-1.5 text-2xl transition hover:z-10 hover:scale-125 hover:bg-gold/10 active:scale-95"
            >
              {s.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ chat, names, onSend }: { chat: ChatMsg[]; names: string[]; onSend: (t: string) => void }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [chat.length, open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <section className="flex flex-col rounded-2xl border border-gold/15 bg-card/60 text-sm" aria-label="Table chat">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between px-4 py-3 font-display text-xs uppercase tracking-[0.25em] text-gold/80"
      >
        <span>Banter {chat.length > 0 && <span className="ml-1 rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] tracking-normal">{chat.length}</span>}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <div className="h-32 space-y-1 overflow-y-auto rounded-xl bg-black/20 p-2">
            {chat.length === 0 && <p className="text-muted-foreground">Say something to the table…</p>}
            {chat.map((m) => (
              <p key={m.id} className={cn(m.player === 0 && "text-gold")}>
                <span className="font-semibold">{names[m.player]}:</span> {m.text}
              </p>
            ))}
            <div ref={endRef} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAUNTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSend(t)}
                className="rounded-full border border-gold/30 px-2.5 py-1 text-xs text-gold transition hover:bg-gold/10 active:scale-95"
              >
                {t}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={120}
              placeholder="Type a message…"
              aria-label="Chat message"
              className="min-w-0 flex-1 rounded-full border border-gold/30 bg-black/20 px-3 py-1.5 text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none"
            />
            <button type="submit" className="rounded-full bg-gold px-4 py-1.5 font-semibold text-gold-foreground hover:brightness-110">
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
