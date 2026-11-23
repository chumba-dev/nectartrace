import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import GoogleAuthButton from '../components/GoogleAuthButton';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { getPostAuthDestination } from '../lib/authNavigation';
import { googleAuthEnabled } from '../lib/googleAuth';

function requiresEmailVerification(error) {
  const code = error?.code || error?.data?.code;
  return (
    code === 'EMAIL_NOT_VERIFIED' ||
    /email.*(unverified|not verified)|verify your email/i.test(
      error?.message || ''
    )
  );
}

const inputClass =
  'w-full rounded-lg border border-dust/25 bg-stone-deep px-4 py-3 text-sm text-ivory placeholder:text-dust/55 transition-colors focus:border-beeswax focus:outline-none';
const labelClass = 'mb-2 block text-sm font-medium text-ivory';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, googleLogin } = useAuth();

  const [identifier, setIdentifier] = useState(
    () => location.state?.identifier || ''
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice] = useState(() => location.state?.authNotice || '');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendState, setResendState] = useState({
    loading: false,
    message: '',
    error: '',
  });

  useEffect(() => {
    document.title = 'Login — NectarTrace';
  }, []);

  const from = location.state?.from?.pathname;
  const isCheckoutReturn =
    typeof from === 'string' && from.startsWith('/listings/');
  const createAccountPath = isCheckoutReturn ? '/register/buyer' : '/register';

  const routeAfterLogin = (user) => {
    navigate(getPostAuthDestination(user, from), { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setVerificationRequired(false);
    setResendState({ loading: false, message: '', error: '' });
    setLoading(true);

    try {
      const user = await login(identifier.trim(), password);
      routeAfterLogin(user);
    } catch (err) {
      const needsVerification = requiresEmailVerification(err);
      setVerificationRequired(needsVerification);
      setError(
        needsVerification
          ? err.message || 'Verify your email before signing in.'
          : err.message || 'Login failed'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!identifier.trim()) {
      setResendState({
        loading: false,
        message: '',
        error: 'Enter your email address or phone number first.',
      });
      return;
    }

    setResendState({ loading: true, message: '', error: '' });
    try {
      const response = await authApi.resendVerification({
        identifier: identifier.trim(),
      });
      setResendState({
        loading: false,
        message:
          response.data.message ||
          'If the account exists, a new verification email is on its way.',
        error: '',
      });
    } catch (err) {
      setResendState({
        loading: false,
        message: '',
        error: err.message || 'Unable to resend the verification email.',
      });
    }
  };

  const handleGoogleCredential = async (credential) => {
    setError('');
    setGoogleLoading(true);
    try {
      const user = await googleLogin({ credential });
      routeAfterLogin(user);
    } catch (err) {
      if (
        err.code === 'GOOGLE_PROFILE_INCOMPLETE' ||
        err.data?.code === 'GOOGLE_PROFILE_INCOMPLETE'
      ) {
        navigate(isCheckoutReturn ? '/register/buyer' : '/register', {
          replace: true,
          state: {
            authNotice: isCheckoutReturn
              ? 'Your Google profile needs a phone number. Buyer is selected for this order; enter your phone number, then continue with Google again.'
              : 'Your Google profile needs a phone number and account role. Choose your role, then continue with Google on the next screen.',
            from: location.state?.from,
          },
        });
        return;
      }
      setError(err.message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Secure account access"
      title="Welcome back"
      description="Sign in to continue buying, verifying, or managing traceable honey."
      quote="Every trusted batch begins with a person who can stand behind its story."
      quoteMeta="Verified origin · Baringo County"
      imageAlt="Golden honey, honeycomb, and wooden honey dippers"
      steps={['Identity', 'Secure access', 'Traceability']}
      currentStep={2}
    >
      <div className="space-y-5">
        {notice && (
          <div
            className="rounded-lg border border-beeswax/30 bg-beeswax/10 px-4 py-3 text-sm leading-6 text-beeswax"
            role="status"
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
              verificationRequired
                ? 'border-beeswax/30 bg-beeswax/10 text-beeswax'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
            role="alert"
          >
            <p>{error}</p>
            {verificationRequired && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendState.loading}
                className="mt-2 font-medium text-ivory underline decoration-beeswax/50 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendState.loading
                  ? 'Sending...'
                  : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        {resendState.message && (
          <div
            className="rounded-lg border border-sage/50 bg-sage/15 px-4 py-3 text-sm leading-6 text-ivory"
            role="status"
          >
            {resendState.message}
          </div>
        )}

        {resendState.error && (
          <div
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300"
            role="alert"
          >
            {resendState.error}
          </div>
        )}

        {googleAuthEnabled && (
          <GoogleAuthButton
            onCredential={handleGoogleCredential}
            onError={(googleError) => setError(googleError.message)}
            disabled={googleLoading}
            text="signin_with"
          />
        )}

        {googleAuthEnabled && (
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-dust/20" />
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-dust">
              or use your password
            </span>
            <span className="h-px flex-1 bg-dust/20" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="login-identifier" className={labelClass}>
              Email or phone number
            </label>
            <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com or +254 700 000 000"
              className={inputClass}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" className={labelClass}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className={inputClass}
              autoComplete="current-password"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full py-3.5"
            disabled={loading || googleLoading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-dust">
          New to NectarTrace?{' '}
          <Link
            to={createAccountPath}
            state={{
              from: location.state?.from,
              authNotice: isCheckoutReturn
                ? 'Create a buyer account to continue your order.'
                : undefined,
            }}
            className="font-medium text-beeswax hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
