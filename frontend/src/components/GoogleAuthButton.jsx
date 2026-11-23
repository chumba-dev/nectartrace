import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { googleAuthEnabled } from '../lib/googleAuth';

function getInitialButtonWidth() {
  const viewportWidth = window.innerWidth;
  const panelWidth = viewportWidth >= 801 ? viewportWidth / 2 : viewportWidth;
  const horizontalPadding =
    viewportWidth >= 1100 ? 128 : viewportWidth >= 640 ? 80 : 40;

  return Math.max(
    200,
    Math.min(400, Math.floor(panelWidth - horizontalPadding))
  );
}

export default function GoogleAuthButton({
  onCredential,
  onError,
  disabled = false,
  disabledLabel = 'Connecting to Google...',
  text = 'continue_with',
}) {
  const containerRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [buttonWidth, setButtonWidth] = useState(getInitialButtonWidth);

  useEffect(() => {
    onCredentialRef.current = onCredential;
    onErrorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateWidth = () => {
      const nextWidth = Math.max(
        200,
        Math.min(400, Math.floor(container.getBoundingClientRect().width))
      );
      setButtonWidth((current) =>
        current === nextWidth ? current : nextWidth
      );
    };

    updateWidth();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleSuccess = useCallback((response) => {
    if (!response.credential) {
      onErrorRef.current?.(new Error('Google did not return a credential'));
      return;
    }
    onCredentialRef.current?.(response.credential);
  }, []);

  const handleError = useCallback(() => {
    onErrorRef.current?.(new Error('Google sign-in was not completed'));
  }, []);

  if (!googleAuthEnabled) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-10 w-full justify-center overflow-hidden rounded-md bg-white"
      aria-busy={disabled}
    >
      <div
        inert={disabled ? true : undefined}
        aria-hidden={disabled || undefined}
      >
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={handleError}
          text={text}
          theme="outline"
          shape="rectangular"
          size="large"
          logo_alignment="left"
          width={buttonWidth}
        />
      </div>
      {disabled && (
        <div
          className="absolute inset-0 flex items-center justify-center border border-[#dadce0] bg-white px-4 text-center text-sm font-medium text-[#3c4043]"
          role="status"
        >
          {disabledLabel}
        </div>
      )}
    </div>
  );
}
