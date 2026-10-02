/* ============================================================
 * Onyx Launcher - Skin/Cape-Vorlagen
 *
 * Lädt Standard-Vorlagen (Steve-Skin, Cape), damit der Nutzer
 * im Editor etwas zum Bearbeiten hat.
 * ============================================================ */

/** URL des Standard-Steve-Skins (von Mojang). */
export const STEVE_SKIN_URL =
  "https://assets.mojang.com/SkinTemplates/steve.png";

/** Lädt ein Bild von einer URL und liefert die RGBA-Pixeldaten. */
export async function loadPixelsFromUrl(
  url: string,
  w: number,
  h: number
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      resolve(data);
    };
    img.onerror = () => reject(new Error(`Bild konnte nicht geladen werden: ${url}`));
    img.src = url;
  });
}

/** Lädt eine URL als PNG-Data-URL. */
export async function loadPngDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Data-URL-Lesefehler"));
    r.readAsDataURL(blob);
  });
}

/**
 * Erzeugt ein leeres Cape (64x32) mit einem einfachen
 * Standard-Muster (rot-cyan gestreift), falls kein echtes
 * Cape geladen werden kann.
 */
export function defaultCapePixels(): Uint8ClampedArray {
  const W = 64, H = 32;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Einfaches Muster: dunkler Hintergrund, cyan glänzender Rand
      data[i] = 8;       // R
      data[i + 1] = 30;  // G
      data[i + 2] = 40;  // B
      data[i + 3] = 255; // A
      // Oberer/unterer Rand cyan
      if (y < 2 || y > H - 3) {
        data[i] = 34; data[i + 1] = 211; data[i + 2] = 238;
      }
      // Linker/rechter Rand
      if (x < 2 || x > W - 3) {
        data[i] = 34; data[i + 1] = 211; data[i + 2] = 238;
      }
    }
  }
  return data;
}
