CREATE TABLE public.game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6}$'),
  visibility text NOT NULL CHECK (visibility IN ('private', 'public')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  host_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.game_rooms TO authenticated;
GRANT ALL ON public.game_rooms TO service_role;
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.room_players (
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  seat smallint NOT NULL CHECK (seat BETWEEN 0 AND 3),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 30),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id),
  UNIQUE (room_id, seat)
);
GRANT SELECT ON public.room_players TO authenticated;
GRANT ALL ON public.room_players TO service_role;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.game_states (
  room_id uuid PRIMARY KEY REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.game_states TO service_role;
ALTER TABLE public.game_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.room_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('chat', 'reaction')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.room_messages TO authenticated;
GRANT ALL ON public.room_messages TO service_role;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_room_member(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = _room_id AND user_id = _user_id
  )
$$;

CREATE POLICY "Players can create rooms"
ON public.game_rooms FOR INSERT TO authenticated
WITH CHECK (host_id = auth.uid());
CREATE POLICY "Members can view their rooms"
ON public.game_rooms FOR SELECT TO authenticated
USING (public.is_room_member(id, auth.uid()));

CREATE POLICY "Members can view seats"
ON public.room_players FOR SELECT TO authenticated
USING (public.is_room_member(room_id, auth.uid()));

CREATE POLICY "Members can view room messages"
ON public.room_messages FOR SELECT TO authenticated
USING (public.is_room_member(room_id, auth.uid()));
CREATE POLICY "Members can send room messages"
ON public.room_messages FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_room_member(room_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_game_room()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER touch_game_rooms
BEFORE UPDATE ON public.game_rooms
FOR EACH ROW EXECUTE FUNCTION public.touch_game_room();

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;