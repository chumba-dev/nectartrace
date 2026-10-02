const variants = {
  verified: 'bg-sage/20 text-sage border-sage/30',
  pending: 'bg-beeswax/20 text-beeswax border-beeswax/30',
  sold: 'bg-dust/20 text-dust border-dust/30',
  default: 'bg-stone text-ivory border-dust/20',
};

export default function Badge({ children, variant = 'default', className = '' }) {
  const baseStyles = `
    inline-flex items-center gap-1.5
    px-2.5 py-1
    text-xs font-medium font-body uppercase tracking-wider
    border rounded-full
    ${variants[variant]}
    ${className}
  `.trim().replace(/\s+/g, ' ');

  return <span className={baseStyles}>{children}</span>;
}