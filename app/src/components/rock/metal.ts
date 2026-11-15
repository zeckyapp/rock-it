// From Zecky Lock it. The metal is the same in light and dark: it is an object, not a
// surface of the app. Values match Lock it on the Mac.
export const METAL = {
  gold: '#D4A657',
  plateInk: '#14161C',
  /** Engraving: the dark cut and the light edge below it. */
  engraveInk: '#6A4C1D',
  engraveLight: 'rgba(255, 240, 204, 0.45)',
  bodyTop: '#F5DEA3',
  bodyBottom: '#805C24',
  shackle: ['#8A6E3B', '#F7E6B8', '#C99E4F', '#705421'] as const,
  innerEdge: 'rgba(255, 242, 209, 0.5)',
  outerEdge: 'rgba(89, 66, 23, 0.65)',
  plateEdge: 'rgba(242, 214, 150, 0.7)',
  halo: 'rgba(245, 214, 143, 0.22)',
};

/** One closed wavy ring, as an SVG path: radius r, wave amplitude a,
 *  n waves around, shifted by phase; plus a slow 3-wave swell. */
export function wavyRing(
  cx: number,
  cy: number,
  r: number,
  a: number,
  n: number,
  phase: number,
  steps: number,
  swell = 0.35,
): string {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const rr = r + a * Math.sin(n * (t + phase)) + a * swell * Math.sin(3 * t);
    const x = cx + rr * Math.cos(t);
    const y = cy + rr * Math.sin(t);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + 'Z';
}
