/**
 * WebAuthn API and Browser Adapter (webauthnApi.js)
 *
 * Coordinates browser WebAuthn APIs with backend endpoints. Responsibilities include:
 * - Registration challenge retrieval and credential submission
 * - MFA assertion challenge retrieval and assertion submission
 * - Base64URL and ArrayBuffer conversion helpers
 * - Browser credential creation and assertion orchestration
 *
 * Revision History:
 * - Wesley McDougal - 29MAR2026 - Added WebAuthn registration and MFA assertion client flow
 */

import { post } from './apiService';

// WebAuthn API functions for biometric authentication

export async function getWebAuthnRegistrationChallenge(userId) {
  try {
    const response = await post('/mfa/webauthn/registration-challenge', {
      user_id: userId,
    });
    return response;
  } catch (error) {
    console.error('Failed to get WebAuthn registration challenge:', error);
    throw error;
  }
}

export async function registerWebAuthnCredential(clientDataJson, attestationObject, deviceLabel) {
  try {
    const response = await post('/mfa/webauthn/registration', {
      client_data_json: clientDataJson,
      attestation_object: attestationObject,
      device_label: deviceLabel,
    });
    return response;
  } catch (error) {
    console.error('Failed to register WebAuthn credential:', error);
    throw error;
  }
}

export async function getWebAuthnMfaChallenge(userId) {
  try {
    const response = await post('/mfa/webauthn/mfa-challenge', {
      user_id: userId,
    });
    return response;
  } catch (error) {
    console.error('Failed to get WebAuthn MFA challenge:', error);
    throw error;
  }
}

export async function verifyWebAuthnAssertion(mfaChallengeToken, clientDataJson, authenticatorData, signature) {
  try {
    const response = await post('/mfa/webauthn/mfa-verify', {
      mfa_challenge_token: mfaChallengeToken,
      client_data_json: clientDataJson,
      authenticator_data: authenticatorData,
      signature: signature,
    });
    return response;
  } catch (error) {
    console.error('Failed to verify WebAuthn assertion:', error);
    throw error;
  }
}

// Helper function to convert ArrayBuffer to Base64URL string
export function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper function to convert Base64URL string to ArrayBuffer
export function base64UrlToArrayBuffer(base64Url) {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Create credential (called during signup)
export async function createWebAuthnCredential(challenge, userId, deviceLabel) {
  try {
    const challengeBuffer = base64UrlToArrayBuffer(challenge);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challengeBuffer,
        rp: {
          name: 'CloudLock',
          id: '127.0.0.1', // Should match domain in production
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userId,
          displayName: userId,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        timeout: 60000,
        attestation: 'direct',
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Use platform authenticator (Face ID, fingerprint, etc.)
          userVerification: 'preferred',
        },
      },
    });

    if (!credential) {
      throw new Error('WebAuthn credential creation was cancelled');
    }

    // Encode attestation response
    const attestationObject = arrayBufferToBase64Url(credential.response.attestationObject);
    const clientDataJSON = arrayBufferToBase64Url(credential.response.clientDataJSON);

    // Send to backend
    const response = await registerWebAuthnCredential(clientDataJSON, attestationObject, deviceLabel);
    return response;
  } catch (error) {
    console.error('Failed to create WebAuthn credential:', error);
    throw error;
  }
}

// Get assertion for authentication (called during MFA login)
export async function getWebAuthnAssertion(challenge, mfaChallengeToken) {
  try {
    const challengeBuffer = base64UrlToArrayBuffer(challenge);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challengeBuffer,
        timeout: 60000,
        rpId: '127.0.0.1',
        userVerification: 'preferred',
      },
    });

    if (!assertion) {
      throw new Error('WebAuthn authentication was cancelled');
    }

    // Encode assertion response
    const clientDataJSON = arrayBufferToBase64Url(assertion.response.clientDataJSON);
    const authenticatorData = arrayBufferToBase64Url(assertion.response.authenticatorData);
    const signature = arrayBufferToBase64Url(assertion.response.signature);

    // Send to backend
    const response = await verifyWebAuthnAssertion(mfaChallengeToken, clientDataJSON, authenticatorData, signature);
    return response;
  } catch (error) {
    console.error('Failed to get WebAuthn assertion:', error);
    throw error;
  }
}
