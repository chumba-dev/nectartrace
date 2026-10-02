export default function Skeleton({ className = '', variant = 'text' }) {
  const variants = {
    text: 'h-4 rounded',
    title: 'h-8 rounded',
    card: 'h-48 rounded-lg',
    circle: 'rounded-full',
  };

  return (
    <div
      className={`
        bg-stone/50 
        animate-pulse 
        ${variants[variant]} 
        ${className}
      `
        .trim()
        .replace(/\s+/g, ' ')}
    />
  );
}
