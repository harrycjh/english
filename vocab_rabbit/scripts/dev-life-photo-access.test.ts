import { describe, expect, it } from 'vitest';
import { isLoopbackAddress } from './dev-life-photo-access.mjs';

describe('isLoopbackAddress', () => {
  it.each(['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1'])(
    'allows local loopback address %s',
    (address) => {
      expect(isLoopbackAddress(address)).toBe(true);
    },
  );

  it.each(['192.168.1.20', '10.0.0.8', '::ffff:192.168.1.20', undefined])(
    'rejects non-loopback address %s',
    (address) => {
      expect(isLoopbackAddress(address)).toBe(false);
    },
  );
});
