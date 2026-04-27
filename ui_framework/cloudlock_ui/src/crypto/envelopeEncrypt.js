/*
Envelope encryption utility for zero-knowledge storage
Uses Web Crypto API for all cryptographic operations
*/

import { encryptData } from './encrypt';

// Generate a random 256-bit (32-byte) AES-GCM key
export async function generateDEK() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// Export a CryptoKey to raw bytes
export async function exportKeyRaw(key) {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

// Envelope encryption: encrypts data with a random DEK, then encrypts the DEK with the KEK
export async function envelopeEncrypt(plainData, kek) {
  // 1. Generate DEK
  const dek = await generateDEK();

  // 2. Encrypt data with DEK
  const encryptedData = await encryptData(plainData, dek);

  // 3. Export DEK to raw bytes
  const dekRaw = await exportKeyRaw(dek);

  // 4. Encrypt DEK with KEK
  const encryptedDEK = await encryptData(dekRaw, kek);

  // 5. Return envelope
  return {
    encryptedData, // { iv, data }
    encryptedDEK,  // { iv, data }
  };
}
