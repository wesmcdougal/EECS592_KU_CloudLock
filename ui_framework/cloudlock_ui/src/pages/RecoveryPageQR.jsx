import { useState } from 'react';
import QRCode from 'qrcode';
import RecoveryQrScanner from '../components/RecoveryQrScanner';
import { getRecoveryRecord, rotateRecoveryRecord } from '../api/recoveryApi';
import { decryptMasterKeyWithRecovery } from '../crypto/recovery';
import {
  decodeRecoveryQrPayload,
  buildRecoveryQrPayload,
  encodeRecoveryQrPayload,
  generateRecoverySalt,
  generateRecoverySecretString,
} from '../crypto/recoveryQr';

export default function RecoveryPage({ onRecovered }) {
  const [mode, setMode] = useState('scan');
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState('');
  const [newQrUrl, setNewQrUrl] = useState('');
  const [newManualCode, setNewManualCode] = useState('');

  async function handleRecoveryInput(encodedInput) {
    setError('');

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

      // Hand the recovered raw master key back to your app/session flow.
      await onRecovered(recoveredMasterKeyRaw, qrPayload.userId);

      // Rotate immediately after successful recovery
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed.');
    }
  }

  return (
    <section>
      <h1>Recover account</h1>

      {!newQrUrl && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button type="button" onClick={() => setMode('scan')}>Scan QR</button>
            <button type="button" onClick={() => setMode('manual')}>Enter code manually</button>
          </div>

          {mode === 'scan' ? (
            <RecoveryQrScanner
              onDecoded={(value) => handleRecoveryInput(value)}
              onError={setError}
            />
          ) : (
            <div>
              <label htmlFor="recovery-manual-input">Recovery code</label>
              <textarea
                id="recovery-manual-input"
                rows={8}
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                style={{ width: '100%', marginTop: 8 }}
              />
              <button
                type="button"
                onClick={() => handleRecoveryInput(manualValue)}
                style={{ marginTop: 12 }}
              >
                Continue recovery
              </button>
            </div>
          )}
        </>
      )}

      {newQrUrl && (
        <div>
          <h2>Recovery successful</h2>
          <p>Your previous recovery QR has been invalidated. Save this new one now.</p>
          <img src={newQrUrl} alt="New recovery QR code" />

          <details style={{ marginTop: 16 }}>
            <summary>Manual entry fallback</summary>
            <textarea
              readOnly
              value={newManualCode}
              rows={6}
              style={{ width: '100%' }}
            />
          </details>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}