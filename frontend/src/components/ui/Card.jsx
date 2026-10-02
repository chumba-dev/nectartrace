export default function Card({ children, className = '', hover = false }) {
  const baseStyles = `
    bg-stone 
    border border-dust/10 
    rounded-lg 
    overflow-hidden
    ${hover ? 'transition-all duration-200 hover:border-dust/30 hover:-translate-y-0.5' : ''}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ');

  return <div className={baseStyles}>{children}</div>;
}
