/* ============================================================
 * Chaos Launcher - Crash-Dialog
 *
 * Öffnet sich automatisch, wenn Minecraft abstürzt (Event game://exited
 * mit Analyse) – egal auf welcher Seite der Launcher gerade ist. Zeigt
 * Ursache, Lösung und Aktionen wie "Mod deaktivieren".
 * ============================================================ */

import { useMemo } from "react";
import ErrorDialog from "@/components/ErrorDialog";
import { crashToLaunchError } from "@/lib/crash";
import { useStatusStore } from "@/stores/useStore";

export default function CrashDialog() {
  const crash = useStatusStore((s) => s.crash);
  const setCrash = useStatusStore((s) => s.setCrash);
  const error = useMemo(() => (crash?.analysis ? crashToLaunchError(crash.analysis, crash.instanceName) : null), [crash]);
  if (!crash || !error) return null;
  return <ErrorDialog error={error} instanceId={crash.instanceId} modName={crash.analysis?.modName} onClose={() => setCrash(null)} />;
}
