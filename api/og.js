const INK = '#17151A';

// The Sandbox wordmark (public/wordmark.svg), as plain crayon strokes.
const wordmarkSvg =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 694 158' width='694' height='158' fill='none'><g stroke-width='19' stroke-linecap='round' stroke-linejoin='round'><path d='M77.3015 29.8021C73.1369 20.3927 65.5906 15.4191 55.3015 15.3021C43.9754 15.1733 36.5262 22.0076 31.8015 32.3021C27.06 42.6332 28.8137 51.3474 34.3015 61.3021C40.8666 73.2109 53.3015 73.9688 63.8015 79.8021C71.3015 83.9688 84.4117 95.9511 84.3015 110.302C84.1926 124.492 76.9969 135.084 63.8015 140.302C50.1493 145.701 37.9837 141.373 27.3015 131.302C18.6454 123.141 15.3015 103.302 15.3015 103.302' stroke='#DE1B1B'/><path d='M111.302 102.598C114.468 87.4312 125.557 46.5194 138.302 36.8004C151.046 27.0814 162.279 48.9491 166.302 61.0978C166.91 63.3712 167.537 65.5255 168.167 67.5659M168.167 67.5659C175.537 91.4209 183.433 99.6866 169.302 100.3C158.475 100.771 147.161 92.6684 148.802 81.5979C149.857 74.475 157.664 68.8017 168.167 67.5659ZM168.167 67.5659C178.551 66.344 191.569 69.4597 203.302 79.8004' stroke='#DE761B'/><path d='M237.054 122.289C230.888 105.123 220.054 64.3895 226.054 38.7895C233.554 6.78946 286.199 126.77 302.554 89.2895C314.554 61.7894 302.554 33.7894 302.554 33.7894' stroke='#EEDD41'/><path d='M373.371 113.822C370.441 113.843 336.971 48.8219 335.371 38.8219C333.771 28.8219 360.123 32.1353 373.371 38.8219C391.622 48.0331 400.971 61.1219 395.371 86.3219C389.771 111.522 376.302 113.8 373.371 113.822Z' stroke='#21B22D'/><path d='M440.226 75.5699C440.226 75.5699 433.302 41.8003 431.302 32.5699C429.302 23.3394 451.602 10.4699 468.802 24.0699C486.002 37.6699 475.64 64.0699 468.309 75.5699M468.309 75.5699C461.172 74.0453 451.643 73.4497 440.226 75.5699C440.226 75.5699 443.135 103.403 447.802 112.07C452.468 120.737 466.502 135.47 485.302 125.07C504.102 114.67 495.619 90.5426 481.302 80.5699C476.84 77.4625 474.637 76.9215 468.309 75.5699Z' stroke='#1B8ADE'/><circle cx='549.802' cy='68.8003' r='28.5' stroke='#A47CDD' stroke-width='24'/><path d='M576.302 15.3003C604.802 38.3003 665.002 87.8003 677.802 101.8' stroke='#B221AD'/><path d='M574.302 130.3C599.802 96.3003 652.402 26.9003 658.802 21.3003' stroke='#B221AD'/></g></svg>";

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
    const title = 'Play by the';
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
        el(
          'div',
          {
            position: 'absolute',
            left: 90,
            top: 70,
            width: 1020,
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
            el('img', { marginTop: 18, marginLeft: 6, width: 990, height: 225 }, null, {
              src: uri(wordmarkSvg),
              width: 990,
              height: 225,
            }),
            el(
              'div',
              {
                display: 'flex',
                flexDirection: 'column',
                marginTop: 14,
                marginLeft: 10,
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
                marginTop: 18,
                marginLeft: 10,
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
