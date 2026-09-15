CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 30),
  avatar_url text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in players can view profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Players can create their profile"
ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Players can update their profile"
ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER touch_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_profile();