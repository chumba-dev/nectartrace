import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Login — NectarTrace';
  }, []);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(phone, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors';

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
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-dust mb-2">
                Phone number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 700 000 000"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-sm text-dust mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
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
