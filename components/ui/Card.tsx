interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

const paddingStyles = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export default function Card({
  children,
  className = "",
  padding = "md",
}: CardProps) {
  return (
    <div
      className={`
        bg-[var(--card-bg)] shadow-[var(--shadow-subtle)]
        rounded-[var(--radius)] ${paddingStyles[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
