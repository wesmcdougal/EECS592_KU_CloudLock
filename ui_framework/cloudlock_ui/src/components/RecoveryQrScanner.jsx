import { useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function RecoveryQrScanner({ onDecoded, onError }) {
  useEffect(() => {
    const elementId = 'recovery-qr-reader';
    const scanner = new Html5Qrcode(elementId);

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        try {
          await scanner.stop();
        } catch (_) {}
        onDecoded(decodedText);
      },
      () => {}
    ).catch((err) => {
      onError(err?.message || 'Unable to access camera.');
    });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [onDecoded, onError]);

  return <div id="recovery-qr-reader" style={{ width: 320 }} />;
}