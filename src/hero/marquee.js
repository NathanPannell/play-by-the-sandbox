// "SANDBOX" in a 5x7 dot-matrix font, for the marquee's light bulbs.
const GLYPHS = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
};

/**
 * Bulb positions for a word, centred on the origin, one unit between bulbs.
 * `letter` is the index of the character each bulb belongs to.
 * @param {string} word
 * @returns {{ x: number, y: number, letter: number }[]}
 */
export function bulbLayout(word) {
  const chars = [...word.toUpperCase()];
  const width = chars.length * 6 - 1;
  /** @type {{ x: number, y: number, letter: number }[]} */
  const bulbs = [];
  chars.forEach((ch, letter) => {
    const rows = GLYPHS[/** @type {keyof typeof GLYPHS} */ (ch)];
    if (!rows) throw new Error(`No marquee glyph for "${ch}"`);
    rows.forEach((row, r) => {
      [...row].forEach((cell, c) => {
        if (cell === '#') bulbs.push({ x: letter * 6 + c - (width - 1) / 2, y: 3 - r, letter });
      });
    });
  });
  return bulbs;
}
