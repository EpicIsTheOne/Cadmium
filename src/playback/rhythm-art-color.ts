/**
 * Extracts a small palette from album/track artwork so the Rhythm visualizer
 * can auto-color itself to match what you're listening to.
 *
 * Approach: load the art into an offscreen <img>, draw it onto a small canvas,
 * read the pixels, then run a tiny k-means (k=3) to find the *representative*
 * colors rather than latching onto a single stray bright pixel. From the
 * clusters we pick a vivid primary, a contrasting secondary, and a deep
 * background. Local art is served from asset: URLs (same-origin to the WebView
 * in Tauri v2), so getImageData does not taint the canvas.
 */

export interface ArtPalette {
  primary: string;
  secondary: string;
  background: string;
}

const cache = new Map<string, ArtPalette>();

interface RGB { r: number; g: number; b: number; }

function toHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function dist2(a: RGB, c: RGB): number {
  const dr = a.r - c.r, dg = a.g - c.g, db = a.b - c.b;
  return dr * dr + dg * dg + db * db;
}

function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

interface LoadedImage {
  image: HTMLImageElement;
  revoke: () => void;
}

/**
 * Fetch the artwork bytes first, then load them through a blob: URL. Tauri's
 * asset protocol can render directly in <img> while still tainting a canvas;
 * a locally-created blob URL makes getImageData reliable in WebView2.
 */
async function loadImage(src: string): Promise<LoadedImage> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`art fetch failed (${response.status})`);
  const blobUrl = URL.createObjectURL(await response.blob());
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("art decode failed"));
      img.src = blobUrl;
    });
    return { image, revoke: () => URL.revokeObjectURL(blobUrl) };
  } catch (error) {
    URL.revokeObjectURL(blobUrl);
    throw error;
  }
}

/** k-means (k=3) over the sampled pixels, weighted toward saturated colors. */
function cluster(pixels: RGB[]): RGB[] {
  if (pixels.length === 0) return [];
  // Seed from well-spread samples.
  const seeds: RGB[] = [
    pixels[0],
    pixels[Math.floor(pixels.length / 2)],
    pixels[pixels.length - 1],
  ];
  let centers = seeds.map((s) => ({ ...s }));
  for (let iter = 0; iter < 6; iter += 1) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < centers.length; i += 1) {
        const d = dist2(p, centers[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      sums[best].r += p.r; sums[best].g += p.g; sums[best].b += p.b; sums[best].n += 1;
    }
    centers = sums.map((s, i) =>
      s.n === 0 ? centers[i] : { r: s.r / s.n, g: s.g / s.n, b: s.b / s.n });
  }
  return centers;
}

/** Returns a representative palette from an artwork URL (cached by URL). */
export async function paletteFromArt(src: string): Promise<ArtPalette | null> {
  if (!src || src.endsWith("cadmium-orbit.svg")) return null;
  const cached = cache.get(src);
  if (cached) return cached;

  let revoke = () => {};
  try {
    const loaded = await loadImage(src);
    const img = loaded.image;
    revoke = loaded.revoke;
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const pixels: RGB[] = [];
    let avgR = 0, avgG = 0, avgB = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 125) continue;
      const px = { r: data[i], g: data[i + 1], b: data[i + 2] };
      // Skip near-black/near-white so they don't dominate the accents.
      const lum = (px.r + px.g + px.b) / 3;
      if (lum < 12 || lum > 243) continue;
      pixels.push(px);
      avgR += px.r; avgG += px.g; avgB += px.b;
    }
    if (pixels.length < 8) return null;
    avgR /= pixels.length; avgG /= pixels.length; avgB /= pixels.length;
    const average: RGB = { r: avgR, g: avgG, b: avgB };

    const centers = cluster(pixels);
    // Rank clusters by how vivid + present they are.
    const ranked = centers
      .map((c) => ({ c, score: saturation(c) * 0.7 + 0.3 }))
      .sort((a, b) => b.score - a.score);

    const primary = ranked[0]?.c ?? average;
    // Secondary = the most different-looking other cluster (max color distance).
    let secondary = ranked[1]?.c ?? null;
    if (secondary) {
      let far = secondary; let farD = -1;
      for (const { c } of ranked.slice(1)) {
        const d = dist2(c, primary);
        if (d > farD) { farD = d; far = c; }
      }
      secondary = far;
    }
    if (!secondary) {
      secondary = { r: average.r * 0.6 + 60, g: average.g * 0.6 + 30, b: average.b * 0.6 + 90 };
    }

    // Background: a deep, slightly tinted version of the average so the scene
    // stays immersive rather than washing out to flat gray.
    const background: RGB = { r: average.r * 0.16, g: average.g * 0.16, b: average.b * 0.2 };

    const palette: ArtPalette = {
      primary: toHex(primary),
      secondary: toHex(secondary),
      background: toHex(background),
    };
    cache.set(src, palette);
    return palette;
  } catch {
    return null;
  } finally {
    revoke();
  }
}
