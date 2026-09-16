ALTER TABLE public.room_players
ADD CONSTRAINT room_players_profile_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;