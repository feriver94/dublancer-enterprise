import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[#009A44] text-white shadow-lg shadow-green-700/15 hover:bg-[#007A36]",
  secondary:
    "bg-[#0F4C5C] text-white shadow-lg shadow-slate-700/15 hover:bg-black",
  outline:
    "border-2 border-[#0F4C5C] bg-white text-[#0F4C5C] hover:bg-[#0F4C5C] hover:text-white",
  ghost: "bg-transparent text-[#0F4C5C] hover:bg-slate-100",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full font-bold transition ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
