import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const GUEST_GAME_LIMIT = 20;

const bodySchema = z.object({
  deviceId: z.string().min(8).max(64).regex(/^[a-zA-Z0-9-]+$/),
  action: z.enum(["check", "consume"]),
});

function clientIp(request: Request) {
  const header =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for") ??
    "";
  return header.split(",")[0]?.trim() || "unknown";
}

export const Route = createFileRoute("/api/public/guest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const { deviceId, action } = parsed.data;
        const ip = clientIp(request);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("guest_usage")
          .select("device_id, games_played")
          .or(`device_id.eq.${deviceId},ip.eq.${ip}`);
        if (error) return new Response("Storage error", { status: 500 });

        const mine = rows?.find((row) => row.device_id === deviceId) ?? null;
        const ipTotal = (rows ?? []).reduce((sum, row) => sum + (row.games_played ?? 0), 0);
        let used = Math.max(mine?.games_played ?? 0, ipTotal);

        if (action === "consume" && used < GUEST_GAME_LIMIT) {
          const next = (mine?.games_played ?? 0) + 1;
          await supabaseAdmin
            .from("guest_usage")
            .upsert({ device_id: deviceId, ip, games_played: next, updated_at: new Date().toISOString() });
          used = Math.max(next, ipTotal + 1);
        }

        return Response.json({
          gamesPlayed: Math.min(used, GUEST_GAME_LIMIT),
          limit: GUEST_GAME_LIMIT,
          remaining: Math.max(0, GUEST_GAME_LIMIT - used),
          blocked: used >= GUEST_GAME_LIMIT,
        });
      },
    },
  },
});
