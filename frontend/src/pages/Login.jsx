import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import GoogleAuthButton from '../components/GoogleAuthButton';
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

  const routeAfterLogin = (user) => {
    navigate(getPostAuthDestination(user, from), { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
        navigate('/register', {
          replace: true,
          state: {
            authNotice:
              'Your Google profile needs a phone number. Enter it below, then continue with Google again to create a buyer account.',
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

  const inputClass =
    'w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors';

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center px-4 py-20 sm:py-24">
      <div className="w-full max-w-md">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4 text-center">
          Welcome back
        </p>
        <h1 className="text-display-md font-display text-ivory mb-8 text-center text-balance">
          Sign in to NectarTrace
        </h1>

        <Card className="p-5 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {notice && (
              <div className="rounded-md border border-beeswax/30 bg-beeswax/10 px-4 py-3 text-sm text-beeswax">
                {notice}
              </div>
            )}
            {error && (
              <div
                className={`${verificationRequired ? 'border-beeswax/30 bg-beeswax/10 text-beeswax' : 'border-red-500/30 bg-red-500/10 text-red-300'} rounded-md border px-4 py-3 text-sm`}
              >
                <p>{error}</p>
                {verificationRequired && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendState.loading}
                    className="mt-2 font-medium text-ivory underline decoration-beeswax/50 underline-offset-4 disabled:opacity-50"
                  >
                    {resendState.loading
                      ? 'Sending...'
                      : 'Resend verification email'}
                  </button>
                )}
              </div>
            )}

            {resendState.message && (
              <div className="rounded-md border border-sage/40 bg-sage/10 px-4 py-3 text-sm text-ivory">
                {resendState.message}
              </div>
            )}

            {resendState.error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {resendState.error}
              </div>
            )}

            <div>
              <label className="block text-sm text-dust mb-2">
                Email or phone number
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or +254 700 000 000"
                className={inputClass}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-dust mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
                autoComplete="current-password"
                required
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          {googleAuthEnabled && (
            <>
              <div className="my-6 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-dust/15" />
                <span className="font-mono text-xs uppercase tracking-widest text-dust">
                  or
                </span>
                <span className="h-px flex-1 bg-dust/15" />
              </div>
              <GoogleAuthButton
                onCredential={handleGoogleCredential}
                onError={(err) => setError(err.message)}
                disabled={googleLoading}
                text="signin_with"
              />
            </>
          )}

          <p className="mt-6 text-center text-sm text-dust">
            New to NectarTrace?{' '}
            <Link
              to="/register"
              state={{
                from: location.state?.from,
                authNotice: 'Create a buyer account to continue your order.',
              }}
              className="text-beeswax hover:underline"
            >
              Create an account
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
