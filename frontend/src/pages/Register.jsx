import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { getPostAuthDestination } from '../lib/authNavigation';
import { googleAuthEnabled } from '../lib/googleAuth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register({ accountType = 'BUYER' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, googleLogin } = useAuth();
  const registrationRole =
    accountType === 'COOPERATIVE_STAFF' ? 'COOPERATIVE_STAFF' : 'BUYER';
  const isCooperativeStaff = registrationRole === 'COOPERATIVE_STAFF';

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verification, setVerification] = useState(null);
  const [resendState, setResendState] = useState({
    loading: false,
    message: '',
    error: '',
  });

  useEffect(() => {
    document.title = isCooperativeStaff
      ? 'Cooperative staff application — NectarTrace'
      : 'Create buyer account — NectarTrace';
  }, [isCooperativeStaff]);

  const handleChange = (e) => {
    setForm((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!name) {
      setError('Full name is required');
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    if (!phone) {
      setError('Phone number is required');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name,
        email,
        phone,
        password: form.password,
        role: registrationRole,
      };

      const result = await register(payload);
      setVerification({
        email,
        emailSent: result.emailSent,
        message:
          result.emailSent === false
            ? 'Your account was created, but the first email could not be sent. Use resend below.'
            : 'We sent a verification link to your inbox.',
      });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    const phone = form.phone.trim();
    if (!phone) {
      setError(
        'Enter your phone number before continuing with Google. It is required for a new Google account.'
      );
      return;
    }

    setError('');
    setGoogleLoading(true);
    try {
      const user = await googleLogin({
        credential,
        phone,
        role: registrationRole,
      });
      navigate(getPostAuthDestination(user, location.state?.from?.pathname), {
        replace: true,
      });
    } catch (err) {
      setError(err.message || 'Google registration failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResend = async () => {
    setResendState({ loading: true, message: '', error: '' });
    try {
      const response = await authApi.resendVerification({
        identifier: verification.email,
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

  const inputClass =
    'w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors';
  const labelClass = 'block text-sm text-dust mb-2';

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center px-4 py-20 sm:py-24">
      <div className="w-full max-w-md">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4 text-center">
          {isCooperativeStaff ? 'Cooperative access' : 'Buyer registration'}
        </p>
        <h1 className="text-display-md font-display text-ivory mb-8 text-center text-balance">
          {isCooperativeStaff
            ? 'Apply as cooperative staff'
            : 'Create your buyer account'}
        </h1>

        <Card className="p-5 sm:p-8">
          {verification ? (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-beeswax/30 bg-beeswax/10 text-beeswax">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M4 4h16v16H4z" />
                  <path d="m4 6 8 6 8-6" />
                </svg>
              </div>
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-beeswax">
                Check your email
              </p>
              <h2 className="font-display text-2xl text-ivory">
                Confirm your address
              </h2>
              <p className="mt-3 text-sm leading-6 text-dust">
                {verification.message} The link was requested for{' '}
                <span className="break-all text-ivory">
                  {verification.email}
                </span>
                .
              </p>

              {resendState.message && (
                <div className="mt-5 rounded-md border border-sage/40 bg-sage/10 px-4 py-3 text-left text-sm text-ivory">
                  {resendState.message}
                </div>
              )}
              {resendState.error && (
                <div className="mt-5 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm text-red-300">
                  {resendState.error}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={handleResend}
                disabled={resendState.loading}
              >
                {resendState.loading ? 'Sending...' : 'Resend verification'}
              </Button>
              <Link
                to="/login"
                state={{
                  identifier: verification.email,
                  from: location.state?.from,
                }}
                className="mt-5 inline-block text-sm text-beeswax hover:underline"
              >
                Continue to sign in
              </Link>
            </div>
          ) : (
            <>
              {location.state?.authNotice && (
                <div className="mb-6 rounded-md border border-beeswax/30 bg-beeswax/10 px-4 py-3 text-sm leading-6 text-beeswax">
                  {location.state.authNotice}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                <div>
                  <label className={labelClass}>Full name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="John Kipkoech"
                    className={inputClass}
                    autoComplete="name"
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Email address</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    className={inputClass}
                    autoComplete="email"
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Phone number</label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+254 700 000 000"
                    className={inputClass}
                    autoComplete="tel"
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="At least 8 characters"
                    className={inputClass}
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {isCooperativeStaff && (
                  <div className="rounded-md border border-beeswax/30 bg-beeswax/5 p-4">
                    <p className="text-sm text-beeswax">
                      This creates a cooperative-staff application.
                    </p>
                    <p className="mt-1.5 text-xs text-dust">
                      An administrator must link your account to a cooperative
                      before you can register batches or create listings.
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? 'Creating account...' : 'Create account'}
                </Button>
              </form>

              {googleAuthEnabled && (
                <>
                  <div
                    className="my-6 flex items-center gap-3"
                    aria-hidden="true"
                  >
                    <span className="h-px flex-1 bg-dust/15" />
                    <span className="font-mono text-xs uppercase tracking-widest text-dust">
                      or
                    </span>
                    <span className="h-px flex-1 bg-dust/15" />
                  </div>
                  <p className="mb-4 text-center text-xs leading-5 text-dust">
                    New Google profiles require the phone number above. This
                    will create a{' '}
                    {isCooperativeStaff
                      ? 'cooperative-staff application'
                      : 'buyer account'}
                    .
                  </p>
                  <GoogleAuthButton
                    onCredential={handleGoogleCredential}
                    onError={(err) => setError(err.message)}
                    disabled={googleLoading}
                    text="signup_with"
                  />
                </>
              )}

              <p className="mt-6 text-center text-sm text-dust">
                Already have an account?{' '}
                <Link
                  to="/login"
                  state={{ from: location.state?.from }}
                  className="text-beeswax hover:underline"
                >
                  Sign in
                </Link>
              </p>
              <p className="mt-3 text-center text-sm text-dust">
                {isCooperativeStaff
                  ? 'Looking to purchase honey? '
                  : 'Representing a cooperative? '}
                <Link
                  to={
                    isCooperativeStaff ? '/register' : '/register/cooperative'
                  }
                  state={{ from: location.state?.from }}
                  className="text-beeswax hover:underline"
                >
                  {isCooperativeStaff
                    ? 'Create a buyer account'
                    : 'Apply for staff access'}
                </Link>
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
