import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GameTable } from "./GameTable";
import { OnlineRoom } from "./OnlineRoom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { createRoom, findMatch, getMyProfile, joinRoom, saveMyProfile } from "@/lib/bhabhi/multiplayer.functions";
import { checkGuestQuota, consumeGuestGame, type GuestQuota } from "@/lib/bhabhi/guest";
import { Globe2, LockKeyhole, LogIn, Sparkles, UserRound, Users } from "lucide-react";

type SessionUser = { id: string; email: string | undefined } | null;

export function GamePortal() {
  const [intro, setIntro] = useState(true);
  const [mode, setMode] = useState<"lobby" | "practice" | "online">("lobby");
  const [user, setUser] = useState<SessionUser>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guestQuota, setGuestQuota] = useState<GuestQuota | null>(null);
  const [guestNotice, setGuestNotice] = useState("");
  const [roomId, setRoomId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(saveMyProfile);
  const makeRoom = useServerFn(createRoom);
  const enterRoom = useServerFn(joinRoom);
  const matchmake = useServerFn(findMatch);

  useEffect(() => {
    const introTimer = window.setTimeout(() => setIntro(false), 2300);
    supabase.auth.getUser().then(({ data }) => {
      const authUser = data.user ? { id: data.user.id, email: data.user.email } : null;
      setUser(authUser);
      setAuthReady(true);
      if (authUser) {
        loadProfile().then((profile) => {
          if (profile) {
            setDisplayName(profile.display_name);
            setAvatarUrl(profile.avatar_url ?? "");
            setProfileSaved(true);
          }
        }).catch(() => undefined);
      }
      if (!authUser) void checkGuestQuota().then((quota) => setGuestQuota(quota));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      setAuthReady(true);
    });
    return () => {
      window.clearTimeout(introTimer);
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const run = async (action: () => Promise<{ id: string }>) => {
    setBusy(true);
    setError("");
    try {
      if (!profileSaved) {
        await saveProfile({ data: { displayName, avatarUrl: avatarUrl || null } });
        setProfileSaved(true);
      }
      const room = await action();
      setRoomId(room.id);
      setMode("online");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join a table.");
    } finally {
      setBusy(false);
    }
  };

  const startGuestGame = async () => {
    setGuestNotice("");
    const quota = await checkGuestQuota();
    setGuestQuota(quota);
    if (quota?.blocked) {
      setGuestNotice("You've used all 20 free guest games on this device. Sign in to keep playing.");
      return;
    }
    setMode("practice");
  };

  const finishGuestGame = () => {
    if (user) return;
    void consumeGuestGame().then((quota) => setGuestQuota(quota));
  };

  if (intro) return <BrandIntro />;
  if (mode === "practice") return <GameTable onGameOver={finishGuestGame} />;
  if (mode === "online" && roomId) return <OnlineRoom roomId={roomId} onLeave={() => { setRoomId(""); setMode("lobby"); }} />;

  const suggestedName = user?.email?.split("@")[0] ?? "";
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-gold/20 px-5 py-4 md:px-10">
        <BrandMark />
        {user && <Button variant="ghost" onClick={() => supabase.auth.signOut()}><UserRound /> Sign out</Button>}
      </header>
      <div className="mx-auto max-w-5xl px-5 py-12 md:py-20">
        <div className="mb-10 max-w-2xl animate-fade-in">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase text-gold"><Sparkles className="h-4 w-4" /> The worldwide Bhabhi table</p>
          <h1 className="font-display text-4xl font-bold md:text-6xl">Play Bhabhi</h1>
          <p className="mt-4 text-lg text-muted-foreground">Deal with friends, meet players worldwide, or sharpen your Thulla game against bots.</p>
        </div>

        {!authReady ? (
          <p className="text-muted-foreground">Preparing your table…</p>
        ) : !user ? (
          <section className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
            <div className="border-l-4 border-gold bg-card p-7">
              <h2 className="font-display text-2xl font-bold">Online multiplayer</h2>
              <p className="mt-2 text-muted-foreground">Sign in to create private tables, use room codes, and join worldwide matchmaking.</p>
              <Button className="mt-6" size="lg" onClick={() => lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })}><LogIn /> Continue with Google</Button>
            </div>
            <button type="button" onClick={() => setMode("practice")} className="border border-gold/20 bg-card/50 p-7 text-left transition hover:border-gold/60 hover:bg-card">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold"><Users /></span>
              <strong className="font-display text-xl">Practice with bots</strong>
              <span className="mt-2 block text-sm text-muted-foreground">Start instantly. No account needed.</span>
            </button>
          </section>
        ) : (
          <div className="space-y-8">
            <section className="grid gap-4 border-y border-gold/20 py-6 md:grid-cols-[1fr_1.5fr]">
              <div>
                <h2 className="font-display text-lg font-bold">Your table identity</h2>
                <p className="mt-1 text-sm text-muted-foreground">This name and picture appear to other players.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Display name<input value={displayName} onChange={(event) => { setDisplayName(event.target.value); setProfileSaved(false); }} placeholder={suggestedName || "Your name"} maxLength={30} className="mt-1 w-full border border-input bg-card px-3 py-2 outline-none focus:border-gold" /></label>
                <label className="text-sm">Avatar image URL<input value={avatarUrl} onChange={(event) => { setAvatarUrl(event.target.value); setProfileSaved(false); }} placeholder="https://…" className="mt-1 w-full border border-input bg-card px-3 py-2 outline-none focus:border-gold" /></label>
              </div>
            </section>
            <section className="grid gap-4 md:grid-cols-3">
              <button type="button" disabled={busy || !displayName.trim()} onClick={() => run(() => makeRoom({ data: { visibility: "private", displayName } }))} className="group border border-gold/20 bg-card p-6 text-left transition hover:-translate-y-1 hover:border-gold disabled:opacity-50">
                <LockKeyhole className="mb-6 text-gold" /><strong className="block font-display text-xl">Play with friends</strong><span className="mt-2 block text-sm text-muted-foreground">Create a private table and share its six-character code.</span>
              </button>
              <button type="button" disabled={busy || !displayName.trim()} onClick={() => run(() => matchmake({ data: { displayName } }))} className="group border border-gold/20 bg-card p-6 text-left transition hover:-translate-y-1 hover:border-gold disabled:opacity-50">
                <Globe2 className="mb-6 text-gold" /><strong className="block font-display text-xl">Find a table</strong><span className="mt-2 block text-sm text-muted-foreground">Match with available players from around the world.</span>
              </button>
              <button type="button" onClick={() => setMode("practice")} className="group border border-gold/20 bg-card p-6 text-left transition hover:-translate-y-1 hover:border-gold">
                <Users className="mb-6 text-gold" /><strong className="block font-display text-xl">Practice with bots</strong><span className="mt-2 block text-sm text-muted-foreground">Jump into the familiar solo table immediately.</span>
              </button>
            </section>
            <form onSubmit={(event) => { event.preventDefault(); void run(() => enterRoom({ data: { code: roomCode, displayName } })); }} className="flex flex-wrap items-end gap-3 border-t border-gold/20 pt-6">
              <label className="min-w-52 flex-1 text-sm">Have a room code?<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABC123" className="mt-1 w-full border border-input bg-card px-3 py-2 font-mono uppercase outline-none focus:border-gold" /></label>
              <Button type="submit" disabled={busy || roomCode.length !== 6 || !displayName.trim()}>Join table</Button>
            </form>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}

function BrandMark() {
  return <div className="font-display text-lg font-bold text-gold"><span className="mr-2 inline-flex h-8 w-8 items-center justify-center border border-gold">I</span>IBRA.INC</div>;
}

function BrandIntro() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background" aria-label="IBRA.INC">
      <div className="animate-brand-reveal text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center border-2 border-gold font-display text-5xl font-bold text-gold animate-brand-mark">I</div>
        <p className="font-display text-3xl font-bold text-foreground md:text-5xl">IBRA<span className="text-gold">.INC</span></p>
        <div className="mx-auto mt-4 h-px w-44 origin-left bg-gold animate-brand-line" />
      </div>
    </div>
  );
}