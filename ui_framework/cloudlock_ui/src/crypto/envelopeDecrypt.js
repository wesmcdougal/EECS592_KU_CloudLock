// Envelope decryption utility for zero-knowledge storage
// Uses Web Crypto API for all cryptographic operations

import { decryptData } from './decrypt';

// Import a raw key as a CryptoKey
export async function importKeyRaw(rawKey) {
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

function normalizeDekBytes(dekPayload) {
  if (dekPayload instanceof Uint8Array) {
    return dekPayload;
  }

  if (Array.isArray(dekPayload)) {
    return new Uint8Array(dekPayload);
  }

  // Backward compatibility: older payloads serialized Uint8Array as
  // {"0":byte0,"1":byte1,...}. Recover ordered bytes safely.
  if (dekPayload && typeof dekPayload === 'object') {
    const keys = Object.keys(dekPayload)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));

    if (keys.length > 0) {
      return new Uint8Array(keys.map((key) => Number(dekPayload[key])));
    }
  }

  throw new Error('Invalid encrypted DEK format');
}

// Envelope decryption: decrypts the DEK with the KEK, then decrypts the data with the DEK
export async function envelopeDecrypt(envelope, kek) {
  // 1. Decrypt DEK with KEK
  const dekRaw = await decryptData(envelope.encryptedDEK, kek);
  const dek = await importKeyRaw(normalizeDekBytes(dekRaw));

  // 2. Decrypt data with DEK
  const plainData = await decryptData(envelope.encryptedData, dek);

  return plainData;
}
