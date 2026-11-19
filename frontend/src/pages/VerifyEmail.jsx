import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { authApi } from '../lib/api';

function StateIcon({ kind }) {
  if (kind === 'success') {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (kind === 'loading') {
    return (
      <span className="block h-7 w-7 animate-spin rounded-full border-2 border-beeswax/30 border-t-beeswax" />
    );
  }

  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 17h.01" />
    </svg>
  );
}

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const [identifier, setIdentifier] = useState('');

  useEffect(() => {
    document.title = 'Verify email — NectarTrace';
  }, []);

  const verification = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () =>
      authApi.verifyEmail({ token }).then((response) => response.data),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
  });

  const resend = useMutation({
    mutationFn: (value) =>
      authApi
        .resendVerification({ identifier: value })
        .then((response) => response.data),
  });

  const handleResend = (event) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    resend.mutate(identifier.trim());
  };

  const message = verification.error?.message || '';
  const expired =
    verification.error?.code === 'EMAIL_VERIFICATION_EXPIRED' ||
    /expired/i.test(message);
  const alreadyVerified = /already verified/i.test(message);

  let kind = 'error';
  let eyebrow = 'Verification problem';
  let title = 'We could not verify this link';
  let description = message || 'The verification link is invalid.';

  if (!token) {
    title = 'Verification link missing';
    description = 'Open the complete link from your verification email.';
  } else if (verification.isPending) {
    kind = 'loading';
    eyebrow = 'One moment';
    title = 'Verifying your email';
    description = 'Please keep this page open while we confirm your address.';
  } else if (verification.isSuccess) {
    kind = 'success';
    eyebrow = 'Email confirmed';
    title = 'Your account is ready';
    description =
      verification.data?.message ||
      'Your email has been verified. You can now sign in.';
  } else if (expired) {
    eyebrow = 'Link expired';
    title = 'Request a fresh verification link';
    description =
      'This link is no longer valid. Enter your email address or phone number below.';
  }

  const showResend = Boolean(token) && verification.isError && !alreadyVerified;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-20 sm:py-24">
      <Card className="w-full p-5 text-center sm:p-8">
        <div
          className={`${kind === 'success' ? 'border-sage/40 bg-sage/15 text-sage' : kind === 'loading' ? 'border-beeswax/30 bg-beeswax/10 text-beeswax' : 'border-red-500/30 bg-red-500/10 text-red-300'} mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border`}
        >
          <StateIcon kind={kind} />
        </div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-beeswax">
          {eyebrow}
        </p>
        <h1 className="font-display text-3xl text-ivory">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-dust">{description}</p>

        {showResend && (
          <form onSubmit={handleResend} className="mt-6 text-left">
            <label className="mb-2 block text-sm text-dust">
              Email or phone number
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-dust/20 bg-obsidian px-4 py-3 text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none"
              required
            />
            {resend.isSuccess && (
              <div className="mt-4 rounded-md border border-sage/40 bg-sage/10 px-4 py-3 text-sm text-ivory">
                {resend.data?.message ||
                  'If the account exists, a new verification email is on its way.'}
              </div>
            )}
            {resend.isError && (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {resend.error.message}
              </div>
            )}
            <Button
              type="submit"
              variant="outline"
              className="mt-4 w-full"
              disabled={resend.isPending || !identifier.trim()}
            >
              {resend.isPending ? 'Sending...' : 'Resend verification'}
            </Button>
          </form>
        )}

        {(!token || !verification.isPending) && (
          <Link
            to="/login"
            state={{
              identifier: verification.data?.data?.user?.email || '',
              authNotice: verification.isSuccess
                ? 'Email verified. Sign in to continue.'
                : '',
            }}
            className="mt-7 inline-block text-sm text-beeswax hover:underline"
          >
            Continue to sign in
          </Link>
        )}
      </Card>
    </div>
  );
}
