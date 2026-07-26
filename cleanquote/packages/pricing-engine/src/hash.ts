/**
 * Stable, dependency-free hash of a calculation input.
 *
 * Stored on every calculation snapshot so a quote version can prove which inputs
 * produced its numbers, and so a re-run that yields a different hash is visible as an
 * input change rather than an engine change.
 */
function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a, 64-bit, rendered as 16 hex characters. */
export function stableHash(value: unknown): string {
  const input = canonicalise(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash ^ BigInt(input.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}
