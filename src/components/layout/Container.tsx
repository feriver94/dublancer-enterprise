import type { ReactNode } from "react";
import { brand } from "@/constants/design";

type ContainerProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
};

export default function Container({ children, className = "", maxWidth }: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full px-6 ${className}`}
      style={{ maxWidth: maxWidth ?? brand.spacing.container }}
    >
      {children}
    </div>
  );
}
