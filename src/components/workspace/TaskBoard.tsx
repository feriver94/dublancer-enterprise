import { Card, Badge, Button } from "@/components/ui";
import { brand } from "@/constants/design";

const columns = [
  {
    title: "To Do",
    items: ["Finalize auth flow", "Prepare project schema", "Define organization roles"],
  },
  {
    title: "In Progress",
    items: ["Marketplace proposal workspace", "AI Copilot enterprise UI", "Dashboard widgets"],
  },
  {
    title: "Review",
    items: ["Navbar polish", "Project details page", "Landing sections"],
  },
];

export default function TaskBoard() {
  return (
    <Card variant="elevated" style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 26 }}>
        <div>
          <Badge variant="info">Delivery Board</Badge>
          <h2
            style={{
              color: brand.colors.navy,
              fontSize: brand.typography.heading.h3,
              fontWeight: brand.typography.weight.bold,
              marginTop: 18,
              marginBottom: 0,
            }}
          >
            Sprint execution board
          </h2>
        </div>
        <Button variant="outline">View All Tasks</Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 18,
        }}
      >
        {columns.map((column) => (
          <div
            key={column.title}
            style={{
              padding: 18,
              borderRadius: brand.radius.lg,
              background: brand.colors.background,
              border: `1px solid ${brand.colors.border}`,
            }}
          >
            <h3
              style={{
                color: brand.colors.navy,
                fontWeight: brand.typography.weight.bold,
                marginBottom: 16,
              }}
            >
              {column.title}
            </h3>

            <div style={{ display: "grid", gap: 12 }}>
              {column.items.map((item) => (
                <div
                  key={item}
                  style={{
                    padding: 14,
                    borderRadius: brand.radius.md,
                    background: brand.colors.white,
                    border: `1px solid ${brand.colors.border}`,
                    color: brand.colors.text,
                    lineHeight: 1.5,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
