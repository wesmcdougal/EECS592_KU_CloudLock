/* 
QR recovery helpers built around existing recovery.js flow
*/

const QR_VERSION = 1;
const RECOVERY_SECRET_BYTES = 32; // 256-bit

export function generateRecoverySecretBytes() {
  const bytes = new Uint8Array(RECOVERY_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlToBytes(value) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function generateRecoverySecretString() {
  return bytesToBase64Url(generateRecoverySecretBytes());
}

export function generateRecoverySalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function buildRecoveryQrPayload({ userId, recoveryId, recoverySecret }) {
  return {
    version: QR_VERSION,
    userId,
    recoveryId,
    recoverySecret,
  };
}

export function encodeRecoveryQrPayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

export function decodeRecoveryQrPayload(encoded) {
  const bytes = base64UrlToBytes(encoded.trim());
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json);

  if (payload.version !== QR_VERSION) {
    throw new Error("Unsupported recovery QR version.");
  }

  if (!payload.userId || !payload.recoveryId || !payload.recoverySecret) {
    throw new Error("Invalid recovery QR payload.");
  }

  return payload;
}