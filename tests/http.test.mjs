import { describe, expect, it } from 'vitest';
import { addressBucket, ipHash } from '../api/_lib/http.js';

describe('rate-limit buckets', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['unknown', 'unknown'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::', 'fe80:0:0:0::/64'],
    ['zz::1', '0:0:0:0::/64'],
  ])('%s is in bucket %s', (ip, bucket) => expect(addressBucket(ip)).toBe(bucket));

  it('hashes the bucket with the secret, never storing the address', () => {
    const req = (/** @type {string} */ ip) => new Request('http://x', { headers: { 'x-forwarded-for': ip } });
    const a = ipHash(req('2001:db8:1:2::1'), 's1');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(ipHash(req('2001:db8:1:2::9'), 's1')).toBe(a);
    expect(ipHash(req('2001:db8:1:2::1'), 's2')).not.toBe(a);
  });
});
