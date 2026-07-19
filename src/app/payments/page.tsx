import { AuthenticatedShell, Container } from "@/components/layout";
import PaymentsClient from "@/components/payments/PaymentsClient";

export default function PaymentsPage() {
  return <AuthenticatedShell returnTo="/payments"><Container><PaymentsClient /></Container></AuthenticatedShell>;
}
