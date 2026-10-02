import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-dust/10 bg-obsidian mt-24">
      <div className="container-content py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-beeswax" />
              <span className="font-display text-xl text-ivory">
                NectarTrace
              </span>
            </div>
            <p className="text-dust text-sm max-w-md text-pretty">
              Verified Baringo honey, traced from hive to jar on the blockchain.
              Fair prices for farmers. Real trust for buyers.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-display text-sm text-ivory mb-4 tracking-wider uppercase">
              Product
            </h4>
            <ul className="space-y-2 text-sm text-dust">
              <li>
                <Link
                  to="/marketplace"
                  className="hover:text-beeswax transition"
                >
                  Marketplace
                </Link>
              </li>
              <li>
                <Link to="/verify" className="hover:text-beeswax transition">
                  Verify a batch
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="hover:text-beeswax transition">
                  For cooperatives
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-display text-sm text-ivory mb-4 tracking-wider uppercase">
              About
            </h4>
            <ul className="space-y-2 text-sm text-dust">
              <li>
                <a href="#" className="hover:text-beeswax transition">
                  How it works
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-beeswax transition">
                  Our story
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-beeswax transition">
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-dust/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-dust font-mono">
            © {new Date().getFullYear()} NectarTrace · Baringo County, Kenya
          </p>
          <p className="text-xs text-dust font-mono">
            Built on Polygon · Verified on-chain
          </p>
        </div>
      </div>
    </footer>
  );
}
