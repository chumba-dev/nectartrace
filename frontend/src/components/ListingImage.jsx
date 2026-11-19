import { useState } from 'react';

export default function ListingImage({
  src,
  alt,
  className = '',
  loading = 'lazy',
}) {
  const [failedSource, setFailedSource] = useState(null);
  const showFallback = !src || failedSource === src;

  if (showFallback) {
    return (
      <div
        className={`relative isolate flex items-center justify-center overflow-hidden bg-gradient-to-br from-beeswax/20 via-stone to-obsidian ${className}`}
        role="img"
        aria-label={`${alt} unavailable`}
      >
        <div className="absolute -left-10 top-4 h-32 w-32 rounded-full bg-beeswax/10 blur-3xl" />
        <div className="absolute -bottom-12 right-0 h-36 w-36 rounded-full bg-beeswax/10 blur-3xl" />
        <div className="relative flex flex-col items-center gap-3 px-6 text-center text-dust">
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-beeswax/70"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z" />
            <path d="m5 7 7 4 7-4M12 11v10" />
          </svg>
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.18em]">
            Cover image unavailable
          </span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailedSource(src)}
      className={className}
    />
  );
}
