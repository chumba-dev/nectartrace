import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import Button from '../components/ui/Button';

const roles = [
  {
    value: 'cooperative',
    index: '01',
    label: 'Cooperative',
    title: 'Manage verified supply',
    description:
      'Apply for staff access to receive harvests, register batches, and list verified honey.',
  },
  {
    value: 'buyer',
    index: '02',
    label: 'Buyer',
    title: 'Source trusted honey',
    description:
      'Purchase traceable batches directly from verified Baringo cooperatives.',
  },
  {
    value: 'farmer',
    index: '03',
    label: 'Farmer',
    title: 'Bring harvests to market',
    description:
      'Create an online farmer profile or use the USSD opt-in alternative.',
  },
  {
    value: 'consumer',
    index: '04',
    label: 'Consumer',
    title: 'Verify every jar',
    description:
      'Use QR provenance records to understand origin, quality, and handling.',
  },
];

export default function RegisterRoleSelector() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedRole, setSelectedRole] = useState('');

  useEffect(() => {
    document.title = 'Choose an account — NectarTrace';
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!selectedRole) return;

    navigate(`/register/${selectedRole}`, {
      state: { from: location.state?.from },
    });
  };

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Choose how you’ll use NectarTrace"
      description="Select one role now. Your account can only use the access supported for that role."
      quote="A trustworthy market begins when every participant is known and every role is clear."
      quoteMeta="One network · Four public roles"
      imageAlt="Golden honey, honeycomb, and wooden honey dippers"
      steps={['Choose role', 'Your details', 'Verify email']}
      currentStep={1}
    >
      {location.state?.authNotice && (
        <div
          className="mb-5 rounded-lg border border-beeswax/30 bg-beeswax/10 px-4 py-3 text-sm leading-6 text-beeswax"
          role="status"
        >
          {location.state.authNotice}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <fieldset aria-describedby="role-help">
          <legend className="sr-only">Choose an account role</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((role) => {
              const isSelected = selectedRole === role.value;

              return (
                <div key={role.value} className="relative">
                  <input
                    id={`role-${role.value}`}
                    type="radio"
                    name="account-role"
                    value={role.value}
                    checked={isSelected}
                    onChange={(event) => setSelectedRole(event.target.value)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={`role-${role.value}`}
                    className={`flex h-full cursor-pointer flex-col rounded-xl border p-4 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-beeswax peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-obsidian ${
                      isSelected
                        ? 'border-beeswax bg-beeswax/10'
                        : 'border-dust/20 bg-stone-deep hover:border-dust/50'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-4">
                      <span className="font-mono text-[0.65rem] tracking-[0.16em] text-beeswax">
                        {role.index} · {role.label.toUpperCase()}
                      </span>
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          isSelected
                            ? 'border-beeswax bg-beeswax'
                            : 'border-dust/50'
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && (
                          <span className="h-1.5 w-1.5 rounded-full bg-obsidian" />
                        )}
                      </span>
                    </span>
                    <span className="mt-3 font-display text-lg font-bold leading-snug text-ivory">
                      {role.title}
                    </span>
                    <span className="mt-2 text-xs leading-5 text-dust">
                      {role.description}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <p id="role-help" className="mt-4 text-xs leading-5 text-dust">
          Google sign-up is available on the next screen because every new
          Google profile also needs a phone number and the role you choose here.
        </p>

        <Button
          type="submit"
          className="mt-6 w-full py-3.5"
          disabled={!selectedRole}
        >
          Continue
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
    </AuthShell>
  );
}
