export function hashString(value: string): number {
  // Why: a stable hash lets generated demo data remain consistent for the same identifier across sessions.
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function createSeededRandom(seed: number): () => number {
  let t = seed + 0x6d2b79f5;
  return () => {
    t += 0x6d2b79f5;
    let m = Math.imul(t ^ (t >>> 15), 1 | t);
    m ^= m + Math.imul(m ^ (m >>> 7), 61 | m);
    return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

export function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number, random: () => number, digits = 2): number {
  const value = random() * (max - min) + min;
  return Number(value.toFixed(digits));
}
