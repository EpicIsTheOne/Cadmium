// Small, pure helpers for the Rhythm color cross-fade: ease a palette from
// its current hex colors toward a target over several frames.

export type Rgb01 = [number, number, number];

export function hexToRgb01(hex: string): Rgb01 {
  const v = /^#([0-9a-fA-F]{6})$/.exec(hex) ?? ["", "36e0a8"];
  const n = parseInt(v[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgb01ToHex(c: Rgb01): string {
  const to = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return "#" + [to(c[0]), to(c[1]), to(c[2])].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/** Ease a single hex color toward `target` by factor `t` (0..1). */
export function lerpColorHex(current: string, target: string, t: number): string {
  const a = hexToRgb01(current);
  const b = hexToRgb01(target);
  return rgb01ToHex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}
