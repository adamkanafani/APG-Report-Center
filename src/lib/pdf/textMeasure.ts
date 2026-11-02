// Arial Bold advance widths (per 1000 em, the standard Helvetica-Bold metrics Arial matches) -- so
// the cover can tell exactly where a value wraps, the same way in the PDF and the PowerPoint, rather
// than guessing from an average character width (which split "TW57209, TW68351, TW68352" in two
// where it really fits).
const ARIAL_BOLD: Record<string, number> = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333, "*": 389, "+": 584,
  ",": 278, "-": 333, ".": 278, "/": 278, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778,
  P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 333, "\\": 278, "]": 333,
  "^": 584, _: 556, "`": 333, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556,
  l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584, "’": 278, "‘": 278, "“": 500, "”": 500, "–": 556, "—": 1000, "°": 400,
};

/** Width of `text` in pt, set in Arial Bold at `size` pt. */
export function boldTextWidth(text: string, size: number): number {
  let units = 0;
  for (const ch of text) units += ARIAL_BOLD[ch] ?? (/[0-9]/.test(ch) ? 556 : 600);
  return (units * size) / 1000;
}

/** `line` broken between words so each piece fits `width` pt in Arial Bold at `size` pt. */
export function wrapBold(line: string, size: number, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of line.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && boldTextWidth(next, size) > width) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  return [...out, cur];
}
