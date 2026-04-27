/*
Recovery Page Component
This component allows users to recover their account using a recovery QR code or manual text code.
It handles the entire recovery flow, including validating the input, communicating with the server,
decrypting the master key, rotating the recovery record, and providing the user with a new recovery QR code.
*/

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import RecoveryQrScanner from '../components/RecoveryQrScanner';
import { getRecoveryRecord, rotateRecoveryRecord, claimRecoverySession } from '../api/recoveryApi';
import { decryptMasterKeyWithRecovery } from '../crypto/recovery';
import {
  decodeRecoveryQrPayload,
  buildRecoveryQrPayload,
  encodeRecoveryQrPayload,
  generateRecoverySalt,
  generateRecoverySecretString,
} from '../crypto/recoveryQr';

export default function RecoveryPage({ onRecovered }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState('manual');
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState('');
  const [newQrUrl, setNewQrUrl] = useState('');
  const [newManualCode, setNewManualCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRecoveryInput(encodedInput) {
    setError('');
    setLoading(true);

    try {
      const qrPayload = decodeRecoveryQrPayload(encodedInput);

      const serverRecord = await getRecoveryRecord(qrPayload.userId);

      if (serverRecord.recoveryId !== qrPayload.recoveryId) {
        throw new Error('This recovery QR is no longer valid. Use the latest saved QR.');
      }

      if (serverRecord.isUsed) {
        throw new Error('This recovery QR has already been used.');
      }

      const recoveredMasterKeyRaw = await decryptMasterKeyWithRecovery(
        serverRecord.encryptedRecoveryBlob,
        qrPayload.recoverySecret,
        serverRecord.recoverySalt
      );

      // Rotate immediately after successful decryption
      const newRecoverySecret = generateRecoverySecretString();
      const newRecoverySalt = generateRecoverySalt();
      const newRecoveryId = crypto.randomUUID();

      const {
        encryptMasterKeyWithRecovery,
      } = await import('../crypto/recovery');

      const newEncryptedRecoveryBlob = await encryptMasterKeyWithRecovery(
        recoveredMasterKeyRaw instanceof Uint8Array
          ? recoveredMasterKeyRaw
          : new Uint8Array(recoveredMasterKeyRaw),
        newRecoverySecret,
        newRecoverySalt
      );

      await rotateRecoveryRecord({
        userId: qrPayload.userId,
        oldRecoveryId: qrPayload.recoveryId,
        newRecoveryId,
        newRecoverySalt,
        newEncryptedRecoveryBlob,
        version: 1,
      });

      // Claim session — newRecoveryId proves we had the valid QR and completed rotation
      const sessionData = await claimRecoverySession({
        userId: qrPayload.userId,
        newRecoveryId,
      });

      const replacementPayload = buildRecoveryQrPayload({
        userId: qrPayload.userId,
        recoveryId: newRecoveryId,
        recoverySecret: newRecoverySecret,
      });

      const encodedReplacement = encodeRecoveryQrPayload(replacementPayload);
      const replacementQrUrl = await QRCode.toDataURL(encodedReplacement, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
      });

      setNewQrUrl(replacementQrUrl);
      setNewManualCode(encodedReplacement);

      // Hand master key and session token to app — done after new QR is ready to display
      await onRecovered(recoveredMasterKeyRaw, qrPayload.userId, sessionData.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="recovery-qr-page" style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1rem', color: 'rgba(255,255,255,0.87)' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Account Recovery</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem' }}>
        Use the recovery QR code or manual text code you saved when you created your account.
      </p>

      {!newQrUrl && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
            <button
              type="button"
              className="action-button"
              style={{ opacity: mode === 'manual' ? 1 : 0.5 }}
              onClick={() => setMode('manual')}
            >
              Enter code manually
            </button>
            <button
              type="button"
              className="action-button"
              style={{ opacity: mode === 'scan' ? 1 : 0.5 }}
              onClick={() => setMode('scan')}
            >
              Scan QR code
            </button>
          </div>

          {mode === 'manual' ? (
            <div>
              <label htmlFor="recovery-manual-input" style={{ display: 'block', marginBottom: 8 }}>
                Paste your recovery code below:
              </label>
              <textarea
                id="recovery-manual-input"
                rows={6}
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Paste the text code from your saved recovery file…"
                style={{ width: '100%', marginTop: 4, background: '#1a1a1a', color: '#fff', border: '1px solid #444', borderRadius: 6, padding: 8, boxSizing: 'border-box', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="action-button"
                  disabled={loading}
                  onClick={() => navigate(-1)}
                  style={{ opacity: 0.6 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="action-button"
                  disabled={!manualValue.trim() || loading}
                  onClick={() => handleRecoveryInput(manualValue.trim())}
                >
                  {loading ? 'Verifying…' : 'Continue recovery'}
                </button>
              </div>
            </div>
          ) : (
            <RecoveryQrScanner
              onDecoded={(value) => handleRecoveryInput(value)}
              onError={setError}
            />
          )}
        </>
      )}

      {newQrUrl && (
        <div>
          <h2 style={{ color: '#1ecd97' }}>Recovery successful</h2>
          <p>Your previous recovery QR has been invalidated. <strong>Save this new one now</strong> — you will need it next time.</p>
          <img src={newQrUrl} alt="New recovery QR code" style={{ display: 'block', margin: '1rem auto', borderRadius: 8 }} />
          <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center' }}>
            <button
              type="button"
              className="action-button"
              onClick={() => {
                const a = document.createElement('a');
                a.href = newQrUrl;
                a.download = 'cloudlock-recovery.png';
                a.click();
              }}
            >
              Download QR
            </button>
            <button
              type="button"
              className="action-button"
              onClick={() => window.print()}
            >
              Print QR
            </button>
          </div>
          <details style={{ marginTop: 16, textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer' }}>Manual entry fallback</summary>
            <textarea
              readOnly
              value={newManualCode}
              rows={6}
              style={{ width: '100%', marginTop: 8, background: '#1a1a1a', color: '#fff', border: '1px solid #444', borderRadius: 6, padding: 8, boxSizing: 'border-box' }}
            />
          </details>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
            <button
              type="button"
              className="action-button"
              onClick={() => navigate('/main')}
            >
              Continue to your account
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: '#ff6b6b', marginTop: 16, background: '#2a1a1a', padding: '0.75rem', borderRadius: 6, border: '1px solid #ff6b6b' }}>
          {error}
        </p>
      )}
    </div>
  );
}