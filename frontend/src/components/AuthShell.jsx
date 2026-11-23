import { Link } from 'react-router-dom';

const defaultSteps = ['Account', 'Verification', 'Access'];

export default function AuthShell({
  eyebrow,
  title,
  description,
  quote,
  quoteMeta,
  imageAlt = 'Golden honey, honeycomb, and wooden honey dippers',
  steps = defaultSteps,
  currentStep = 1,
  children,
}) {
  return (
    <div className="min-h-svh bg-obsidian min-[801px]:grid min-[801px]:h-svh min-[801px]:grid-cols-2 min-[801px]:overflow-hidden">
      <aside className="auth-radial relative hidden overflow-hidden border-r border-white/[0.07] bg-stone-deep min-[801px]:flex min-[801px]:min-h-0 min-[801px]:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(245,240,232,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(245,240,232,.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-[clamp(2rem,5vw,5rem)] py-[clamp(2rem,5vh,3.5rem)]">
          <Link
            to="/"
            className="w-fit font-display text-2xl font-bold tracking-tight text-ivory"
            aria-label="NectarTrace home"
          >
            Nectar<span className="text-beeswax">Trace</span>
          </Link>

          <div className="my-auto flex min-h-0 flex-col items-center justify-center py-8 text-center">
            <img
              src="/honey-hero.webp"
              alt={imageAlt}
              className="h-[260px] w-[260px] shrink-0 rounded-[28px] border border-white/10 object-cover shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
            />
            <blockquote className="mt-8 max-w-[520px] font-display text-[clamp(1.35rem,2.25vw,2rem)] font-bold leading-[1.35] text-ivory text-balance">
              “{quote}”
            </blockquote>
            <p className="mt-4 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-beeswax">
              {quoteMeta}
            </p>
          </div>

          <ol
            className="grid shrink-0 gap-3"
            style={{
              gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
            }}
            aria-label="Account progress"
          >
            {steps.map((step, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === currentStep;
              const isComplete = stepNumber < currentStep;

              return (
                <li
                  key={step}
                  className={`border-t pt-3 ${
                    isCurrent
                      ? 'border-beeswax text-ivory'
                      : isComplete
                        ? 'border-sage text-ivory'
                        : 'border-dust/25 text-dust'
                  }`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="block font-mono text-[0.65rem] text-beeswax">
                    {String(stepNumber).padStart(2, '0')}
                  </span>
                  <span className="mt-1 block truncate text-xs">{step}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>

      <main className="auth-safe-area flex min-h-svh bg-obsidian px-5 sm:px-10 min-[801px]:h-svh min-[801px]:min-h-0 min-[801px]:overflow-y-auto min-[1100px]:px-16">
        <div className="mx-auto my-auto w-full max-w-[440px] py-2 min-[801px]:py-8">
          <Link
            to="/"
            className="mb-12 inline-block font-display text-xl font-bold tracking-tight text-ivory min-[801px]:hidden"
            aria-label="NectarTrace home"
          >
            Nectar<span className="text-beeswax">Trace</span>
          </Link>

          <header className="mb-8">
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-beeswax">
              {eyebrow}
            </p>
            <h1 className="font-display text-[clamp(2rem,6vw,2.75rem)] font-bold leading-[1.12] tracking-[-0.02em] text-ivory text-balance">
              {title}
            </h1>
            {description && (
              <p className="mt-4 max-w-[46ch] text-sm leading-6 text-dust text-pretty">
                {description}
              </p>
            )}
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}
