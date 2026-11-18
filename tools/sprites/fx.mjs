// Small pixel effects drawn next to the dog: hearts, snoozing z's, dust puffs, sparkles,
// and the big red button the dog presses to close a tab.
// ASCII rows without an explicit 'o' get an automatic outline; functions draw onto a Frame.
import { hex, ellipse, rect, union } from './raster.mjs';

export const FX_CELL = 20;

export const FX_PALETTE = {
  o: hex('#3a1a28'),
  p: hex('#ff6f91'), q: hex('#ffd2dd'), P: hex('#e04f73'),
  z: hex('#9db8ff'), Z: hex('#e3ecff'),
  d: hex('#efe8dc', 230), D: hex('#d6ccbd', 230),
  y: hex('#ffd25e'), Y: hex('#fff4c8'),
  // red button
  r: hex('#e0453c'), h: hex('#ff6b5d'), m: hex('#a82c2a'), w: hex('#ffd6cc'), x: hex('#ffffff'),
  c: hex('#ff9a8a'), g: hex('#9aa0aa'), G: hex('#62666f'), k: hex('#43464e'),
  S: [0, 0, 0, 0],
};

// The button, seen from slightly above: a grey base with a red dome and a white ×.
// state: 'up' | 'down' (pressed) | 'lit' (pressed, glowing)
function drawButton(f, state) {
  const cx = 10;
  const top = state === 'up' ? 7 : 10; // the dome sinks 3px when pressed
  // grey base
  f.shape('base', union([ellipse(cx, 15.4, 8.6, 3.1), rect(1.5, 13, 18.5, 15.4)]), {
    token: (x, y, e) => (e.down(x, y) <= 0 ? 'k' : 'G'),
  });
  f.shape('baseTop', ellipse(cx, 13, 8.6, 3.1), { token: 'g' });
  // red dome: sides, then the top face
  f.shape('dome', union([rect(4, top, 16, 12.2), ellipse(cx, 12.2, 6, 2.3)]), {
    token: (x, y, e) => (e.down(x, y) <= 0 ? 'm' : y < top + 2 ? 'r' : 'm'),
    lines: { baseTop: 'o' },
  });
  f.shape('domeTop', ellipse(cx, top, 6, 2.3), { token: state === 'lit' ? 'c' : 'h', lines: { dome: 'm' } });
  f.lines();
  // shine + a small white × on top (after the line pass so nothing paints over them)
  if (state !== 'lit') f.paint([[cx - 4, top - 1], [cx - 4, top]], 'w');
  f.paint([[cx - 1, top - 1], [cx + 1, top - 1], [cx, top], [cx - 1, top + 1], [cx + 1, top + 1]], 'x');
  f.outline();
}

export const FX = {
  heart: [
    ['.oo.oo.', 'oqpoppo', 'opppppo', 'oPpppPo', '.oPpPo.', '..oPo..', '...o...'],
  ],
  z: [
    ['zzzz', '..Z.', '.z..', 'zzzz'],
    ['ZZZZ', '..z.', '.Z..', 'ZZZZ'],
  ],
  dust: [
    ['..dd..', '.dDDd.', '..dd..'],
    ['.dd..dd.', 'dDDd.dDd', '.dd..dd.'],
    ['d......d', '.d....d.'],
  ],
  sparkle: [
    ['..y..', '..y..', 'yyYyy', '..y..', '..y..'],
    ['.....', '..Y..', '.YyY.', '..Y..', '.....'],
  ],
  star: [
    ['y...y', '.yYy.', '.YYY.', '.yYy.', 'y...y'],
    ['...y...', '...y...', '..yYy..', 'yyYYYyy', '..yYy..', '...y...', '...y...'],
  ],
  button: [(f) => drawButton(f, 'up'), (f) => drawButton(f, 'down'), (f) => drawButton(f, 'lit')],
};

// Where the dog's paw / nose should land on the button (cell pixels, button "up").
// The paw comes down on the near half of the dome, so the button sits out in front of him.
export const BUTTON_POINTS = { press: [6, 7], side: [4, 9] };
