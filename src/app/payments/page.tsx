import { AuthenticatedShell, Container } from "@/components/layout";
import PaymentsClient from "@/components/payments/PaymentsClient";

export default function PaymentsPage() {
  return <AuthenticatedShell returnTo="/payments"><Container className="payments-shell" maxWidth="1440px"><PaymentsClient /></Container></AuthenticatedShell>;
}
