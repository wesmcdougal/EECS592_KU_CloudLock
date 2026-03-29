/**
 * MFA API Client (mfaApi.js)
 *
 * Encapsulates frontend calls to MFA management endpoints. Responsibilities include:
 * - Reading current MFA status and enrolled methods
 * - Updating MFA method preferences
 * - Registering biometric device metadata
 * - Revoking biometric devices by identifier
 *
 * Revision History:
 * - Wesley McDougal - 29MAR2026 - Added MFA status/preference/device API wrappers
 */

import { get, post, put } from './apiService';

export async function getMfaStatus() {
  return get('/mfa/status');
}

export async function updateMfaPreferences({ enableBiometric = false, enableTotp = false }) {
  return put('/mfa/preferences', {
    enable_biometric: enableBiometric,
    enable_totp: enableTotp,
  });
}

export async function registerBiometricDevice({ deviceId, label }) {
  return post('/mfa/devices/biometric', {
    device_id: deviceId,
    label,
  });
}

export async function revokeBiometricDevice(deviceId) {
  return fetch(`${(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')}/mfa/devices/biometric/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: {
      ...(localStorage.getItem('cloudlock_token') && {
        Authorization: `Bearer ${localStorage.getItem('cloudlock_token')}`,
      }),
    },
  }).then(async (response) => {
    if (!response.ok) {
      let error = response.statusText;
      try {
        const payload = await response.json();
        error = payload.detail || payload.error || error;
      } catch {
        error = response.statusText;
      }
      return { status: response.status, error };
    }

    return response.json();
  });
}
