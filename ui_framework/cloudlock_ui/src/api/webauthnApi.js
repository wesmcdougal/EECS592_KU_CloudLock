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
 * - Wesley McDougal - 09APR2026 - Added Android-specific WebAuthn fallback logic, improved error diagnostics, and relaxed credential options for broader device compatibility.
 */

import { post, postPublic } from './apiService';

export async function getWebAuthnRegistrationChallenge(userId) {
  const response = await postPublic('/mfa/webauthn/registration-challenge', {
    user_id: userId,
  });

  if (response?.error) {
    throw new Error(`Unable to start biometric enrollment: ${response.error}`);
  }
  if (!response?.challenge || !response?.challenge_token) {
    throw new Error('Unable to start biometric enrollment: server returned an invalid challenge payload');
  }

  return response;
}

export async function registerWebAuthnCredential(payload) {
  const response = await postPublic('/mfa/webauthn/registration', payload);
  return response;
}

export async function getWebAuthnMfaChallenge(mfaChallengeToken) {
  const response = await post('/mfa/webauthn/mfa-challenge', {
    mfa_challenge_token: mfaChallengeToken,
  });

  if (response?.error) {
    throw new Error(`Unable to start biometric verification: ${response.error}`);
  }
  if (!response?.challenge || !response?.webauthn_challenge_token) {
    throw new Error('Unable to start biometric verification: server returned an invalid challenge payload');
  }

  return response;
}

export async function verifyWebAuthnAssertion(payload) {
  const response = await post('/mfa/webauthn/mfa-verify', payload);
  return response;
}

export function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToArrayBuffer(base64Url) {
  if (typeof base64Url !== 'string' || !base64Url) {
    throw new Error('Invalid WebAuthn challenge received from server');
  }

  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function getRpIdFromChallenge(challengeResponse) {
  return challengeResponse?.rp_id || import.meta.env.VITE_WEBAUTHN_RP_ID || window.location.hostname;
}

export async function createWebAuthnCredential(challengeResponse, userId, deviceLabel) {
  const pendingCredential = await triggerWebAuthnBrowserPrompt(challengeResponse, userId);
  return submitWebAuthnCredential(pendingCredential, challengeResponse, deviceLabel);
}

/**
 * Step 1 of 2: Trigger the native biometric/platform prompt.
 * Returns the raw credential object — call before account creation.
 */
export async function triggerWebAuthnBrowserPrompt(challengeResponse, userId) {
  if (!window.isSecureContext) {
    throw new Error('Biometric enrollment requires a secure context (HTTPS).');
  }

  if (!window.PublicKeyCredential || !navigator.credentials?.create) {
    throw new Error('This browser does not support passkeys/WebAuthn.');
  }

  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    const isPlatformAuthenticatorAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isPlatformAuthenticatorAvailable) {
      throw new Error('No platform authenticator is available on this device.');
    }
  }

  if (!challengeResponse?.challenge) {
    throw new Error('Missing WebAuthn challenge from server');
  }

  const challengeBuffer = base64UrlToArrayBuffer(challengeResponse.challenge);
  const rpId = getRpIdFromChallenge(challengeResponse);

  const basePublicKeyOptions = {
    challenge: challengeBuffer,
    rp: {
      name: 'CloudLock',
      id: rpId,
    },
    user: {
      id: new TextEncoder().encode(userId),
      name: userId,
      displayName: userId,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    timeout: 45000,
    attestation: 'none',
  };

  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        ...basePublicKeyOptions,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
      },
    });
  } catch (error) {
    // Some Android/Chrome combinations silently fail to show a platform-only prompt.
    // Retry once with broader authenticator options before surfacing an error.
    if (error?.name === 'NotAllowedError' || error?.name === 'NotSupportedError') {
      try {
        credential = await navigator.credentials.create({
          publicKey: {
            ...basePublicKeyOptions,
            authenticatorSelection: {
              userVerification: 'preferred',
              residentKey: 'preferred',
            },
          },
        });
      } catch {
        // Keep original error mapping below for user-facing diagnostics.
      }
    }

    if (credential) {
      return credential;
    }

    const errName = error?.name || 'Error';
    const errMessage = error?.message || 'Unknown error';
    const host = window.location.hostname;

    if (errName === 'NotAllowedError') {
      throw new Error('Biometric prompt was canceled or timed out. Please try again and complete the prompt.');
    }
    if (errName === 'SecurityError') {
      throw new Error(`Security error starting biometric enrollment. Ensure the site hostname (${host}) matches the configured RP ID (${rpId}).`);
    }
    if (errName === 'NotSupportedError') {
      throw new Error('This device/browser does not support the requested biometric passkey options.');
    }
    if (errName === 'InvalidStateError') {
      throw new Error('A passkey may already exist for this account on this device.');
    }

    throw new Error(`Unable to start biometric enrollment: ${errName}: ${errMessage}`);
  }

  if (!credential) {
    throw new Error('WebAuthn credential creation was cancelled');
  }

  return credential;
}

/**
 * Step 2 of 2: Send the credential to the backend after account creation.
 */
export async function submitWebAuthnCredential(credential, challengeResponse, deviceLabel) {
  if (!challengeResponse?.challenge_token) {
    throw new Error('Missing WebAuthn challenge token for registration');
  }

  const attestationObject = arrayBufferToBase64Url(credential.response.attestationObject);
  const clientDataJSON = arrayBufferToBase64Url(credential.response.clientDataJSON);
  const rawId = arrayBufferToBase64Url(credential.rawId);

  const response = await registerWebAuthnCredential({
    challenge_token: challengeResponse.challenge_token,
    device_label: deviceLabel,
    credential_id: credential.id,
    raw_id: rawId,
    client_data_json: clientDataJSON,
    attestation_object: attestationObject,
  });

  if (response?.error) {
    throw new Error(`Biometric credential registration failed: ${response.error}`);
  }

  return response;
}

export async function getWebAuthnAssertion(challengeResponse) {
  if (!challengeResponse?.challenge) {
    throw new Error('Missing WebAuthn assertion challenge from server');
  }

  const challengeBuffer = base64UrlToArrayBuffer(challengeResponse.challenge);
  const rpId = getRpIdFromChallenge(challengeResponse);

  const allowCredentials = (challengeResponse.allow_credential_ids || []).map((credentialId) => ({
    id: base64UrlToArrayBuffer(credentialId),
    type: 'public-key',
  }));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challengeBuffer,
      timeout: 60000,
      rpId,
      userVerification: 'required',
      ...(allowCredentials.length ? { allowCredentials } : {}),
    },
  });

  if (!assertion) {
    throw new Error('WebAuthn authentication was cancelled');
  }

  const clientDataJSON = arrayBufferToBase64Url(assertion.response.clientDataJSON);
  const authenticatorData = arrayBufferToBase64Url(assertion.response.authenticatorData);
  const signature = arrayBufferToBase64Url(assertion.response.signature);
  const rawId = arrayBufferToBase64Url(assertion.rawId);

  const response = await verifyWebAuthnAssertion({
    webauthn_challenge_token: challengeResponse.webauthn_challenge_token,
    credential_id: assertion.id,
    raw_id: rawId,
    client_data_json: clientDataJSON,
    authenticator_data: authenticatorData,
    signature,
  });

  if (response?.error) {
    throw new Error(`Biometric verification failed: ${response.error}`);
  }

  return response;
}
