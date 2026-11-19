import { GoogleLogin } from '@react-oauth/google';
import { googleAuthEnabled } from '../lib/googleAuth';

export default function GoogleAuthButton({
  onCredential,
  onError,
  disabled = false,
  text = 'continue_with',
}) {
  if (!googleAuthEnabled) return null;

  if (disabled) {
    return (
      <div className="flex h-10 w-full items-center justify-center rounded-md border border-dust/20 bg-obsidian text-sm text-dust opacity-60">
        Connecting to Google...
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center overflow-hidden">
      <GoogleLogin
        onSuccess={(response) => {
          if (!response.credential) {
            onError?.(new Error('Google did not return a credential'));
            return;
          }
          onCredential?.(response.credential);
        }}
        onError={() => onError?.(new Error('Google sign-in was not completed'))}
        text={text}
        theme="filled_black"
        shape="rectangular"
        size="large"
        width="240"
      />
    </div>
  );
}
