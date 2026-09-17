CREATE TABLE public.guest_usage (
  device_id text PRIMARY KEY,
  ip text,
  games_played integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guest_usage_ip_idx ON public.guest_usage (ip);

GRANT ALL ON public.guest_usage TO service_role;

ALTER TABLE public.guest_usage ENABLE ROW LEVEL SECURITY;
