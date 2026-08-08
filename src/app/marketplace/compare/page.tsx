import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ProviderComparisonClient from "@/components/marketplace/ProviderComparisonClient";

export const dynamic = "force-dynamic";
export default async function ProviderComparisonPage({ searchParams }: { searchParams: Promise<{ provider?: string | string[] }> }) {
  const value = (await searchParams).provider;
  const ids = (Array.isArray(value) ? value : value ? [value] : []).slice(0, 4);
  return <><Navbar /><ProviderComparisonClient initialIds={ids} /><Footer /></>;
}
