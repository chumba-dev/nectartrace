import { useNavigate } from 'react-router-dom';

export default function DashboardShell({
  eyebrow,
  title,
  description,
  items,
  activeSection,
  onSectionChange,
  actions,
  children,
}) {
  const navigate = useNavigate();

  const selectItem = (item) => {
    if (item.to) {
      navigate(item.to);
      return;
    }
    onSectionChange(item.id);
  };

  const handleMobileChange = (event) => {
    const item = items.find((candidate) => candidate.id === event.target.value);
    if (item) selectItem(item);
  };

  return (
    <div className="container-content py-10 md:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5 lg:mb-10">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-beeswax">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl font-bold text-ivory sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-dust">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="w-full sm:w-auto">{actions}</div>}
      </div>

      <div className="mb-6 lg:hidden">
        <label
          htmlFor="dashboard-section"
          className="mb-2 block font-mono text-xs uppercase tracking-widest text-dust"
        >
          Dashboard section
        </label>
        <select
          id="dashboard-section"
          value={activeSection}
          onChange={handleMobileChange}
          className="w-full rounded-lg border border-dust/20 bg-stone-deep px-4 py-3 text-sm text-ivory focus:border-beeswax focus:outline-none"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.badge ? ` (${item.badge})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-start gap-8">
        <aside className="sticky top-[96px] hidden w-60 shrink-0 lg:block">
          <nav
            aria-label={`${eyebrow || 'Dashboard'} sections`}
            className="rounded-xl border border-dust/15 bg-stone-deep p-3"
          >
            {items.map((item) => {
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item)}
                  aria-current={active ? 'page' : undefined}
                  className={`mb-1 flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm transition-colors last:mb-0 ${
                    active
                      ? 'bg-beeswax text-obsidian'
                      : 'text-dust hover:bg-stone hover:text-ivory'
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.badge ? (
                    <span
                      className={`min-w-6 rounded-full px-2 py-0.5 text-center font-mono text-[0.65rem] ${
                        active
                          ? 'bg-obsidian/15 text-obsidian'
                          : 'bg-beeswax/15 text-beeswax'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </div>
  );
}
