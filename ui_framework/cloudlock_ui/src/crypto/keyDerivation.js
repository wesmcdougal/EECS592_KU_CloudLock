// ─── Internal helper ────────────────────────────────────────────────────────

async function _pbkdf2Key(password, salt, extractable = false) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey", "deriveBits"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 210000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Derive the vault master key from password + email.
 * Used to encrypt/decrypt the vault envelope on the client.
 * NEVER exported to the server.
 */
export async function deriveKey(password, salt) {
  return _pbkdf2Key(password, salt);
}

/**
 * Derive the vault master key (same as deriveKey, explicit alias).
 */
export const deriveMasterKey = deriveKey;

/**
 * Derive a separate authentication verifier from password + email.
 * Purpose: replace plaintext password in auth API calls so the server
 * never receives or stores the real password — only a derived verifier.
 *
 * The verifier is domain-separated from the master key via the ":auth" suffix
 * so compromising one key does not compromise the other.
 */
export async function deriveAuthVerifier(password, email) {
  const key = await _pbkdf2Key(password, email.toLowerCase() + ":auth", true);
  const raw = await crypto.subtle.exportKey("raw", key);
  // Return as base64 string for API transport
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

/**
 * Compute SHA-256 of a string and return it as a lowercase hex string.
 * Used to create lookup keys from email/username so the server stores
 * only hashes, not the real identifiers.
 */
export async function sha256hex(str) {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(str.toLowerCase()));
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}