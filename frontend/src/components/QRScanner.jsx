import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Button from './ui/Button';

async function stopAndClear(scanner) {
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    // The scanner may still be starting or may already be stopped.
  }

  try {
    scanner.clear();
  } catch {
    // Clearing an already-removed scanner is safe to ignore.
  }
}

export default function QRScanner({ onScan }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const readerId = `qr-reader-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!scanning) return;

    let disposed = false;
    let handled = false;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            if (disposed || handled) return;

            let scannedBatchId = decodedText.trim();
            try {
              const url = new URL(scannedBatchId);
              scannedBatchId = url.searchParams.get('batchId')?.trim() || '';
            } catch {
              // Plain batch IDs are also supported.
            }

            if (!scannedBatchId) {
              setError('This QR code does not contain a batch ID.');
              return;
            }

            handled = true;
            onScanRef.current(scannedBatchId);
            setScanning(false);
          },
          () => {}
        );

        if (disposed) {
          await stopAndClear(scanner);
        }
      } catch (err) {
        await stopAndClear(scanner);
        if (!disposed) {
          setError(err.message || 'Camera access denied');
          setScanning(false);
        }
      }
    };

    void startScanner();

    return () => {
      disposed = true;
      if (scannerRef.current === scanner) {
        scannerRef.current = null;
      }
      void stopAndClear(scanner);
    };
  }, [readerId, scanning]);

  const startScan = () => {
    setError('');
    setScanning(true);
  };

  const stopScan = () => {
    setScanning(false);
  };

  return (
    <div>
      {!scanning && (
        <Button
          type="button"
          onClick={startScan}
          variant="secondary"
          className="w-full"
        >
          Scan QR code
        </Button>
      )}

      {scanning && (
        <div>
          <div
            id={readerId}
            className="w-full rounded-lg overflow-hidden border border-dust/20"
          />
          <Button
            type="button"
            onClick={stopScan}
            variant="ghost"
            className="w-full mt-3"
          >
            Cancel scan
          </Button>
        </div>
      )}

      {error && <p className="text-red-300 text-sm mt-2">{error}</p>}
    </div>
  );
}
