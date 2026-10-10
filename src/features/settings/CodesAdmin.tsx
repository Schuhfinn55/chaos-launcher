/* ============================================================
 * Chaos Launcher - Admin: Codes für legendäre Cosmetics & Emotes
 * Nur sichtbar, wenn ein Admin-Schlüssel eingetragen ist.
 * ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { adminCodesCreate, adminCodesDelete, adminCodesList } from "@/lib/api/cosmetics";
import { exclusiveItems, unlockName } from "@/lib/unlocks";
import { toast } from "@/stores/toastStore";
import type { CosmeticCode } from "@/types";

export default function CodesAdmin({ adminKey }: { adminKey: string }) {
  const [codes, setCodes] = useState<CosmeticCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = exclusiveItems();
  const [item, setItem] = useState(items[0]?.key ?? "");
  const [code, setCode] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setCodes(await adminCodesList(adminKey));
      setError(null);
    } catch (e) {
      setCodes(null);
      setError(String(e));
    }
  }, [adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const c = await adminCodesCreate(adminKey, code.trim(), item, maxUses, note.trim());
      toast.success("Code angelegt", c.code);
      setCode("");
      setNote("");
      await load();
    } catch (e) {
      toast.error("Code anlegen fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: CosmeticCode) => {
    setBusy(true);
    try {
      await adminCodesDelete(adminKey, c.code);
      await load();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    } finally {
      setBusy(false);
    }
  };

  const kinds = ["wings", "hat", "effect", "emote", "cape"] as const;
  return (
    <div className="chaos-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <strong style={{ fontSize: 13 }}>🔑 Codes für legendäre Items</strong>
        <p className="chaos-faint" style={{ fontSize: 12, margin: "2px 0 0" }}>Wings, Hüte, Effekte, Emotes und Capes, die nur per Code freigeschaltet werden. Leer lassen = Code wird generiert.</p>
      </div>
      <div className="chaos-row chaos-wrap" style={{ gap: 8, alignItems: "flex-end" }}>
        <label className="chaos-col" style={{ gap: 3 }}>
          <span className="chaos-faint" style={{ fontSize: 11 }}>Item</span>
          <select className="onyx-select" value={item} onChange={(e) => setItem(e.target.value)}>
            {kinds.map((k) => (
              <optgroup key={k} label={items.find((i) => i.kind === k)?.kindLabel ?? k}>
                {items.filter((i) => i.kind === k).map((i) => (
                  <option key={i.key} value={i.key}>{i.icon} {i.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="chaos-col" style={{ gap: 3 }}>
          <span className="chaos-faint" style={{ fontSize: 11 }}>Code (optional)</span>
          <input className="chaos-input chaos-mono" style={{ width: 170 }} placeholder="automatisch" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <label className="chaos-col" style={{ gap: 3 }}>
          <span className="chaos-faint" style={{ fontSize: 11 }}>Einlösungen (0 = unbegrenzt)</span>
          <input className="chaos-input" type="number" min={0} max={100000} style={{ width: 90 }} value={maxUses} onChange={(e) => setMaxUses(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="chaos-col" style={{ gap: 3, flex: 1, minWidth: 140 }}>
          <span className="chaos-faint" style={{ fontSize: 11 }}>Notiz</span>
          <input className="chaos-input" placeholder="z.B. Giveaway Oktober" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="chaos-btn chaos-btn-primary" disabled={busy || !item} onClick={create}>Code anlegen</button>
      </div>
      {error && <span className="chaos-faint" style={{ color: "#f87171", fontSize: 12 }}>{error}</span>}
      {codes && codes.length === 0 && <span className="chaos-faint" style={{ fontSize: 12 }}>Noch keine Codes.</span>}
      {codes && codes.length > 0 && (
        <table className="chaos-table">
          <thead>
            <tr><th>Code</th><th>Item</th><th>Einlösungen</th><th>Notiz</th><th>Eingelöst von</th><th></th></tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code}>
                <td className="chaos-mono">{c.code}</td>
                <td>{unlockName(c.item || c.wings)}</td>
                <td>{c.uses} / {c.maxUses === 0 ? "∞" : c.maxUses}</td>
                <td className="chaos-faint">{c.note}</td>
                <td className="chaos-faint">{c.redeemedBy.map((r) => r.name).join(", ") || "–"}</td>
                <td><button className="chaos-btn chaos-btn-sm chaos-btn-danger" disabled={busy} onClick={() => remove(c)}>Löschen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
