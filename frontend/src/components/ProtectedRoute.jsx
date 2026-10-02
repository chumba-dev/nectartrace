import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="font-mono text-dust text-sm tracking-widest uppercase">
          Loading...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="container-content py-24 text-center">
        <h1 className="text-display-md font-display text-ivory mb-4">
          Access denied
        </h1>
        <p className="text-dust">
          You don't have permission to view this page.
        </p>
      </div>
    );
  }

  return children;
}