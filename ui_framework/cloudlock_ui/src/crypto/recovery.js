/*
Utility for zero-knowledge emergency recovery
Derives a recovery key from user input and encrypts the master key
*/

import { deriveKey } from './keyDerivation';
import { encryptData } from './encrypt.js';
import { decryptData } from './decrypt.js';

// Encrypt the master key with a recovery key derived from recovery info
export async function encryptMasterKeyWithRecovery(masterKeyRaw, recoveryInfo, salt) {
  // Derive recovery key from recoveryInfo (e.g., recovery password or answers)
  const recoveryKey = await deriveKey(recoveryInfo, salt);
  // Encrypt the masterKeyRaw (Uint8Array) with the recovery key
  return encryptData(masterKeyRaw, recoveryKey);
}

// Decrypt the master key using recovery info
export async function decryptMasterKeyWithRecovery(encryptedMasterKey, recoveryInfo, salt) {
  const recoveryKey = await deriveKey(recoveryInfo, salt);
  return decryptData(encryptedMasterKey, recoveryKey);
}

// Optional helper for importing recovered raw master key bytes back into Web Crypto
export async function importRecoveredMasterKey(masterKeyRaw) {
  const bytes = masterKeyRaw instanceof Uint8Array
    ? masterKeyRaw
    : new Uint8Array(masterKeyRaw);

  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}