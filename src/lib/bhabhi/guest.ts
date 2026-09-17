export type GuestQuota = { gamesPlayed: number; limit: number; remaining: number; blocked: boolean };

const KEY = "bhabhi-guest-device";

export function guestDeviceId() {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = (window.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^a-zA-Z0-9-]/g, "");
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

async function call(action: "check" | "consume"): Promise<GuestQuota | null> {
  const deviceId = guestDeviceId();
  if (!deviceId) return null;
  try {
    const response = await fetch("/api/public/guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId, action }),
    });
    if (!response.ok) return null;
    return (await response.json()) as GuestQuota;
  } catch {
    return null;
  }
}

export const checkGuestQuota = () => call("check");
export const consumeGuestGame = () => call("consume");
