import { Link, useLocation } from 'react-router-dom';

export default function Footer() {
  const { pathname } = useLocation();

  return (
    <footer
      className={`${pathname === '/' ? '' : 'mt-24'} border-t border-white/[0.07] bg-obsidian`}
    >
      <div className="landing-container flex flex-col justify-between gap-6 py-12 md:flex-row md:items-center">
        <div>
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-ivory"
          >
            Nectar<span className="text-beeswax">Trace</span>
          </Link>
          <p className="mt-1 text-xs text-dust">
            Baringo County, Kenya · Built on Polygon blockchain
          </p>
        </div>

        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-dust">
            <li>
              <Link to="/marketplace" className="transition hover:text-ivory">
                Marketplace
              </Link>
            </li>
            <li>
              <Link to="/verify" className="transition hover:text-ivory">
                Verify honey
              </Link>
            </li>
            <li>
              <Link
                to="/register/buyer"
                className="transition hover:text-ivory"
              >
                Buyer account
              </Link>
            </li>
            <li>
              <Link
                to="/register/cooperative"
                className="transition hover:text-ivory"
              >
                Cooperative staff
              </Link>
            </li>
            <li>
              <Link to="/login" className="transition hover:text-ivory">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
