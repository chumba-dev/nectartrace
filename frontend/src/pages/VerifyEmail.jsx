import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import Button from '../components/ui/Button';
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
      <span
        className="block h-7 w-7 animate-spin rounded-full border-2 border-beeswax/30 border-t-beeswax"
        aria-hidden="true"
      />
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
    description =
      'Open the complete link from your verification email, or request a fresh one below.';
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
  } else if (alreadyVerified) {
    kind = 'success';
    eyebrow = 'Already confirmed';
    title = 'Your email is already verified';
    description = 'No further confirmation is needed. Continue to sign in.';
  } else if (expired) {
    eyebrow = 'Link expired';
    title = 'Request a fresh verification link';
    description =
      'This link is no longer valid. Enter your email address or phone number below.';
  }

  const showResend = (!token || verification.isError) && !alreadyVerified;
  const iconClass =
    kind === 'success'
      ? 'border-sage/50 bg-sage/15 text-sage'
      : kind === 'loading'
        ? 'border-beeswax/30 bg-beeswax/10 text-beeswax'
        : 'border-red-500/30 bg-red-500/10 text-red-300';

  return (
    <AuthShell
      eyebrow="Email verification"
      title="Confirm the address behind your account"
      description="Verification protects account access before any password registration can sign in."
      quote="Clear provenance starts with a verified identity at every point in the chain."
      quoteMeta="Identity check · Secure access"
      imageAlt="Golden honey, honeycomb, and wooden honey dippers"
      steps={['Account created', 'Email link', 'Secure access']}
      currentStep={verification.isSuccess || alreadyVerified ? 3 : 2}
    >
      <section
        className="rounded-xl border border-dust/15 bg-stone-deep p-5 text-center sm:p-8"
        aria-live="polite"
        aria-busy={kind === 'loading'}
      >
        <div
          className={`${iconClass} mx-auto flex h-14 w-14 items-center justify-center rounded-full border`}
        >
          <StateIcon kind={kind} />
        </div>
        <p className="mb-2 mt-5 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-beeswax">
          {eyebrow}
        </p>
        <h2 className="font-display text-2xl font-bold text-ivory">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-dust">{description}</p>

        {showResend && (
          <form onSubmit={handleResend} className="mt-6 text-left">
            <label
              htmlFor="verification-identifier"
              className="mb-2 block text-sm font-medium text-ivory"
            >
              Email or phone number
            </label>
            <input
              id="verification-identifier"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com or +254 700 000 000"
              className="w-full rounded-lg border border-dust/25 bg-obsidian px-4 py-3 text-sm text-ivory placeholder:text-dust/55 focus:border-beeswax focus:outline-none"
              autoComplete="username"
              required
            />
            {resend.isSuccess && (
              <div
                className="mt-4 rounded-lg border border-sage/50 bg-sage/15 px-4 py-3 text-sm leading-6 text-ivory"
                role="status"
              >
                {resend.data?.message ||
                  'If the account exists, a new verification email is on its way.'}
              </div>
            )}
            {resend.isError && (
              <div
                className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300"
                role="alert"
              >
                {resend.error.message}
              </div>
            )}
            <Button
              type="submit"
              variant="outline"
              className="mt-4 w-full py-3"
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
            className="mt-7 inline-block text-sm font-medium text-beeswax hover:underline"
          >
            Continue to sign in
          </Link>
        )}
      </section>
    </AuthShell>
  );
}
