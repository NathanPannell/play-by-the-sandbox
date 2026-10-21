const INK = '#17151A';

const dragonSvg =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='-20 -40 370 290' width='520' height='408'><circle cx='150' cy='120' r='150' fill='#F5C518' opacity='0.35'/><g stroke='#17151A' stroke-width='5' stroke-linejoin='round' stroke-linecap='round'><path fill='#E8641B' d='M226 90 C 252 66, 276 80, 266 56 C 300 64, 318 96, 296 110 C 318 114, 312 140, 280 132 C 260 128, 242 108, 226 94 Z'/><path fill='#F5C518' stroke='none' d='M234 92 C 256 80, 268 92, 270 76 C 290 86, 292 104, 278 110 C 290 116, 280 124, 266 120 C 254 116, 244 104, 234 94 Z'/><path fill='#49B85A' d='M34 206 C 6 204, 0 172, 20 164 C 34 158, 40 174, 28 178 L40 196 C 40 150, 60 112, 104 112 C 144 114, 162 150, 158 206 Z'/><path fill='#F5C518' d='M110 140 C 122 130, 150 132, 152 150 L150 204 L106 204 Z'/><path fill='none' stroke-width='3.5' d='M110 156 q20 6 40 0 M108 176 q22 6 42 0'/><path fill='#E5322D' d='M98 92 L74 80 L90 106 Z M90 122 L64 120 L86 136 Z M52 140 L28 132 L42 156 Z'/><path fill='#F5C518' d='M126 46 L116 16 L142 40 Z M150 40 L154 10 L170 42 Z'/><path fill='#49B85A' d='M96 112 C 80 70, 110 34, 156 38 C 196 42, 232 60, 230 86 C 228 108, 204 112, 180 108 C 166 122, 130 132, 96 112 Z'/><circle fill='#ffffff' cx='150' cy='68' r='15'/><path fill='none' d='M212 70 q4 -5 8 0 M188 98 C 202 102, 214 100, 226 94'/><path fill='none' stroke-width='8' d='M122 152 q14 16 30 6'/></g><circle fill='#17151A' cx='155' cy='70' r='7'/><circle fill='#ffffff' cx='158' cy='66' r='2.5'/><circle fill='#F49AA8' cx='176' cy='96' r='8'/></svg>";

const zig = (function () {
  let d = 'M0 28';
  for (let i = 0; i < 25; i++) d += ' l24 -20 l24 20';
  return (
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 40' width='1200' height='40'><path d='" +
    d +
    "' fill='none' stroke='#E5322D' stroke-width='6' stroke-linejoin='round'/></svg>"
  );
})();

const hill =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 70' width='1200' height='70'><path d='M0 40 C 60 10, 120 10, 180 40 S 300 70, 360 34 S 480 0, 560 34 S 700 64, 780 30 S 920 0, 1000 32 S 1140 64, 1200 30 L1200 70 L0 70 Z' fill='#B8E6C1' stroke='#2FA84F' stroke-width='6'/></svg>";

/** @param {string} svg */
const uri = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

/**
 * @param {string} family
 * @param {string | null} weight
 * @param {string} text
 * @returns {Promise<ArrayBuffer | null>}
 */
async function loadFont(family, weight, text) {
  try {
    const q =
      'https://fonts.googleapis.com/css2?family=' +
      family +
      (weight ? ':wght@' + weight : '') +
      '&text=' +
      encodeURIComponent(text);
    const css = await (await fetch(q)).text();
    if (!css.includes("format('truetype')") && !css.includes("format('opentype')")) return null;
    const url = css.split('url(')[1].split(')')[0];
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Builds a Satori element without JSX.
 * @param {string} type
 * @param {Record<string, unknown>} style
 * @param {unknown} children
 * @param {Record<string, unknown>} [extra]
 * @returns {any}
 */
const el = (type, style, children, extra) => {
  const props = Object.assign({ style }, extra || {});
  if (children !== null && children !== undefined) props.children = children;
  return { type, key: null, props };
};

/** @param {Request} request */
export async function GET(request) {
  const debug = new URL(request.url).searchParams.has('debug');
  try {
    const { ImageResponse } = await import('@vercel/og');
    const title = 'Play by the Sandbox!';
    const sub1 = '16 creative directors + 16 brands';
    const sub2 = '+ 30–40 creators = real ads in 3 days';
    const pill = 'Vancouver Art Gallery · January 2027';
    const url = 'playbythesandbox.ca';
    const [chewy, gaegu] = await Promise.all([
      loadFont('Chewy', null, title + pill + url),
      loadFont('Gaegu', '700', sub1 + sub2),
    ]);
    /** @type {NonNullable<ConstructorParameters<typeof import('@vercel/og').ImageResponse>[1]>['fonts'] & {}} */
    const fonts = [];
    if (chewy) fonts.push({ name: 'Chewy', data: chewy, weight: 400, style: 'normal' });
    if (gaegu) fonts.push({ name: 'Gaegu', data: gaegu, weight: 700, style: 'normal' });
    const display = chewy ? 'Chewy' : 'sans-serif';
    const hand = gaegu ? 'Gaegu' : 'sans-serif';

    const letters = [
      ['S', '#E5322D'],
      ['a', '#2B5FD9'],
      ['n', '#F5C518'],
      ['d', '#2FA84F'],
      ['b', '#E8641B'],
      ['o', '#7A3FC4'],
      ['x', '#F49AA8'],
      ['!', '#E5322D'],
    ];

    const tree = el(
      'div',
      { width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#FFFCF5' },
      [
        el('img', { position: 'absolute', left: 0, top: 10, width: 1200, height: 40 }, null, {
          src: uri(zig),
          width: 1200,
          height: 40,
        }),
        el('img', { position: 'absolute', left: 0, bottom: 0, width: 1200, height: 70 }, null, {
          src: uri(hill),
          width: 1200,
          height: 70,
        }),
        el('img', { position: 'absolute', left: -10, top: 170, width: 520, height: 408 }, null, {
          src: uri(dragonSvg),
          width: 520,
          height: 408,
        }),
        el(
          'div',
          {
            position: 'absolute',
            left: 515,
            top: 62,
            width: 670,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          },
          [
            el(
              'div',
              {
                display: 'flex',
                background: '#E5322D',
                border: '5px solid ' + INK,
                padding: '2px 26px 8px',
                transform: 'rotate(-2deg)',
                color: '#FFFCF5',
                fontFamily: display,
                fontSize: 54,
                textShadow: '4px 5px 0 ' + INK,
              },
              'Play by the',
            ),
            el(
              'div',
              {
                display: 'flex',
                marginTop: 2,
                fontFamily: display,
                fontSize: 146,
                lineHeight: 1.05,
                textShadow: '7px 8px 0 ' + INK,
              },
              letters.map(([c, col]) => el('span', { color: col }, c)),
            ),
            el(
              'div',
              {
                display: 'flex',
                flexDirection: 'column',
                marginTop: 6,
                fontFamily: hand,
                fontWeight: 700,
                fontSize: 31,
                color: INK,
                lineHeight: 1.2,
              },
              [
                el('div', { display: 'flex', whiteSpace: 'nowrap' }, sub1),
                el('div', { display: 'flex', whiteSpace: 'nowrap' }, sub2),
              ],
            ),
            el(
              'div',
              {
                display: 'flex',
                marginTop: 20,
                background: '#FFFFFF',
                border: '5px solid ' + INK,
                borderRadius: 24,
                padding: '4px 22px 8px',
                boxShadow: '6px 6px 0 #7A3FC4',
                fontFamily: display,
                fontSize: 32,
                color: INK,
                transform: 'rotate(-1.5deg)',
              },
              pill,
            ),
          ],
        ),
        el(
          'div',
          {
            position: 'absolute',
            right: 34,
            top: 64,
            display: 'flex',
            background: '#F5C518',
            border: '4px solid ' + INK,
            borderRadius: 999,
            padding: '2px 16px 6px',
            fontFamily: display,
            fontSize: 24,
            color: INK,
            transform: 'rotate(4deg)',
          },
          url,
        ),
      ],
    );

    const img = new ImageResponse(tree, { width: 1200, height: 630, fonts });
    const buf = await img.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch (/** @type {any} */ e) {
    return new Response('OG error: ' + (e && e.stack ? e.stack : String(e)), {
      status: debug ? 200 : 500,
      headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
    });
  }
}
