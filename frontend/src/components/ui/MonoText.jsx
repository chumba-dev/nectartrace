export default function MonoText({
  children,
  truncate = false,
  className = '',
}) {
  const baseStyles = `
    font-mono text-sm text-dust
    ${truncate ? 'truncate block' : ''}
    ${className}
  `
    .trim()
    .replace(/\s+/g, ' ');

  return <span className={baseStyles}>{children}</span>;
}
