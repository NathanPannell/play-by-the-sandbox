import { describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/og', () => ({
  ImageResponse: class {
    constructor() {
      throw new Error('render failed');
    }
  },
}));

const { GET } = await import('../api/og.js');

describe('GET /api/og when rendering fails', () => {
  it('returns a 500 with the error as plain text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await GET(new Request('https://playbythesandbox.ca/api/og'));
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('render failed');
  });

  it('returns the error with a 200 when ?debug is set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await GET(new Request('https://playbythesandbox.ca/api/og?debug'));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^OG error: Error: render failed/);
  });
});
