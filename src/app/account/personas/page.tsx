import { AuthenticatedShell, Container } from "@/components/layout";
import PersonaCenterClient from "@/components/account/PersonaCenterClient";

export default function AccountPersonasPage() {
  return <AuthenticatedShell returnTo="/account/personas"><Container><PersonaCenterClient /></Container></AuthenticatedShell>;
}
