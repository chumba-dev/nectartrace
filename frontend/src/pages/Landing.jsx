import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import ListingImage from '../components/ListingImage';
import Skeleton from '../components/ui/Skeleton';
import { listingsApi } from '../lib/api';

const primaryAction =
  'inline-flex items-center justify-center rounded-md bg-beeswax px-8 py-3.5 font-body text-base font-semibold text-obsidian transition duration-200 hover:-translate-y-px hover:bg-[#f0aa22]';
const ghostAction =
  'inline-flex items-center justify-center rounded-md border border-ivory/20 bg-transparent px-8 py-3.5 font-body text-base font-medium text-ivory transition duration-200 hover:border-ivory/50 hover:text-white';

const howSteps = [
  {
    icon: '01',
    eyebrow: 'USSD',
    title: 'Farmer offers a harvest',
    description:
      'No smartphone needed. A registered beekeeper dials *483#, enters the harvest details, and selects a nearby cooperative.',
  },
  {
    icon: '02',
    eyebrow: 'QUALITY',
    title: 'Cooperative verifies purity',
    description:
      'Staff receive the honey, test moisture with a refractometer, and register an approved batch permanently on-chain.',
  },
  {
    icon: '03',
    eyebrow: 'PROOF',
    title: 'Buyer scans and confirms',
    description:
      'Every listed batch carries a QR record showing its village, harvest date, moisture reading, and blockchain proof.',
  },
];

const provenanceRows = [
  ['batch_id', 'BAR-2026-0041'],
  ['village', 'Kabarnet, Baringo'],
  ['cooperative', 'Baringo Highlands'],
  ['harvest_date', '2026-08-14'],
  ['moisture_%', '17.8'],
  ['weight_kg', '80'],
];

const stats = [
  ['8k+', 'Registered beekeepers across Baringo'],
  ['3rd', 'Largest honey-producing county in Kenya'],
  ['60%', 'Of smallholders lose value to opaque pricing'],
  ['24/7', 'USSD access without an app or data bundle'],
];

function Reveal({ children, className = '', delay = 0 }) {
  return (
    <div
      data-landing-reveal
      className={`landing-reveal ${className}`}
      style={{ '--landing-reveal-delay': `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ label, children, className = '' }) {
  return (
    <div className={className}>
      <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-beeswax">
        {label}
      </p>
      <h2 className="max-w-[28ch] font-display text-[clamp(2rem,3.5vw,3rem)] font-bold leading-[1.15] tracking-[-0.02em] text-ivory text-balance">
        {children}
      </h2>
    </div>
  );
}

function ListingPreviewCard({ listing, delay }) {
  return (
    <Reveal delay={delay} className="h-full">
      <Link
        to={`/listings/${listing.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#1e1a16] transition duration-200 hover:-translate-y-1 hover:border-beeswax/30"
      >
        <ListingImage
          src={listing.imageUrl}
          alt={`${listing.cooperative.name} honey from ${listing.batch.village}`}
          className="h-52 w-full bg-ivory/[0.03] p-5 object-contain transition duration-300 group-hover:scale-[1.02]"
        />
        <div className="flex flex-1 flex-col p-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-[0.04em] text-dust">
            <span aria-hidden="true">●</span>
            {listing.batch.village}, Baringo
          </p>
          <h3 className="mb-3 font-display text-lg font-bold text-ivory">
            {listing.description || `${listing.cooperative.name} honey`}
          </h3>
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-sage px-3 py-1 text-[0.68rem] font-semibold tracking-wide text-[#d4e8d0]">
            <span aria-hidden="true">✓</span> Blockchain verified
          </span>
          <div className="mt-auto flex items-end justify-between gap-4 border-t border-white/[0.08] pt-4">
            <p className="font-semibold text-beeswax">
              KES {listing.pricePerKg.toLocaleString()}{' '}
              <span className="text-xs font-normal text-dust">/ kg</span>
            </p>
            <p className="font-mono text-[0.7rem] text-dust">
              {listing.batch.moistureContent}% moisture
            </p>
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

export default function Landing() {
  const {
    data: listings = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['listings'],
    queryFn: () => listingsApi.list().then((response) => response.data.data),
  });
  const previewListings = listings.slice(0, 3);

  useEffect(() => {
    document.title = 'NectarTrace — Pure Baringo Honey, Verified on Blockchain';
  }, []);

  useEffect(() => {
    const elements = document.querySelectorAll('[data-landing-reveal]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12 }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [previewListings.length]);

  return (
    <div className="overflow-hidden bg-obsidian">
      <section className="landing-container grid min-h-svh items-center gap-14 pb-20 pt-28 lg:grid-cols-2 lg:gap-16 lg:pb-24 lg:pt-32">
        <Reveal className="max-w-[540px]">
          <p className="mb-6 flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.18em] text-beeswax before:block before:h-px before:w-7 before:bg-beeswax">
            Baringo County, Kenya
          </p>
          <h1 className="mb-6 font-display text-[clamp(2.8rem,5vw,4.2rem)] font-extrabold leading-[1.08] tracking-[-0.025em] text-ivory text-balance">
            Honey that tells you <em className="text-beeswax">exactly</em> where
            it came from
          </h1>
          <p className="mb-10 max-w-[46ch] text-[1.05rem] font-light leading-7 text-dust text-pretty">
            NectarTrace connects Baringo beekeepers to trusted cooperatives and
            buyers, recording every verified batch on blockchain so you know
            what you are buying.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link to="/marketplace" className={primaryAction}>
              Browse honey
            </Link>
            <Link to="/register/cooperative" className={ghostAction}>
              Cooperative staff access
            </Link>
          </div>
        </Reveal>

        <Reveal
          delay={100}
          className="relative order-first flex items-center justify-center lg:order-none"
        >
          <div className="relative w-full max-w-[480px] overflow-hidden rounded-xl">
            <img
              src="https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=900&auto=format&fit=crop&q=80"
              alt="Golden natural honey beside a wooden dipper"
              loading="eager"
              fetchPriority="high"
              className="h-[420px] w-full object-cover brightness-[0.88] saturate-110 sm:h-[520px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian/70 via-transparent to-transparent" />
          </div>

          <div className="landing-float absolute -bottom-5 left-3 z-10 w-[220px] rounded-[10px] border border-white/10 bg-stone p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:-left-4 sm:bottom-6">
            <p className="mb-1 text-[0.68rem] font-medium tracking-wider text-dust">
              BATCH RECORD
            </p>
            <p className="mb-3 font-mono text-xs text-beeswax">BAR-2026-0041</p>
            <div className="space-y-1 text-xs">
              <p className="flex justify-between gap-4 text-ivory">
                Village <span className="text-dust">Kabarnet</span>
              </p>
              <p className="flex justify-between gap-4 text-ivory">
                Moisture <span className="text-dust">17.8%</span>
              </p>
              <p className="flex justify-between gap-4 text-ivory">
                Weight <span className="text-dust">80 kg</span>
              </p>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-sage/50 bg-sage/30 px-2.5 py-1 text-[0.68rem] font-semibold text-[#d4e8d0]">
              ✓ Blockchain verified
            </span>
          </div>

          <div className="absolute right-2 top-5 rounded-[10px] bg-beeswax px-4 py-3 text-center text-obsidian shadow-[0_12px_40px_rgba(232,160,32,0.35)] sm:-right-4 sm:top-8">
            <p className="font-display text-2xl font-extrabold leading-none">
              8k+
            </p>
            <p className="mt-1 text-[0.65rem] font-semibold leading-tight opacity-80">
              Baringo
              <br /> beekeepers
            </p>
          </div>
        </Reveal>
      </section>

      <section
        id="how"
        className="scroll-mt-20 border-t border-white/[0.07] py-24 lg:py-28"
      >
        <div className="landing-container">
          <Reveal>
            <SectionHeading label="How it works">
              From hive to table, nothing hidden
            </SectionHeading>
          </Reveal>
          <div className="mt-16 grid overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-3 md:gap-px">
            {howSteps.map((step, index) => (
              <Reveal key={step.title} delay={index * 100} className="h-full">
                <article className="h-full bg-[#1e1a16] p-8 transition duration-200 hover:bg-stone lg:p-10">
                  <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-lg bg-beeswax/10 font-mono text-sm text-beeswax">
                    {step.icon}
                  </div>
                  <p className="mb-3 text-[0.68rem] font-semibold tracking-[0.16em] text-beeswax">
                    {step.eyebrow}
                  </p>
                  <h3 className="mb-3 font-display text-xl font-bold text-ivory">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-7 text-dust">
                    {step.description}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section
        id="verify"
        className="scroll-mt-20 border-t border-white/[0.07] py-24 lg:py-28"
      >
        <div className="landing-container grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div className="rounded-xl border border-white/[0.09] bg-[#1e1a16] p-6 font-mono text-xs leading-8 sm:p-8">
              {provenanceRows.map(([key, value], index) => (
                <div key={key}>
                  {index === 1 && <hr className="my-4 border-white/[0.08]" />}
                  <div className="flex justify-between gap-6">
                    <span className="text-dust">{key}</span>
                    <span className="text-right text-ivory">{value}</span>
                  </div>
                </div>
              ))}
              <hr className="my-4 border-white/[0.08]" />
              <div className="flex justify-between gap-6">
                <span className="text-dust">tx_hash</span>
                <span className="text-right text-[0.68rem] text-beeswax">
                  0x3fa2...c91b
                </span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-dust">network</span>
                <span className="text-right text-ivory">Polygon</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-dust">status</span>
                <span className="text-right text-[#d4e8d0]">✓ Verified</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <SectionHeading label="The trust layer">
              Once it is on-chain, nobody can change it
            </SectionHeading>
            <p className="mb-8 mt-5 max-w-[44ch] text-[0.95rem] leading-7 text-dust">
              When a cooperative registers a honey batch, its origin and quality
              record are written to Polygon permanently and publicly. Scan any
              NectarTrace QR code to inspect the original record.
            </p>
            <Link to="/verify" className={primaryAction}>
              Verify a batch
            </Link>
          </Reveal>
        </div>
      </section>

      <section
        id="marketplace"
        className="scroll-mt-20 border-t border-white/[0.07] py-24 lg:py-28"
      >
        <div className="landing-container">
          <Reveal className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <SectionHeading label="Marketplace">
              Available honey, right now
            </SectionHeading>
            <Link to="/marketplace" className={ghostAction}>
              See all listings
            </Link>
          </Reveal>

          {isLoading && (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#1e1a16]"
                >
                  <Skeleton className="h-52 w-full rounded-none" />
                  <div className="space-y-4 p-5">
                    <Skeleton className="w-1/2" />
                    <Skeleton variant="title" className="w-4/5" />
                    <Skeleton className="w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
              <p className="text-sm text-red-200">
                Marketplace preview is temporarily unavailable.
              </p>
              <Link
                to="/marketplace"
                className="mt-5 inline-flex text-beeswax hover:underline"
              >
                Open the marketplace
              </Link>
            </div>
          )}

          {!isLoading && !error && previewListings.length === 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-[#1e1a16] p-10 text-center">
              <p className="font-display text-xl text-ivory">
                Fresh cooperative listings are on the way.
              </p>
              <p className="mt-2 text-sm text-dust">
                Browse the marketplace to check current availability.
              </p>
            </div>
          )}

          {!isLoading && !error && previewListings.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {previewListings.map((listing, index) => (
                <ListingPreviewCard
                  key={listing.id}
                  listing={listing}
                  delay={index * 100}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-white/[0.07] bg-[#1e1a16] py-24 lg:py-28">
        <div className="landing-container grid items-center gap-16 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <SectionHeading label="Built for every farmer">
              No smartphone? No problem.
            </SectionHeading>
            <p className="mb-8 mt-5 max-w-[44ch] text-[0.95rem] leading-7 text-dust">
              NectarTrace works over USSD, the same familiar technology used by
              mobile-money menus. Farmers can submit offers without mobile data
              or an app.
            </p>
            <ul className="space-y-3 text-sm text-dust">
              {[
                'Log a harvest from any registered feature phone',
                'Check the latest recorded honey prices',
                'Review monthly totals and estimated earnings',
                'Offer honey to a nearby cooperative',
                'Receive an SMS reference for every submitted offer',
              ].map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <span className="mt-0.5 font-bold text-beeswax">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={100}>
            <div className="mx-auto max-w-[280px] rounded-[36px] border-[6px] border-[#222] bg-[#111] p-4 shadow-[0_40px_80px_rgba(0,0,0,0.6)]">
              <div className="min-h-[340px] rounded-[22px] bg-[#1a1a1a] px-4 py-5 font-mono text-[0.72rem] leading-7 text-[#d0d0d0]">
                <p className="mb-3 text-center text-xs font-bold tracking-wide text-white">
                  NectarTrace *483#
                </p>
                <p className="text-beeswax">Welcome to NectarTrace</p>
                <p className="mt-3">1. Log harvest</p>
                <p>2. Check market price</p>
                <p>3. My account</p>
                <p>4. Offer harvest to cooperative</p>
                <p className="mt-3 text-[#666]">Reply with number:</p>
                <p className="text-beeswax">&gt; 4</p>
                <p className="mt-3">Enter your village:</p>
                <p className="text-beeswax">&gt; Kabarnet</p>
                <p className="mt-3 text-beeswax">✓ Offer submitted</p>
                <p>Reference: HOF-260823-14A7</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-white/[0.07] py-16">
        <div className="landing-container grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map(([value, description], index) => (
            <Reveal key={value} delay={index * 100} className="text-center">
              <p className="font-display text-[2.6rem] font-extrabold leading-none text-beeswax">
                {value}
              </p>
              <p className="mx-auto mt-2 max-w-[18ch] text-xs leading-5 text-dust sm:text-sm">
                {description}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-white/[0.07] py-24 text-center">
        <div className="landing-container">
          <Reveal>
            <h2 className="mx-auto max-w-[24ch] font-display text-[clamp(2rem,3.5vw,3rem)] font-bold leading-[1.15] tracking-[-0.02em] text-ivory text-balance">
              Ready to buy genuine Baringo honey?
            </h2>
            <p className="mx-auto mb-10 mt-5 max-w-[48ch] text-dust">
              Browse verified cooperative listings and trace every jar back to
              its registered batch.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/register/buyer" className={primaryAction}>
                Create buyer account
              </Link>
              <Link to="/register/cooperative" className={ghostAction}>
                Cooperative staff access
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
