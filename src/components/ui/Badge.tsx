import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant = "success" | "danger" | "info" | "neutral";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
};

const variants: Record<BadgeVariant, string> = {
  success: "border-[#009A44]/30 bg-[#009A44]/10 text-[#009A44]",
  danger: "border-[#EF3340]/30 bg-[#EF3340]/10 text-[#EF3340]",
  info: "border-[#0F4C5C]/30 bg-[#0F4C5C]/10 text-[#0F4C5C]",
  neutral: "border-gray-200 bg-gray-50 text-gray-700",
};

export default function Badge({
  children,
  variant = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full border px-5 py-2 text-sm font-semibold ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
