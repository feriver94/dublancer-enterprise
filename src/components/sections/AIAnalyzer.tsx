import { Badge, Card } from "@/components/ui";
import { brand } from "@/constants/design";

const analyzerRows = [
  ["Detected Project", "Rails Business System"],
  ["Recommended Bid", "$35/hr with phased roadmap"],
  [
    "AI Strategy",
    "Focus on proposal quality, pricing confidence, client analysis, follow-ups, and delivery tracking.",
  ],
];

export default function AIAnalyzer() {
  return (
    <Card variant="elevated">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-black md:text-3xl" style={{ color: brand.colors.navy }}>
          Project Analyzer
        </h2>
        <Badge variant="success">Win Score 86%</Badge>
      </div>

      <div className="space-y-4">
        {analyzerRows.map(([label, value]) => (
          <Card key={label} variant="soft" className="rounded-2xl p-5 shadow-none">
            <p className="text-sm" style={{ color: brand.colors.muted }}>{label}</p>
            <p className="mt-2 font-bold" style={{ color: brand.colors.navy }}>{value}</p>
          </Card>
        ))}
      </div>
    </Card>
  );
}
