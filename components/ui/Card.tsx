interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`
        bg-charcoal-light rounded-xl border border-moon-dim/10 p-6
        ${className}
      `}
    >
      {children}
    </div>
  );
}
