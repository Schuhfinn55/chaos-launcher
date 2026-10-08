/* ============================================================
 * Chaos Launcher - Freunde & Präsenz (über die Cosmetics-API)
 * ============================================================ */

import { invoke } from "@/lib/bridge";
import type { FriendsView } from "@/types";

export const friendsList = (accountUuid: string) => invoke<FriendsView>("friends_list", { accountUuid });
export const friendsAction = (accountUuid: string, action: "request" | "accept" | "decline" | "remove", uuid: string, name = "") =>
  invoke<{ ok: boolean; accepted?: boolean; pending?: boolean; already?: boolean }>("friends_action", { accountUuid, action, uuid, name });
export const presenceHeartbeat = (accountUuid: string) => invoke<string>("presence_heartbeat", { accountUuid });
