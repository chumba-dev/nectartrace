import { Link } from 'react-router-dom';

const variants = {
  primary: 'bg-beeswax text-obsidian hover:bg-beeswax/90 active:bg-beeswax/80',
  secondary: 'bg-stone text-ivory hover:bg-stone/80 border border-dust/20',
  ghost: 'bg-transparent text-ivory hover:bg-stone/50',
  outline: 'bg-transparent text-beeswax border border-beeswax hover:bg-beeswax hover:text-obsidian',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  to,
  href,
  className = '',
  ...props
}) {
  const baseStyles = `
    inline-flex items-center justify-center
    font-body font-medium
    rounded-md
    transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
    ${variants[variant]}
    ${sizes[size]}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  if (to) {
    return (
      <Link to={to} className={baseStyles} {...props}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={baseStyles} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button className={baseStyles} {...props}>
      {children}
    </button>
  );
}