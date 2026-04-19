/**
 * Auth API Client (authApi.js)
 *
 * Provides authentication API calls for the frontend. Responsibilities include:
 * - Zero-knowledge signup payload construction
 * - Zero-knowledge login payload construction
 * - Access token storage lifecycle (set/clear)
 * - MFA login verification API calls
 * - Logout API request dispatch
 *
 * Revision History:
 * - Wesley McDougal - 09APR2026 - Improved MFA verification flow, clarified error reporting, and updated integration with WebAuthn and TOTP endpoints.
 * - Wesley McDougal - 29MAR2026 - Added MFA verification API integration
 */

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
export async function signup({
  email,
  password,
  username,
  authImageId = 'img_001',
  mfaEnrollment = null,
  proposedUserId = null,
}) {
  const emailLower = email.toLowerCase();
  const [emailLookup, usernameLookup, authVerifier] = await Promise.all([
    sha256hex(emailLower),
    username ? sha256hex(username.toLowerCase()) : Promise.resolve(null),
    deriveAuthVerifier(password, emailLower),
  ]);

  return apiService.post('/auth/register', {
    email_lookup:      emailLookup,
    username_lookup:   usernameLookup,
    auth_verifier:     authVerifier,
    auth_image_id:     authImageId,
    mfa_enrollment:    mfaEnrollment,
    proposed_user_id:  proposedUserId || undefined,
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

export async function verifyLoginMfa({ challengeToken, method, totpCode = null, deviceId = null }) {
  const response = await apiService.post('/auth/login/mfa/verify', {
    mfa_challenge_token: challengeToken,
    method,
    totp_code: totpCode,
    device_id: deviceId,
  });

  if (response.access_token) setAccessToken(response.access_token);
  return response;
}

export async function verifyImageAuth({ imageChallengeToken, authImageHash }) {
  const response = await apiService.post('/auth/login/image/verify', {
    image_challenge_token: imageChallengeToken,
    auth_image_hash: authImageHash,
  });
  if (response.access_token) setAccessToken(response.access_token);
  return response;
}

export async function requestImageChallengeFromMfa({ mfaChallengeToken }) {
  return apiService.post('/auth/mfa/image-challenge', {
    mfa_challenge_token: mfaChallengeToken,
  });
}

export async function logout() {
  const response = await apiService.post('/auth/logout', {});
  setAccessToken(null);
  return response;
}

export async function deleteAccount({
  email,
  password,
  method,
  totpCode = null,
  deviceId = null,
}) {
  const emailLower = email.toLowerCase();
  const [emailLookup, authVerifier] = await Promise.all([
    sha256hex(emailLower),
    deriveAuthVerifier(password, emailLower),
  ]);

  const response = await apiService.post('/auth/delete-account', {
    email_lookup: emailLookup,
    auth_verifier: authVerifier,
    method,
    totp_code: totpCode,
    device_id: deviceId,
  });
  setAccessToken(null);
  return response;
}