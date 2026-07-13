export function isLoopbackAddress(address) {
  if (!address) {
    return false;
  }

  const normalized = address.toLowerCase();
  if (normalized === '::1') {
    return true;
  }

  const ipv4 = normalized.startsWith('::ffff:')
    ? normalized.slice('::ffff:'.length)
    : normalized;
  const octets = ipv4.split('.');
  return octets.length === 4
    && octets[0] === '127'
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}
