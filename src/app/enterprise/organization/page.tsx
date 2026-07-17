import { Navbar, Footer, Container } from "@/components/layout";
import { OrganizationProfile, TeamDirectory, RolePermissionMatrix, DepartmentMap, SecurityCenter, AuditLog } from "@/components/enterprise";

export default function OrganizationPage() {
  return (
    <>
      <Navbar />
      <Container>
        <main style={{ padding: "72px 0 96px" }}>
          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 28, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 28 }}>
              <OrganizationProfile />
              <DepartmentMap />
              <TeamDirectory />
              <RolePermissionMatrix />
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
