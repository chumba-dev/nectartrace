import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Button from './ui/Button';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const isLanding = pathname === '/';
  const canViewOrders = ['BUYER', 'COOPERATIVE_STAFF'].includes(user?.role);

  const handleLogout = () => {
    logout();
    navigate('/');
    setOpen(false);
  };

  const closeMenu = () => setOpen(false);
  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors ${
      isActive ? 'text-beeswax' : 'text-dust hover:text-ivory'
    }`;
  const plainLinkClass =
    'text-sm font-medium text-dust transition-colors hover:text-ivory';

  return (
    <header
      className={`${isLanding ? 'fixed' : 'sticky'} inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-obsidian/[0.88] backdrop-blur-[14px]`}
    >
      <nav
        className={`${isLanding ? 'mx-auto max-w-[1140px] px-[clamp(1.25rem,5vw,3rem)]' : 'container-content'} flex h-[72px] items-center justify-between`}
      >
        <Link
          to="/"
          className="font-display text-xl font-bold tracking-tight text-ivory"
          onClick={closeMenu}
        >
          Nectar<span className="text-beeswax">Trace</span>
        </Link>

        <div className="hidden items-center gap-9 md:flex">
          {isLanding ? (
            <>
              <a href="#how" className={plainLinkClass}>
                How it works
              </a>
              <a href="#marketplace" className={plainLinkClass}>
                Marketplace
              </a>
              <a href="#verify" className={plainLinkClass}>
                Verify honey
              </a>
            </>
          ) : (
            <>
              <NavLink to="/marketplace" className={navLinkClass}>
                Marketplace
              </NavLink>
              <NavLink to="/verify" className={navLinkClass}>
                Verify honey
              </NavLink>
            </>
          )}

          {user?.role === 'COOPERATIVE_STAFF' && (
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
          )}
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}
          {canViewOrders && (
            <NavLink to="/orders" className={navLinkClass}>
              Orders
            </NavLink>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0 md:gap-3">
          {isAuthenticated && <NotificationBell />}
          <div className="hidden items-center gap-3 md:flex">
            {isAuthenticated ? (
              <>
                <span className="max-w-36 truncate text-sm text-dust">
                  {user.name}
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  to="/login"
                  className="border-beeswax/50 hover:border-beeswax hover:bg-beeswax/10 hover:text-beeswax"
                >
                  Sign in
                </Button>
                {!isLanding && (
                  <Button size="sm" to="/register/buyer">
                    Join as buyer
                  </Button>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-md p-2 text-ivory md:hidden"
            aria-label="Toggle navigation"
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              {open ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="mobile-navigation"
          className="border-t border-white/[0.06] bg-obsidian md:hidden"
        >
          <div className="container-content flex flex-col gap-4 py-6">
            {isLanding && (
              <a href="#how" className={plainLinkClass} onClick={closeMenu}>
                How it works
              </a>
            )}
            <Link
              to="/marketplace"
              className={plainLinkClass}
              onClick={closeMenu}
            >
              Marketplace
            </Link>
            <Link to="/verify" className={plainLinkClass} onClick={closeMenu}>
              Verify honey
            </Link>
            {user?.role === 'COOPERATIVE_STAFF' && (
              <Link
                to="/dashboard"
                className={plainLinkClass}
                onClick={closeMenu}
              >
                Dashboard
              </Link>
            )}
            {user?.role === 'ADMIN' && (
              <Link to="/admin" className={plainLinkClass} onClick={closeMenu}>
                Admin
              </Link>
            )}
            {canViewOrders && (
              <Link to="/orders" className={plainLinkClass} onClick={closeMenu}>
                Orders
              </Link>
            )}

            <div className="flex gap-3 border-t border-white/[0.06] pt-4">
              {isAuthenticated ? (
                <>
                  <p className="flex-1 self-center truncate text-sm text-dust">
                    {user.name}
                  </p>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    to="/login"
                    className="flex-1"
                    onClick={closeMenu}
                  >
                    Sign in
                  </Button>
                  <Button
                    size="sm"
                    to="/register/buyer"
                    className="flex-1"
                    onClick={closeMenu}
                  >
                    Join as buyer
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
