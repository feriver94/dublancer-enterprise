import { Navbar, Footer, Container } from "@/components/layout";
import { EnterpriseHeader, EnterpriseStats, OrganizationProfile, TeamDirectory, RolePermissionMatrix, DepartmentMap, SecurityCenter, AuditLog } from "@/components/enterprise";

export default function EnterprisePage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <EnterpriseHeader />
          <EnterpriseStats />
          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 28, alignItems: "start", marginBottom: 28 }}>
            <div style={{ display: "grid", gap: 28 }}>
              <OrganizationProfile />
              <TeamDirectory />
              <RolePermissionMatrix />
              <DepartmentMap />
            </div>
            <aside style={{ display: "grid", gap: 24 }}>
              <SecurityCenter />
              <AuditLog />
            </aside>
          </section>
        </main>
      </Container>
      <Footer />
    </>
  );
}
