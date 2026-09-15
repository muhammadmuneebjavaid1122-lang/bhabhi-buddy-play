CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_room_member(_room_id uuid, _user_id uuid)
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
REVOKE ALL ON FUNCTION public.is_room_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_room_member(uuid, uuid) TO authenticated;

DROP POLICY "Members can view their rooms" ON public.game_rooms;
CREATE POLICY "Members can view their rooms"
ON public.game_rooms FOR SELECT TO authenticated
USING (private.is_room_member(id, auth.uid()));

DROP POLICY "Members can view seats" ON public.room_players;
CREATE POLICY "Members can view seats"
ON public.room_players FOR SELECT TO authenticated
USING (private.is_room_member(room_id, auth.uid()));

DROP POLICY "Members can view room messages" ON public.room_messages;
CREATE POLICY "Members can view room messages"
ON public.room_messages FOR SELECT TO authenticated
USING (private.is_room_member(room_id, auth.uid()));
DROP POLICY "Members can send room messages" ON public.room_messages;
CREATE POLICY "Members can send room messages"
ON public.room_messages FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND private.is_room_member(room_id, auth.uid()));

CREATE POLICY "Game state is server only"
ON public.game_states FOR ALL TO authenticated
USING (false) WITH CHECK (false);

DROP FUNCTION public.is_room_member(uuid, uuid);