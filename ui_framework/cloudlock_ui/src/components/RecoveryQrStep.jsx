/*
Recovery QR Step Component
This component is responsible for generating a recovery QR code during the registration process.
It creates a recovery record on the backend with the encrypted master key and generates a QR code containing the necessary information for account recovery.
The user can download or print the QR code, and there is also a manual code fallback for entry without scanning.
*/

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { encryptMasterKeyWithRecovery } from '../crypto/recovery';
import {
  buildRecoveryQrPayload,
  encodeRecoveryQrPayload,
  generateRecoverySalt,
  generateRecoverySecretString,
} from '../crypto/recoveryQr';
import { createRecoveryRecord } from '../api/recoveryApi';

export default function RecoveryQrStep({
  userId,
  masterKeyRaw,
  onComplete,
}) {
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      setLoading(true);
      setError('');

      try {
        const recoverySecret = generateRecoverySecretString();
        const recoverySalt = generateRecoverySalt();
        const recoveryId = crypto.randomUUID();

        const encryptedRecoveryBlob = await encryptMasterKeyWithRecovery(
          masterKeyRaw,
          recoverySecret,
          recoverySalt
        );

        const qrPayload = buildRecoveryQrPayload({
          userId,
          recoveryId,
          recoverySecret,
        });

        const encodedQr = encodeRecoveryQrPayload(qrPayload);

        await createRecoveryRecord({
          userId,
          recoveryId,
          recoverySalt,
          encryptedRecoveryBlob,
          version: 1,
        });

        const qrUrl = await QRCode.toDataURL(encodedQr, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 280,
        });

        if (cancelled) return;

        setQrImageUrl(qrUrl);
        setManualCode(encodedQr);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to generate recovery QR.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
    };
  }, [userId, masterKeyRaw]);

  function handleDownload() {
    if (!qrImageUrl) return;
    const a = document.createElement('a');
    a.href = qrImageUrl;
    a.download = `recovery-${userId}.png`;
    a.click();
  }

  if (loading) return <p>Generating recovery QR…</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <section>
      <h2>Save your recovery QR code</h2>
      <p>
        Download or print this QR code and store it safely offline.
        You will need it to recover your account.
      </p>

      <img src={qrImageUrl} alt="Recovery QR code" />

      <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center' }}>
        <button type="button" onClick={handleDownload}>Download QR</button>
        <button type="button" onClick={() => window.print()}>Print QR</button>
      </div>

      <details style={{ marginTop: 16 }}>
        <summary>Manual entry fallback</summary>
        <textarea
          readOnly
          value={manualCode}
          rows={6}
          style={{ width: '100%' }}
        />
      </details>

      <label style={{ display: 'block', marginTop: 16 }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{' '}
        I’ve saved my recovery QR
      </label>

      <button
        type="button"
        disabled={!confirmed}
        onClick={onComplete}
        style={{ marginTop: 16 }}
      >
        Finish registration
      </button>
    </section>
  );
}