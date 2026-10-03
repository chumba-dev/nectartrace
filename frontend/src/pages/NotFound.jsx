import { useEffect } from 'react';
import Button from '../components/ui/Button';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page Not Found — NectarTrace';
  }, []);

  return (
    <div className="container-content py-32 text-center">
      <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
        404
      </p>
      <h1 className="text-display-lg font-display text-ivory mb-6">
        Page not found
      </h1>
      <p className="text-dust mb-8">
        The page you're looking for doesn't exist.
      </p>
      <Button to="/">Back to home</Button>
    </div>
  );
}
