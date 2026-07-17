import { Navbar, Footer, Container } from "@/components/layout";
import { OrganizationHeader, OrganizationStats, OrganizationOverview, MemberDirectory, RoleManagement, PermissionMatrix, SecurityCenter, CompliancePanel, ApiKeys, AuditLogs, OrganizationAI, SettingsPanel } from "@/components/organization";

export default function OrganizationPage() {
  return (
    <>
      <Navbar /><Container><main style={{ padding: "72px 0 96px" }}>
        <OrganizationHeader /><OrganizationStats />
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 28, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 28 }}><OrganizationOverview /><MemberDirectory /><RoleManagement /></div>
          <aside style={{ display: "grid", gap: 24 }}><OrganizationAI /><SecurityCenter /><AuditLogs /></aside>
        </section>
      </main></Container><Footer />
    </>
  );
}
