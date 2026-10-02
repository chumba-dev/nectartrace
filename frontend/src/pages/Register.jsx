import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    role: 'BUYER',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Wire up API in Phase 5.6
    console.log('Register:', form);
  };

  const inputClass = "w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors";
  const labelClass = "block text-sm text-dust mb-2";

  return (
    <div className="container-content py-24 flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4 text-center">
          Get started
        </p>
        <h1 className="text-display-md font-display text-ivory mb-8 text-center text-balance">
          Create your account
        </h1>

        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="John Kipkoech"
                className={inputClass}
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
                required
              />
            </div>

            <div>
              <label className={labelClass}>I am a...</label>
              <div className="grid grid-cols-2 gap-3">
                {['BUYER', 'COOPERATIVE_STAFF'].map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setForm({ ...form, role })}
                    className={`px-4 py-3 rounded-md text-sm font-medium transition-all ${
                      form.role === role
                        ? 'bg-beeswax text-obsidian border border-beeswax'
                        : 'bg-obsidian text-dust border border-dust/20 hover:border-dust/40'
                    }`}
                  >
                    {role === 'BUYER' ? 'Buyer' : 'Cooperative'}
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full">
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-dust">
            Already have an account?{' '}
            <Link to="/login" className="text-beeswax hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}