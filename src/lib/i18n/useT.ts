import { useEffect, useState } from "react";
import { getLanguage, onLanguageChange, t } from "./index";

/** React-Hook: rendert neu, wenn die Sprache wechselt. */
export function useT() {
  const [, force] = useState(0);
  useEffect(() => onLanguageChange(() => force((n) => n + 1)), []);
  return { t, lang: getLanguage() };
}
