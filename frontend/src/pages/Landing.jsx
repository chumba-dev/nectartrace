import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';

export default function Landing() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="container-content py-24 md:py-32 lg:py-40">
          <div className="max-w-4xl">
            <p className="font-mono text-dust text-sm tracking-widest mb-6 uppercase">
              Baringo County · Kenya
            </p>
            <h1 className="text-display-xl font-display text-ivory mb-8 text-balance">
              Every jar.<br />
              Every farmer.<br />
              <span className="text-beeswax">Verified.</span>
            </h1>
            <p className="text-dust text-lg md:text-xl max-w-2xl mb-12 text-pretty">
              Real honey from Baringo beekeepers — traceable to the hive,
              priced fairly, and proven pure on the blockchain.
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

        {/* Subtle beeswax glow */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-beeswax/5 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* PROBLEM */}
      <section className="border-t border-dust/10">
        <div className="container-content py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-12 md:gap-20">
            <div>
              <h2 className="text-display-md font-display text-ivory mb-6 text-balance">
                Middlemen take 60%.<br />
                Buyers can't trust what they buy.
              </h2>
            </div>
            <div className="space-y-8">
              <div>
                <p className="text-beeswax font-mono text-sm mb-2">FOR FARMERS</p>
                <p className="text-dust text-lg text-pretty">
                  No access to real market prices. Forced to sell through brokers
                  at a fraction of the value. No way to reach buyers directly.
                </p>
              </div>
              <div>
                <p className="text-beeswax font-mono text-sm mb-2">FOR BUYERS</p>
                <p className="text-dust text-lg text-pretty">
                  No way to know if honey is pure. No traceability. No contact
                  with the actual farmer. So they pay less — or don't buy at all.
                </p>
              </div>
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
                On any basic phone, dial <MonoText className="text-beeswax">*483#</MonoText> to
                record the harvest. No smartphone or internet needed.
              </p>
            </Card>

            <Card className="p-8">
              <p className="font-mono text-beeswax text-sm mb-6">02 — COOPERATIVE</p>
              <h3 className="font-display text-2xl text-ivory mb-4">
                Verifies purity
              </h3>
              <p className="text-dust text-pretty">
                Moisture is tested with a refractometer. The verified batch
                is written permanently to the blockchain.
              </p>
            </Card>

            <Card className="p-8">
              <p className="font-mono text-beeswax text-sm mb-6">03 — BUYER</p>
              <h3 className="font-display text-2xl text-ivory mb-4">
                Scans & trusts
              </h3>
              <p className="text-dust text-pretty">
                A QR code on the jar opens the full history —
                village, harvest date, moisture, and verifier. Proof, not promises.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* FEATURED / CTA */}
      <section className="border-t border-dust/10">
        <div className="container-content py-20 md:py-28">
          <div className="bg-stone rounded-2xl p-12 md:p-16 relative overflow-hidden">
            <div className="max-w-2xl relative z-10">
              <VerifiedBadge className="mb-6" />
              <h2 className="text-display-md font-display text-ivory mb-6 text-balance">
                Fair prices for farmers.<br />
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

            <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-beeswax/10 rounded-full blur-3xl pointer-events-none" />
          </div>
        </div>
      </section>
    </div>
  );
}