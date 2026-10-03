import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Button from './ui/Button';

export default function QRScanner({ onScan }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);

  const startScan = async () => {
    setError('');
    setScanning(true);

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Parse batchId from URL
          try {
            const url = new URL(decodedText);
            const batchId = url.searchParams.get('batchId');
            if (batchId) {
              onScan(batchId);
              stopScan();
            }
          } catch {
            // Maybe it's just the batch ID
            onScan(decodedText);
            stopScan();
          }
        },
        () => {} // ignore per-frame errors
      );
    } catch (err) {
      setError(err.message || 'Camera access denied');
      setScanning(false);
    }
  };

  const stopScan = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (error) {
        // Ignore cleanup errors when the scanner is already closed.
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScan();
    };
  }, []);

  return (
    <div>
      {!scanning && (
        <Button onClick={startScan} variant="secondary" className="w-full">
          📷 Scan QR code
        </Button>
      )}

      {scanning && (
        <div>
          <div
            id="qr-reader"
            className="w-full rounded-lg overflow-hidden border border-dust/20"
          />
          <Button
            onClick={stopScan}
            variant="ghost"
            className="w-full mt-3"
          >
            Cancel scan
          </Button>
        </div>
      )}

      {error && (
        <p className="text-red-300 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
