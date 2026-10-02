import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Wire up API in Phase 5.6
    console.log('Login:', { phone, password });
  };

  return (
    <div className="container-content py-24 flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-md">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4 text-center">
          Welcome back
        </p>
        <h1 className="text-display-md font-display text-ivory mb-8 text-center text-balance">
          Sign in to NectarTrace
        </h1>

        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm text-dust mb-2">
                Phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 700 000 000"
                className="w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors"
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
                className="w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors"
                required
              />
            </div>

            <Button type="submit" size="lg" className="w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-dust">
            New to NectarTrace?{' '}
            <Link to="/register" className="text-beeswax hover:underline">
              Create an account
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
