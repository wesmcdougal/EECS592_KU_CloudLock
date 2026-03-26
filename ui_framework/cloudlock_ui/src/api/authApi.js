import apiService, { setAccessToken } from './apiService';
import { sha256hex, deriveAuthVerifier } from '../crypto/keyDerivation';

/**
 * Zero-knowledge signup:
 * - email_lookup  = SHA-256(email)   → server stores a hash, not the real email
 * - username_lookup = SHA-256(username) if provided
 * - auth_verifier = PBKDF2(password, email+":auth") → server stores bcrypt(verifier),
 *   never the plaintext password
 *
 * The server never receives plaintext email, username, or password.
 */
export async function signup({ email, password, username, authImageId = 'img_001' }) {
  const emailLower = email.toLowerCase();
  const [emailLookup, usernameLookup, authVerifier] = await Promise.all([
    sha256hex(emailLower),
    username ? sha256hex(username.toLowerCase()) : Promise.resolve(null),
    deriveAuthVerifier(password, emailLower),
  ]);

  return apiService.post('/auth/register', {
    email_lookup:    emailLookup,
    username_lookup: usernameLookup,
    auth_verifier:   authVerifier,
    auth_image_id:   authImageId,
  });
}

/**
 * Zero-knowledge login:
 * - email_lookup  = SHA-256(email)
 * - auth_verifier = PBKDF2(password, email+":auth")
 *
 * The plaintext password never leaves the browser.
 */
export async function login({ email, password, deviceFingerprint = 'browser' }) {
  const emailLower = email.toLowerCase();
  const [emailLookup, authVerifier] = await Promise.all([
    sha256hex(emailLower),
    deriveAuthVerifier(password, emailLower),
  ]);

  const response = await apiService.post('/auth/login', {
    email_lookup:      emailLookup,
    auth_verifier:     authVerifier,
    device_fingerprint: deviceFingerprint,
  });
  if (response.access_token) setAccessToken(response.access_token);
  return response;
}

export async function logout() {
  const response = await apiService.post('/auth/logout', {});
  setAccessToken(null);
  return response;
}
