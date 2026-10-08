/* ============================================================
 * Chaos Launcher - Admin: Codes für legendäre Wings
 * Nur sichtbar, wenn ein Admin-Schlüssel eingetragen ist.
 * ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { adminCodesCreate, adminCodesDelete, adminCodesList } from "@/lib/api/cosmetics";
import { CHAOS_WINGS } from "@/lib/builtinWings";
import { toast } from "@/stores/toastStore";
import type { CosmeticCode } from "@/types";

export default function CodesAdmin({ adminKey }: { adminKey: string }) {
  const [codes, setCodes] = useState<CosmeticCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const legendary = CHAOS_WINGS.filter((w) => w.exclusive);
  const [wings, setWings] = useState(legendary[0]?.id ?? "");
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
      const c = await adminCodesCreate(adminKey, code.trim(), wings, maxUses, note.trim());
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

  const copy = (c: string) => {
    navigator.clipboard?.writeText(c).then(() => toast.info("Kopiert", c)).catch(() => {});
  };

  if (error) return <p className="chaos-faint" style={{ fontSize: 12 }}>⚠ {error}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <div className="chaos-row chaos-wrap" style={{ gap: 8, alignItems: "flex-end" }}>
        <label className="chaos-field" style={{ minWidth: 180 }}>
          <span>Wings</span>
          <select className="onyx-select" value={wings} onChange={(e) => setWings(e.target.value)}>
            {legendary.map((w) => (
              <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
            ))}
          </select>
        </label>
        <label className="chaos-field" style={{ width: 190 }}>
          <span>Code (leer = automatisch)</span>
          <input className="chaos-input chaos-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. CHAOSVIP2026" maxLength={32} />
        </label>
        <label className="chaos-field" style={{ width: 120 }}>
          <span>Einlösbar (0 = ∞)</span>
          <input className="chaos-input" type="number" min={0} max={100000} value={maxUses} onChange={(e) => setMaxUses(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="chaos-field" style={{ flex: 1, minWidth: 160 }}>
          <span>Notiz</span>
          <input className="chaos-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Giveaway Oktober" maxLength={80} />
        </label>
        <button className="chaos-btn chaos-btn-primary" disabled={busy || !wings} onClick={create}>Code anlegen</button>
      </div>

      {codes === null ? (
        <span className="chaos-faint" style={{ fontSize: 12 }}>Lade Codes …</span>
      ) : codes.length === 0 ? (
        <span className="chaos-faint" style={{ fontSize: 12 }}>Noch keine Codes.</span>
      ) : (
        <table className="chaos-table" style={{ fontSize: 12, width: "100%" }}>
          <thead>
            <tr><th>Code</th><th>Wings</th><th>Eingelöst</th><th>Notiz</th><th>Von</th><th /></tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code}>
                <td><code style={{ cursor: "pointer" }} title="Klicken zum Kopieren" onClick={() => copy(c.code)}>{c.code}</code></td>
                <td>{CHAOS_WINGS.find((w) => w.id === c.wings)?.name ?? c.wings}</td>
                <td>{c.uses} / {c.maxUses === 0 ? "∞" : c.maxUses}</td>
                <td className="chaos-faint">{c.note}</td>
                <td className="chaos-faint">{c.redeemedBy.slice(-3).map((r) => r.name).join(", ")}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="chaos-btn chaos-btn-sm chaos-btn-ghost" disabled={busy} onClick={() => remove(c)}>Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
