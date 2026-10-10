/* ============================================================
 * Chaos Launcher - Code einlösen (legendäre Cosmetics & Emotes)
 * ============================================================ */

import { useState } from "react";
import { redeemCosmeticCode } from "@/lib/api/cosmetics";
import { unlockName } from "@/lib/unlocks";
import { toast } from "@/stores/toastStore";
import type { Account } from "@/types";

export function RedeemCodeForm({ account, busy, onUnlocked }: { account: Account | null; busy?: boolean; onUnlocked?: () => Promise<void> | void }) {
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const redeem = async () => {
    if (!account || !code.trim()) return;
    setRedeeming(true);
    try {
      const r = await redeemCosmeticCode(account.uuid, code.trim());
      toast.success(r.already ? "Bereits freigeschaltet" : "Freigeschaltet!", `${unlockName(r.unlocked)} gehört jetzt dir.`);
      setCode("");
      await onUnlocked?.();
    } catch (e) {
      toast.error("Code ungültig", String(e));
    } finally {
      setRedeeming(false);
    }
  };
  return (
    <form className="chaos-row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void redeem(); }}>
      <input className="chaos-input chaos-mono" style={{ width: 190 }} placeholder="CHAOS-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={!account || redeeming || busy} />
      <button className="chaos-btn chaos-btn-sm chaos-btn-primary" type="submit" disabled={!account || redeeming || busy || !code.trim()}>{redeeming ? "Prüfe …" : "Code einlösen"}</button>
    </form>
  );
}
