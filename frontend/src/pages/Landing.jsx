import { useEffect } from 'react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';

export default function Landing() {
  useEffect(() => {
    document.title = 'NectarTrace';
  }, []);

  return (
    <div>
      {/* HERO — Full bleed */}
      <section className="relative overflow-hidden min-h-[85vh] flex items-center">
        {/* Background image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/honey-hero.webp"
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
          />
          {/* Dark overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-obsidian/40" />
        </div>

        {/* Content */}
        <div className="container-content relative z-10 py-24 md:py-32">
          <div className="max-w-3xl">
            <p className="font-mono text-beeswax text-sm tracking-widest mb-6 uppercase">
              Baringo County · Kenya
            </p>
            <h1 className="text-display-xl font-display text-ivory mb-8 text-balance">
              Every jar.
              <br />
              Every farmer.
              <br />
              <span className="text-beeswax">Verified.</span>
            </h1>
            <p className="text-ivory/80 text-lg md:text-xl max-w-2xl mb-12 text-pretty">
              Real honey from Baringo beekeepers — traceable to the hive, priced
              fairly, and proven pure on the blockchain.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" to="/marketplace">
                Browse honey →
              </Button>
              <Button size="lg" variant="outline" to="/verify">
                Verify a batch
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-dust/10">
        <div className="container-content py-20 md:py-28">
          <div className="mb-16">
            <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
              How it works
            </p>
            <h2 className="text-display-md font-display text-ivory max-w-2xl text-balance">
              From hive to jar, without the guesswork.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8">
              <p className="font-mono text-beeswax text-sm mb-6">01 — FARMER</p>
              <h3 className="font-display text-2xl text-ivory mb-4">
                Logs harvest
              </h3>
              <p className="text-dust text-pretty">
                On any basic phone, dial{' '}
                <MonoText className="text-beeswax">*483#</MonoText> to record
                the harvest. No smartphone or internet needed.
              </p>
            </Card>

            <Card className="p-8">
              <p className="font-mono text-beeswax text-sm mb-6">
                02 — COOPERATIVE
              </p>
              <h3 className="font-display text-2xl text-ivory mb-4">
                Verifies purity
              </h3>
              <p className="text-dust text-pretty">
                Moisture is tested with a refractometer. The verified batch is
                written permanently to the blockchain.
              </p>
            </Card>

            <Card className="p-8">
              <p className="font-mono text-beeswax text-sm mb-6">03 — BUYER</p>
              <h3 className="font-display text-2xl text-ivory mb-4">
                Scans & trusts
              </h3>
              <p className="text-dust text-pretty">
                A QR code on the jar opens the full history — village, harvest
                date, moisture, and verifier. Proof, not promises.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-dust/10">
        <div className="container-content py-20 md:py-28">
          <div className="bg-stone rounded-2xl overflow-hidden relative grid lg:grid-cols-2 items-center">
            {/* Text */}
            <div className="p-10 md:p-16 relative z-10">
              <VerifiedBadge className="mb-6" />
              <h2 className="text-display-md font-display text-ivory mb-6 text-balance">
                Fair prices for farmers.
                <br />
                Real trust for buyers.
              </h2>
              <p className="text-dust text-lg mb-8 text-pretty">
                Join 8,000+ Baringo beekeepers selling directly to urban buyers.
                Every transaction is transparent, every batch is verified.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button size="lg" to="/register">
                  Register your cooperative
                </Button>
                <Button size="lg" variant="ghost" to="/marketplace">
                  Browse marketplace →
                </Button>
              </div>
            </div>

            {/* Image */}
            <div className="relative h-64 lg:h-full lg:min-h-[400px]">
              <img
                src="/honey-hero.webp"
                alt="Golden Baringo honey"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-stone via-stone/60 to-transparent lg:bg-gradient-to-l lg:from-stone lg:via-stone/60 lg:to-transparent" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
