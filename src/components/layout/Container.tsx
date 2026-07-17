import type { ReactNode } from "react";
import { brand } from "@/constants/design";

type ContainerProps = {
  children: ReactNode;
  className?: string;
};

export default function Container({ children, className = "" }: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full px-6 ${className}`}
      style={{ maxWidth: brand.spacing.container }}
    >
      {children}
    </div>
  );
}
