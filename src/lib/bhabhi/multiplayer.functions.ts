import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { newGame, reducer, type GameState } from "./engine";
import type { Card } from "./cards";

const roomIdSchema = z.object({ roomId: z.string().uuid() });
const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(30),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
});

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function adminClient(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function assertMember(admin: Admin, roomId: string, userId: string) {
  const { data, error } = await admin
    .from("room_players")
    .select("seat, display_name")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("You are not seated at this table.");
  return data;
}

async function startIfFull(admin: Admin, roomId: string) {
  const { data: room } = await admin.from("game_rooms").select("status").eq("id", roomId).single();
  if (room?.status !== "waiting") return;
  const { data: seats, error } = await admin
    .from("room_players")
    .select("seat, display_name")
    .eq("room_id", roomId)
    .order("seat");
  if (error || !seats || seats.length !== 4) return;
  const names = seats.map((seat) => seat.display_name);
  const state: GameState = {
    ...newGame(),
    players: newGame().players.map((player, index) => ({
      ...player,
      name: names[index] ?? `Player ${index + 1}`,
      isHuman: true,
    })),
  };
  // Rebuild once so the dealt hands and starter belong to the same deal.
  const deal = newGame();
  state.players = deal.players.map((player, index) => ({ ...player, name: names[index] ?? `Player ${index + 1}`, isHuman: true }));
  state.turn = deal.turn;
  state.log = [`New online deal. ${state.players[state.turn]?.name ?? "A player"} leads the Ace of Spades.`];
  const { error: stateError } = await admin.from("game_states").insert({ room_id: roomId, state });
  if (stateError) throw stateError;
  const { error: roomError } = await admin.from("game_rooms").update({ status: "playing", version: 1 }).eq("id", roomId);
  if (roomError) throw roomError;
}

function hideOtherHands(state: GameState, seat: number): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.id === seat
        ? player.hand
        : player.hand.map((_, index) => ({ id: `hidden-${player.id}-${index}`, suit: "♠", rank: 2 }) as Card),
    })),
    log: [],
    voids: { 0: [], 1: [], 2: [], 3: [] },
  };
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("profiles").select("display_name, avatar_url").eq("id", context.userId).maybeSingle();
    if (error) throw error;
    return data;
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").upsert({
      id: context.userId,
      display_name: data.displayName,
      avatar_url: data.avatarUrl || null,
    });
    if (error) throw error;
    return { ok: true };
  });

async function createRoomFor(admin: Admin, userId: string, displayName: string, visibility: "private" | "public") {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = roomCode();
    const { data: room, error } = await admin
      .from("game_rooms")
      .insert({ code, visibility, host_id: userId })
      .select("id, code, status, visibility, version")
      .single();
    if (error?.code === "23505") continue;
    if (error || !room) throw error ?? new Error("Could not create a table.");
    const { error: seatError } = await admin.from("room_players").insert({ room_id: room.id, user_id: userId, seat: 0, display_name: displayName });
    if (seatError) throw seatError;
    return room;
  }
  throw new Error("Could not generate a room code. Please try again.");
}

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ visibility: z.enum(["private", "public"]), displayName: z.string().trim().min(1).max(30) }).parse(input))
  .handler(async ({ data, context }) => createRoomFor(await adminClient(), context.userId, data.displayName, data.visibility));

async function joinWaitingRoom(admin: Admin, roomId: string, userId: string, displayName: string) {
  const existing = await admin.from("room_players").select("seat").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
  if (existing.data) return;
  const { data: seats, error } = await admin.from("room_players").select("seat").eq("room_id", roomId);
  if (error) throw error;
  const taken = new Set((seats ?? []).map((seat) => seat.seat));
  const seat = [0, 1, 2, 3].find((candidate) => !taken.has(candidate));
  if (seat === undefined) throw new Error("That table is already full.");
  const { error: joinError } = await admin.from("room_players").insert({ room_id: roomId, user_id: userId, seat, display_name: displayName });
  if (joinError) throw new Error(joinError.code === "23505" ? "Someone took that seat. Try again." : joinError.message);
  await startIfFull(admin, roomId);
}

export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().trim().length(6).transform((value) => value.toUpperCase()), displayName: z.string().trim().min(1).max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await adminClient();
    const { data: room, error } = await admin.from("game_rooms").select("id, code, status, visibility, version").eq("code", data.code).maybeSingle();
    if (error || !room) throw new Error("No table was found with that code.");
    if (room.status !== "waiting") throw new Error("That game has already started.");
    await joinWaitingRoom(admin, room.id, context.userId, data.displayName);
    return room;
  });

export const findMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ displayName: z.string().trim().min(1).max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await adminClient();
    const { data: existing } = await admin.from("room_players").select("room_id, game_rooms!inner(id, code, status, visibility, version)").eq("user_id", context.userId).eq("game_rooms.status", "waiting").eq("game_rooms.visibility", "public").limit(1).maybeSingle();
    const existingRoom = existing?.game_rooms;
    if (existingRoom && !Array.isArray(existingRoom)) return existingRoom;
    const { data: rooms, error } = await admin.from("game_rooms").select("id, code, status, visibility, version").eq("visibility", "public").eq("status", "waiting").order("created_at").limit(8);
    if (error) throw error;
    for (const room of rooms ?? []) {
      try {
        await joinWaitingRoom(admin, room.id, context.userId, data.displayName);
        return room;
      } catch (error) {
        if (!(error instanceof Error) || !/full|seat/i.test(error.message)) throw error;
      }
    }
    return createRoomFor(admin, context.userId, data.displayName, "public");
  });

export const getRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => roomIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await adminClient();
    const member = await assertMember(admin, data.roomId, context.userId);
    const [{ data: room, error: roomError }, { data: players, error: playersError }, { data: stored }, { data: messages }] = await Promise.all([
      admin.from("game_rooms").select("id, code, status, visibility, version, host_id").eq("id", data.roomId).single(),
      admin.from("room_players").select("user_id, seat, display_name, profiles(avatar_url)").eq("room_id", data.roomId).order("seat"),
      admin.from("game_states").select("state").eq("room_id", data.roomId).maybeSingle(),
      admin.from("room_messages").select("id, user_id, kind, content, created_at").eq("room_id", data.roomId).order("id", { ascending: false }).limit(100),
    ]);
    if (roomError || playersError || !room) throw roomError ?? playersError ?? new Error("Table unavailable.");
    const fullState = stored?.state as unknown as GameState | undefined;
    return {
      room,
      players: players ?? [],
      seat: member.seat,
      game: fullState ? hideOtherHands(fullState, member.seat) : null,
      messages: (messages ?? []).reverse(),
    };
  });

export const playOnlineCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ roomId: z.string().uuid(), cardId: z.string().min(1), version: z.number().int().nonnegative() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await adminClient();
    const member = await assertMember(admin, data.roomId, context.userId);
    const [{ data: room }, { data: stored }] = await Promise.all([
      admin.from("game_rooms").select("version, status").eq("id", data.roomId).single(),
      admin.from("game_states").select("state").eq("room_id", data.roomId).single(),
    ]);
    if (!room || !stored || room.status !== "playing") throw new Error("This game is not active.");
    if (room.version !== data.version) throw new Error("The table moved on. Refreshing your hand.");
    let state = reducer(stored.state as unknown as GameState, { type: "PLAY_CARD", player: member.seat, cardId: data.cardId });
    if (state === stored.state) throw new Error("That card cannot be played now.");
    if (state.phase === "resolving") state = reducer(state, { type: "RESOLVE_TRICK" });
    const nextVersion = room.version + 1;
    const { data: locked } = await admin.from("game_rooms").update({ version: nextVersion, status: state.phase === "over" ? "finished" : "playing" }).eq("id", data.roomId).eq("version", data.version).select("id").maybeSingle();
    if (!locked) throw new Error("Another card arrived first. Refreshing your hand.");
    const { error } = await admin.from("game_states").update({ state }).eq("room_id", data.roomId);
    if (error) throw error;
    return { version: nextVersion };
  });

export const sendRoomMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ roomId: z.string().uuid(), kind: z.enum(["chat", "reaction"]), content: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(await adminClient(), data.roomId, context.userId);
    const { error } = await context.supabase.from("room_messages").insert({ room_id: data.roomId, user_id: context.userId, kind: data.kind, content: data.content });
    if (error) throw error;
    return { ok: true };
  });