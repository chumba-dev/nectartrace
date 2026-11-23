import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import GoogleAuthButton from '../components/GoogleAuthButton';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { getPostAuthDestination } from '../lib/authNavigation';
import { googleAuthEnabled } from '../lib/googleAuth';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const roleConfigs = {
  BUYER: {
    role: 'BUYER',
    pageTitle: 'Create buyer account',
    eyebrow: 'Buyer account',
    title: 'Source honey you can verify',
    description:
      'Create a buyer profile to purchase traceable batches directly from verified cooperatives.',
    quote:
      'Every purchase should carry the story of the people and place behind it.',
    quoteMeta: 'Marketplace access · Verified supply',
    imageAlt: 'Golden honey, honeycomb, and wooden honey dippers',
    googleNoun: 'buyer account',
    submitLabel: 'Create buyer account',
  },
  COOPERATIVE_STAFF: {
    role: 'COOPERATIVE_STAFF',
    pageTitle: 'Cooperative staff application',
    eyebrow: 'Cooperative staff application',
    title: 'Apply for cooperative access',
    description:
      'Create a staff application. An administrator must assign you to a cooperative, and that cooperative must be verified before dashboard access unlocks.',
    quote:
      'Trust is built when quality is measured carefully and origin is recorded clearly.',
    quoteMeta: 'Cooperative workflow · Quality control',
    imageAlt: 'Golden honey, honeycomb, and wooden honey dippers',
    googleNoun: 'cooperative-staff application',
    submitLabel: 'Submit staff application',
    callout:
      'Submitting this form creates a staff application only. An administrator must assign your account, and the assigned cooperative must be verified before you can use the dashboard.',
  },
  FARMER: {
    role: 'FARMER',
    pageTitle: 'Create farmer account',
    eyebrow: 'Farmer account',
    title: 'Bring your harvest into view',
    description:
      'Create an online farmer profile. Farmers may instead opt in through the USSD flow when a smartphone or mobile data is not available.',
    quote:
      'A harvest carries more value when its farmer, village, and journey remain visible.',
    quoteMeta: 'Farmer identity · USSD alternative',
    imageAlt: 'Golden honey, honeycomb, and wooden honey dippers',
    googleNoun: 'farmer account',
    submitLabel: 'Create farmer account',
    callout:
      'Prefer a basic phone? The USSD opt-in alternative remains available; this web form is for an email-and-password account.',
  },
  CONSUMER: {
    role: 'CONSUMER',
    pageTitle: 'Create consumer account',
    eyebrow: 'Consumer account',
    title: 'Know the story behind every jar',
    description:
      'Create a consumer profile focused on QR verification of honey origin and quality records.',
    quote:
      'One scan should reveal where the honey came from and who verified its quality.',
    quoteMeta: 'QR verification · Clear provenance',
    imageAlt: 'Golden honey, honeycomb, and wooden honey dippers',
    googleNoun: 'consumer account',
    submitLabel: 'Create consumer account',
  },
};

const inputClass =
  'w-full rounded-lg border border-dust/25 bg-stone-deep px-4 py-3 text-sm text-ivory placeholder:text-dust/55 transition-colors focus:border-beeswax focus:outline-none';
const labelClass = 'mb-2 block text-sm font-medium text-ivory';

export default function Register({ accountType }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, googleLogin } = useAuth();
  const roleConfig = roleConfigs[accountType];
  const registrationRole = roleConfig?.role;

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
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
    document.title = roleConfig
      ? `${roleConfig.pageTitle} — NectarTrace`
      : 'Register — NectarTrace';
  }, [roleConfig]);

  if (!roleConfig) {
    return <Navigate to="/register" replace />;
  }

  const handleChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const name = `${firstName} ${lastName}`.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!firstName || !lastName) {
      setError('First and last name are required');
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
      const result = await register({
        name,
        email,
        phone,
        password: form.password,
        role: registrationRole,
      });
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
        'Enter your phone number before continuing with Google. It is required for a new Google profile.'
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

  const googleDisabled = googleLoading || !form.phone.trim();

  return (
    <AuthShell
      eyebrow={verification ? 'Email confirmation' : roleConfig.eyebrow}
      title={verification ? 'Check your inbox' : roleConfig.title}
      description={
        verification
          ? 'Password registration does not sign you in immediately. Confirm your email first, then return to sign in.'
          : roleConfig.description
      }
      quote={roleConfig.quote}
      quoteMeta={roleConfig.quoteMeta}
      imageAlt={roleConfig.imageAlt}
      steps={['Choose role', 'Your details', 'Verify email']}
      currentStep={verification ? 3 : 2}
    >
      {verification ? (
        <section className="rounded-xl border border-dust/15 bg-stone-deep p-5 text-center sm:p-7">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-beeswax/30 bg-beeswax/10 text-beeswax">
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
          <h2 className="mt-5 font-display text-2xl font-bold text-ivory">
            Confirm your email address
          </h2>
          <p className="mt-3 text-sm leading-6 text-dust" role="status">
            {verification.message} The link was requested for{' '}
            <span className="break-all text-ivory">{verification.email}</span>.
          </p>

          {roleConfig.role === 'COOPERATIVE_STAFF' && (
            <p className="mt-4 rounded-lg border border-beeswax/25 bg-beeswax/5 px-4 py-3 text-left text-xs leading-5 text-dust">
              Email confirmation completes account creation only. Cooperative
              assignment and cooperative verification are still required for
              dashboard access.
            </p>
          )}

          {resendState.message && (
            <div
              className="mt-5 rounded-lg border border-sage/50 bg-sage/15 px-4 py-3 text-left text-sm leading-6 text-ivory"
              role="status"
            >
              {resendState.message}
            </div>
          )}
          {resendState.error && (
            <div
              className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm leading-6 text-red-300"
              role="alert"
            >
              {resendState.error}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full py-3"
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
            className="mt-5 inline-block text-sm font-medium text-beeswax hover:underline"
          >
            Continue to sign in
          </Link>
        </section>
      ) : (
        <>
          {location.state?.authNotice && (
            <div
              className="mb-5 rounded-lg border border-beeswax/30 bg-beeswax/10 px-4 py-3 text-sm leading-6 text-beeswax"
              role="status"
            >
              {location.state.authNotice}
            </div>
          )}

          {error && (
            <div
              className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="register-phone" className={labelClass}>
                Phone number
              </label>
              <input
                id="register-phone"
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+254 700 000 000"
                className={inputClass}
                autoComplete="tel"
                aria-describedby={
                  googleAuthEnabled ? 'google-phone-help' : undefined
                }
                required
              />
            </div>

            {googleAuthEnabled && (
              <>
                <p
                  id="google-phone-help"
                  className="text-xs leading-5 text-dust"
                >
                  New Google profiles require the phone number above and will be
                  created as a {roleConfig.googleNoun}. Existing Google accounts
                  keep their current role.
                </p>
                <GoogleAuthButton
                  onCredential={handleGoogleCredential}
                  onError={(googleError) => setError(googleError.message)}
                  disabled={googleDisabled}
                  disabledLabel={
                    googleLoading
                      ? 'Connecting to Google...'
                      : 'Enter a phone number to continue with Google'
                  }
                  text="signup_with"
                />
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-dust/20" />
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-dust">
                    or use email and password
                  </span>
                  <span className="h-px flex-1 bg-dust/20" />
                </div>
              </>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="register-first-name" className={labelClass}>
                  First name
                </label>
                <input
                  id="register-first-name"
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  placeholder="John"
                  className={inputClass}
                  autoComplete="given-name"
                  required
                />
              </div>

              <div>
                <label htmlFor="register-last-name" className={labelClass}>
                  Last name
                </label>
                <input
                  id="register-last-name"
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  placeholder="Kipkoech"
                  className={inputClass}
                  autoComplete="family-name"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="register-email" className={labelClass}>
                Email address
              </label>
              <input
                id="register-email"
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
              <label htmlFor="register-password" className={labelClass}>
                Password
              </label>
              <input
                id="register-password"
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

            {roleConfig.callout && (
              <div className="rounded-lg border border-beeswax/25 bg-beeswax/5 px-4 py-3 text-xs leading-5 text-dust">
                {roleConfig.callout}
              </div>
            )}

            <Button
              type="submit"
              className="w-full py-3.5"
              disabled={loading || googleLoading}
            >
              {loading ? 'Creating account...' : roleConfig.submitLabel}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-dust">
            Already have an account?{' '}
            <Link
              to="/login"
              state={{ from: location.state?.from }}
              className="font-medium text-beeswax hover:underline"
            >
              Sign in
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-dust">
            Need a different role?{' '}
            <Link
              to="/register"
              state={{ from: location.state?.from }}
              className="font-medium text-beeswax hover:underline"
            >
              Back to account types
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
