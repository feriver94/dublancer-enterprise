import type { HTMLAttributes, ReactNode } from "react";

type CardVariant = "default" | "elevated" | "soft" | "glass";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: CardVariant;
};

const variants: Record<CardVariant, string> = {
  default: "border border-gray-200 bg-white",
  elevated: "border border-gray-200 bg-white shadow-2xl shadow-slate-200/80",
  soft: "border border-gray-100 bg-gray-50",
  glass: "border border-white/60 bg-white/80 shadow-xl shadow-slate-200/50 backdrop-blur-xl",
};

export default function Card({
  children,
  variant = "default",
  className = "",
  ...props
}: CardProps) {
  return (
    <div className={`rounded-[2rem] p-8 ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
