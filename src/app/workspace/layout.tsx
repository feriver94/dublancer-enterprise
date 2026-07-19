import type { ReactNode } from "react";
import ProductRouteGuard from "@/components/layout/ProductRouteGuard";

export default function Layout({ children }: { children: ReactNode }) {
  return <ProductRouteGuard returnTo="/workspace" permission="project.read">{children}</ProductRouteGuard>;
}
