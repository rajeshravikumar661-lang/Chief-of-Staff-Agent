/** Client calls for account profile / preferences (separate from the main `api` seam). */

import type { ProfileDTO } from "@/lib/types";

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

export function getProfile(): Promise<ProfileDTO> {
  return req<ProfileDTO>("/api/settings/profile");
}

export function updateProfile(patch: {
  timezone?: string;
  digestHour?: number | null;
}): Promise<ProfileDTO> {
  return req<ProfileDTO>("/api/settings/profile", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
