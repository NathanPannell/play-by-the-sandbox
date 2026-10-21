import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../api/og.js';

// Stand-in for the Google Fonts files: the Noto Sans that ships with @vercel/og.
const require = createRequire(import.meta.url);
const FONT = readFileSync(join(dirname(require.resolve('@vercel/og')), 'noto-sans-v27-latin-regular.ttf'));
const CSS = "@font-face { src: url(https://fonts.gstatic.com/f.ttf) format('truetype'); }";

/** @param {{ css?: string, fontStatus?: number }} [opts] */
const googleFonts = ({ css = CSS, fontStatus = 200 } = {}) =>
  vi.fn(async (/** @type {string} */ url) =>
    String(url).startsWith('https://fonts.googleapis.com/')
      ? new Response(css)
      : new Response(fontStatus === 200 ? FONT : 'nope', { status: fontStatus }),
  );

/** @param {Uint8Array} png */
const pngSize = (png) => {
  const view = new DataView(png.buffer, png.byteOffset);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const request = (query = '') => new Request('https://playbythesandbox.ca/api/og' + query);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/og', () => {
  it('renders a cacheable 1200x630 PNG', async () => {
    vi.stubGlobal('fetch', googleFonts());
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    const png = new Uint8Array(await res.arrayBuffer());
    expect([...png.slice(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
  });

  it('asks Google Fonts for Chewy and Gaegu, subset to the card text', async () => {
    const fetchMock = googleFonts();
    vi.stubGlobal('fetch', fetchMock);
    await GET(request());
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    const css = urls.filter((u) => u.startsWith('https://fonts.googleapis.com/'));
    expect(css).toHaveLength(2);
    expect(css[0]).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Chewy&text=/);
    expect(decodeURIComponent(css[0])).toContain('Play by the Sandbox!');
    expect(css[1]).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=Gaegu:wght@700&text=/);
    expect(urls.filter((u) => u === 'https://fonts.gstatic.com/f.ttf')).toHaveLength(2);
  });

  it('renders with one font when the other cannot be loaded', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (/** @type {string} */ url) => {
      if (String(url).startsWith('https://fonts.googleapis.com/'))
        return new Response(calls++ === 0 ? CSS : '/* woff2 only */');
      return new Response(FONT);
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  // Current behaviour: with no font loaded, Satori refuses to lay out text, so the
  // card fails rather than falling back to a system font.
  it.each([
    ['Google Fonts is unreachable', () => vi.fn().mockRejectedValue(new Error('offline'))],
    ['only woff2 is offered', () => googleFonts({ css: '/* woff2 only */' })],
    ['the font file download fails', () => googleFonts({ fontStatus: 404 })],
  ])('returns a 500 when %s', async (_, makeFetch) => {
    vi.stubGlobal('fetch', makeFetch());
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('No fonts are loaded');
  });
});
