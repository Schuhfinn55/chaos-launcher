/* ============================================================
 * Chaos Launcher - Mojang/Crafatar-Hilfsfunktionen
 *
 * Lädt echte Minecraft-Spieler-Avatare und UUIDs nach.
 * Avatar über Crafatar (crafatar.com), UUID über Mojang API.
 * ============================================================ */

/** Sucht die UUID eines Spielers anhand seines Namens. */
export async function fetchUuid(username: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Mojang liefert die UUID ohne Bindestriche; Crafatar akzeptiert beide.
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/** Wandelt eine UUID ohne Bindestriche ins formatierte Format. */
export function formatUuid(id: string): string {
  if (id.length !== 32) return id;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** Liefert die Avatar-URL für eine UUID (über Crafatar). */
export function avatarUrl(uuid: string | undefined, size = 64): string {
  if (!uuid) return "";
  return `https://crafatar.com/avatars/${uuid}?size=${size}&overlay&default=MHF_Steve`;
}
