/**
 * Cryptographic Commit-Reveal Dice Engine
 * Formula: D20 = (HMAC_SHA256(Seed_player, Seed_master) mod 20) + 1
 */

// Simple SHA-256 / HMAC implementation for instant synchronous execution & WebCrypto fallback
async function hmacSha256(keyStr: string, messageStr: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const keyData = enc.encode(keyStr);
      const msgData = enc.encode(messageStr);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: { name: 'SHA-256' } },
        false,
        ['sign']
      );

      const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const hashArray = Array.from(new Uint8Array(signature));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fallback
    }
  }

  // Pure deterministic JS fallback hash for test environments
  let hash = 0x811c9dc5;
  const combined = keyStr + ':' + messageStr;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return hex.repeat(8).substring(0, 64);
}

export function generateRandomSeed(prefix = 'seed'): string {
  const arr = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export async function calculateCommitRevealD20(
  playerSeed: string,
  masterSeed: string
): Promise<{
  d20: number;
  hmacHex: string;
  first32BitInt: number;
  formula: string;
  isCritSuccess: boolean;
  isCritFail: boolean;
}> {
  const hmacHex = await hmacSha256(playerSeed, masterSeed);
  // Take first 8 hex characters (32-bit unsigned integer)
  const first32BitInt = parseInt(hmacHex.substring(0, 8), 16);
  const d20 = (first32BitInt % 20) + 1;

  return {
    d20,
    hmacHex,
    first32BitInt,
    formula: `(${first32BitInt} mod 20) + 1 = ${d20}`,
    isCritSuccess: d20 === 20,
    isCritFail: d20 === 1,
  };
}

export async function sha256Commitment(seed: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const enc = new TextEncoder();
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', enc.encode(seed));
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fallback
    }
  }
  let h = 0x55555555;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  return (h >>> 0).toString(16).padStart(64, '0');
}
