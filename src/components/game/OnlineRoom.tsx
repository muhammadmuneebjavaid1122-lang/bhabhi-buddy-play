import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getRoom, playOnlineCard, sendRoomMessage } from "@/lib/bhabhi/multiplayer.functions";
import { legalCards, type GameState } from "@/lib/bhabhi/engine";
import { PlayingCard } from "./PlayingCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Copy, Globe2, LockKeyhole, MessageCircle, MessageCircleOff, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/bhabhi/sound";
import { ReactionLayer, STICKERS, StickerDrawer, type Reaction, type Sticker } from "./social";

type RoomView = Awaited<ReturnType<typeof getRoom>>;

export function OnlineRoom({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const fetchRoom = useServerFn(getRoom);
  const play = useServerFn(playOnlineCard);
  const send = useServerFn(sendRoomMessage);
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [copied, setCopied] = useState(false);
  const [thullaBurst, setThullaBurst] = useState(false);
  const [thullaImpact, setThullaImpact] = useState(false);
  const refresh = useCallback(async () => {
    try { setView(await fetchRoom({ data: { roomId } })); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not refresh the table."); }
  }, [fetchRoom, roomId]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_states", filter: `room_id=eq.${roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, roomId]);

  useEffect(() => {
    if (view?.game?.event?.type !== "thulla") return;
    setThullaBurst(true);
    sfx.thulla();
    const impactTimer = window.setTimeout(() => setThullaImpact(true), 680);
    const settleTimer = window.setTimeout(() => setThullaImpact(false), 1250);
    const finishTimer = window.setTimeout(() => setThullaBurst(false), 1450);
    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(finishTimer);
    };
  }, [view?.game?.eventSeq]);

  if (!view) return <div className="flex min-h-screen items-center justify-center bg-background font-display text-gold">Finding your seat…</div>;
  if (view.room.status === "waiting") return <WaitingRoom view={view} onLeave={onLeave} copied={copied} onCopy={() => { void navigator.clipboard.writeText(view.room.code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} />;
  if (!view.game) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Dealing the cards…</div>;

  const game = view.game as GameState;
  const myPlayer = game.players[view.seat];
  const playable = new Set(legalCards(game, view.seat).map((card) => card.id));
  const myTurn = game.phase === "playing" && game.turn === view.seat;
  const nameFor = (userId: string) => view.players.find((player) => player.user_id === userId)?.display_name ?? "Player";
  const reactions = useMemo(() => view.messages
    .filter((message) => message.kind === "reaction")
    .slice(-8)
    .flatMap((message): Reaction[] => {
      const sticker = STICKERS.find((item) => item.emoji === message.content);
      const player = view.players.find((candidate) => candidate.user_id === message.user_id);
      return sticker && player ? [{ id: message.id, player: player.seat, emoji: sticker.emoji, kind: sticker.kind }] : [];
    }), [view.messages, view.players]);
  const sendSticker = (sticker: Sticker) => {
    if (!chatEnabled) return;
    void send({ data: { roomId, kind: "reaction", content: sticker.emoji } });
  };
  return (
    <main className="min-h-screen bg-background px-3 py-4 text-foreground md:px-8">
      <header className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-3 border-b border-gold/20 pb-3">
        <Button variant="ghost" size="sm" onClick={onLeave}><ArrowLeft /> Lobby</Button>
        <div className="text-center"><p className="font-display font-bold text-gold">IBRA.INC · BHABHI</p><p className="text-xs text-muted-foreground">Room {view.room.code} · Live table</p></div>
        <div className="text-xs text-muted-foreground">{myTurn ? "Your turn" : `${game.players[game.turn]?.name ?? "Player"}'s turn`}</div>
      </header>
      <section className={cn("relative mx-auto aspect-[16/10] max-w-5xl overflow-hidden rounded-[3rem] border-[10px] border-table-rim bg-felt shadow-[inset_0_0_120px_oklch(0_0_0/0.55),0_30px_60px_oklch(0_0_0/0.6)]", thullaImpact && "animate-thulla-impact")}>
        {chatEnabled && <ReactionLayer reactions={reactions} />}
        {thullaBurst && game.event?.type === "thulla" && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className={cn("absolute inset-0 bg-destructive/25", thullaImpact && "animate-thulla-flash")} />
            <div className="absolute thulla-airborne"><PlayingCard card={game.event.card} size="table" /></div>
            <strong className="absolute top-[25%] font-display text-5xl font-black text-destructive-foreground drop-shadow-2xl animate-thulla-slam md:text-8xl">THULLA!</strong>
          </div>
        )}
        {game.players.map((player) => {
          const positions = ["bottom-4 left-1/2 -translate-x-1/2", "left-4 top-1/2 -translate-y-1/2", "top-4 left-1/2 -translate-x-1/2", "right-4 top-1/2 -translate-y-1/2"];
          return <div key={player.id} className={cn("absolute z-10 text-center", positions[player.id])}><div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 bg-background/70 font-display font-bold", game.turn === player.id ? "border-gold text-gold animate-pulse" : "border-foreground/30")}>{player.name[0]}</div><p className="mt-1 text-xs font-bold">{player.name}</p><p className="text-[10px] text-foreground/70">{player.hand.length} cards</p></div>;
        })}
        <div className="absolute left-1/2 top-1/2 flex h-[45%] w-[45%] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          {game.trick.map((item, index) => <PlayingCard key={item.card.id} card={item.card} size="table" className={cn("absolute", thullaImpact && "animate-card-judder")} style={{ transform: `rotate(${index * 18 - 25}deg) translate(${(index - 1.5) * 18}px, ${(index % 2) * 14}px)` }} />)}
          {game.trick.length === 0 && <p className="rounded-full bg-background/35 px-4 py-2 font-display text-sm text-gold">{myTurn ? "Your turn" : "Waiting for the next card…"}</p>}
        </div>
      </section>
      <section className="mx-auto mt-5 max-w-5xl">
        <div className="flex h-44 items-end justify-center">
          {(myPlayer?.hand ?? []).map((card, index) => {
            const allowed = myTurn && playable.has(card.id);
            return <PlayingCard key={card.id} card={card} size="lg" highlight={allowed} disabled={!allowed} onClick={() => allowed && play({ data: { roomId, cardId: card.id, version: view.room.version } }).then(refresh).catch((cause) => { setError(cause instanceof Error ? cause.message : "Move failed."); void refresh(); })} className="-mx-3 origin-bottom" style={{ transform: `rotate(${(index - ((myPlayer?.hand.length ?? 1) - 1) / 2) * 3}deg)`, zIndex: index }} />;
          })}
        </div>
      </section>
      <section className="mx-auto mt-4 max-w-5xl border-t border-gold/20 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">{chatEnabled && ["Nice Thulla!", "Watch this move!", "Good game!"].map((text) => <Button key={text} variant="outline" size="sm" onClick={() => send({ data: { roomId, kind: "chat", content: text } })}>{text}</Button>)}</div>
          <div className="flex items-center gap-2"><StickerDrawer onPick={sendSticker} disabled={!chatEnabled} /><Button variant="outline" size="sm" onClick={() => setChatEnabled((value) => !value)}>{chatEnabled ? <MessageCircle /> : <MessageCircleOff />}{chatEnabled ? "Chat on" : "Chat off"}</Button></div>
        </div>
        {chatEnabled ? (
          <>
            <div className="max-h-28 overflow-y-auto text-sm text-muted-foreground">{view.messages.filter((message) => message.kind === "chat").slice(-8).map((message) => <p key={message.id}><strong className="text-foreground">{nameFor(message.user_id)}:</strong> {message.content}</p>)}</div>
            <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!chatText.trim()) return; void send({ data: { roomId, kind: "chat", content: chatText } }).then(() => setChatText("")); }}><input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={120} aria-label="Chat message" className="min-w-0 flex-1 border border-input bg-card px-3 py-2 outline-none focus:border-gold" placeholder="Say something…" /><Button type="submit" size="icon" title="Send"><Send /></Button></form>
          </>
        ) : <p className="text-sm text-muted-foreground">Chat and reactions are muted for this game.</p>}
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      </section>
    </main>
  );
}

const TIPS = [
  "The Ace of Spades always leads the very first trick.",
  "You must follow the led suit whenever you hold it.",
  "Can't follow suit? Throw any card — that's a Thulla.",
  "After a Thulla, the highest card of the led suit picks up the pile.",
  "Whoever picks up the pile leads the next trick.",
  "Dumping high cards early saves you from late pickups.",
  "Track which suits opponents have run out of.",
  "Empty your hand first to get away — the last player left is the Bhabhi.",
];

function WaitingRoom({ view, onLeave, copied, onCopy }: { view: RoomView; onLeave: () => void; copied: boolean; onCopy: () => void }) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTip((current) => (current + 1) % TIPS.length), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const isPrivate = view.room.visibility === "private";
  const joined = view.players.length;
  return (
    <main className="flex min-h-screen flex-col bg-background px-5 py-8 text-foreground">
      <div className="mx-auto w-full max-w-3xl flex-1">
        <Button variant="ghost" onClick={onLeave}><ArrowLeft /> Lobby</Button>
        <div className="mt-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold">{isPrivate ? <LockKeyhole /> : <Globe2 />}</span>
          <h1 className="mt-5 font-display text-4xl font-bold">{isPrivate ? "Waiting for friends" : "Matching you with players"}</h1>
          <p className="mt-2 text-muted-foreground">{isPrivate ? "The game starts automatically when all four seats are filled." : "We're seating you with players from around the world. The deal begins at four."}</p>
          <p className="mt-8 font-display text-5xl font-bold text-gold">{joined}<span className="text-2xl text-muted-foreground"> / 4</span></p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">players joined</p>
          <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-card">
            <div className="h-full bg-gold transition-all duration-500" style={{ width: `${(joined / 4) * 100}%` }} />
          </div>
          {isPrivate && (
            <button type="button" onClick={onCopy} className="mx-auto mt-8 flex items-center gap-4 border border-gold bg-card px-6 py-4">
              <span><span className="block text-xs uppercase text-muted-foreground">Room code</span><strong className="font-mono text-3xl tracking-widest text-gold">{view.room.code}</strong></span>
              {copied ? <Check /> : <Copy />}
            </button>
          )}
        </div>
        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((seat) => {
            const player = view.players.find((candidate) => candidate.seat === seat);
            return (
              <div key={seat} className="border border-gold/20 bg-card p-4 text-center">
                <div className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 font-display text-gold", !player && "animate-pulse")}>{player?.display_name[0] ?? seat + 1}</div>
                <p className="mt-2 truncate font-bold">{player?.display_name ?? "Open seat"}</p>
                <p className="text-xs text-muted-foreground">{player ? "Ready" : "Waiting…"}</p>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="mx-auto mt-10 w-full max-w-3xl border-t border-gold/20 pt-5 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-gold">Tip</p>
        <p key={tip} className="mt-2 animate-fade-in text-sm text-muted-foreground">{TIPS[tip]}</p>
      </footer>
    </main>
  );
}