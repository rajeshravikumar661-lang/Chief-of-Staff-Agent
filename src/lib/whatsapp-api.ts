/** Client calls for the WhatsApp linking flow (separate from the main `api` seam). */

export interface WhatsAppStatus {
  enabled: boolean;
  linked: boolean;
  status: "unpaired" | "qr" | "connecting" | "connected";
  number: string | null;
  qrDataUrl: string | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json())?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const whatsappApi = {
  status: () => req<WhatsAppStatus>("/api/whatsapp/status"),
  pair: () => req<{ status: WhatsAppStatus["status"]; qrDataUrl: string | null }>("/api/whatsapp/pair", { method: "POST" }),
  unlink: () => req<{ ok: true }>("/api/whatsapp/unlink", { method: "POST" }),
  test: () => req<{ sent: true }>("/api/whatsapp/test", { method: "POST" }),
};
