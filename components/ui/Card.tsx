interface CardProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export default function Card({ children, className = '', id }: CardProps) {
  return (
    <div
      id={id}
      className={`
        bg-charcoal-light rounded-xl border border-moon-dim/10 p-6
        ${className}
      `}
    >
      {children}
    </div>
  );
}
