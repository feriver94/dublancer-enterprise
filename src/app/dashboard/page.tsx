import { AuthenticatedShell, Container } from "@/components/layout";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ accessDenied?: string }>;
}) {
  const { accessDenied } = await searchParams;
  return <AuthenticatedShell returnTo="/dashboard"><Container>{accessDenied ? <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">You do not have the required <strong>{accessDenied}</strong> permission for that module.</div> : null}<DashboardClient /></Container></AuthenticatedShell>;
}
