export default function EmptyState({
  title,
  description,
  action,
  icon = null,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="mb-6 text-dust opacity-50">
          {icon}
        </div>
      )}
      <h3 className="text-display-sm font-display text-ivory mb-3">
        {title}
      </h3>
      {description && (
        <p className="text-dust max-w-md mb-8 text-pretty">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}