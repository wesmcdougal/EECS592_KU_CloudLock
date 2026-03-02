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

// Envelope decryption: decrypts the DEK with the KEK, then decrypts the data with the DEK
export async function envelopeDecrypt(envelope, kek) {
  // 1. Decrypt DEK with KEK
  const dekRaw = await decryptData(envelope.encryptedDEK, kek); // Uint8Array
  const dek = await importKeyRaw(new Uint8Array(dekRaw));

  // 2. Decrypt data with DEK
  const plainData = await decryptData(envelope.encryptedData, dek);

  return plainData;
}
