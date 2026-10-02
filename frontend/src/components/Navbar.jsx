import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import Button from './ui/Button';

export default function Navbar() {
  const [open, setOpen] = useState(false);

  const navLinkClass = ({ isActive }) =>
    `text-sm font-body transition-colors ${
      isActive ? 'text-beeswax' : 'text-ivory hover:text-beeswax'
    }`;

  return (
    <header className="sticky top-0 z-50 bg-obsidian/95 backdrop-blur-sm border-b border-dust/10">
      <nav className="container-content flex items-center justify-between h-16 md:h-20">
        {/* Wordmark */}
        <Link to="/" className="flex items-center gap-2 group">
          <span className="w-2 h-2 rounded-full bg-beeswax group-hover:scale-125 transition-transform" />
          <span className="font-display text-xl text-ivory tracking-tight">
            NectarTrace
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          <NavLink to="/marketplace" className={navLinkClass}>
            Marketplace
          </NavLink>
          <NavLink to="/verify" className={navLinkClass}>
            Verify
          </NavLink>
          <NavLink to="/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" to="/login">
            Sign in
          </Button>
          <Button size="sm" to="/register">
            Get started
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 text-ivory"
          aria-label="Toggle menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-dust/10 bg-obsidian">
          <div className="container-content py-6 flex flex-col gap-4">
            <NavLink to="/marketplace" className={navLinkClass} onClick={() => setOpen(false)}>
              Marketplace
            </NavLink>
            <NavLink to="/verify" className={navLinkClass} onClick={() => setOpen(false)}>
              Verify
            </NavLink>
            <NavLink to="/dashboard" className={navLinkClass} onClick={() => setOpen(false)}>
              Dashboard
            </NavLink>
            <div className="flex gap-3 pt-4 border-t border-dust/10">
              <Button variant="ghost" size="sm" to="/login" className="flex-1">
                Sign in
              </Button>
              <Button size="sm" to="/register" className="flex-1">
                Get started
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}