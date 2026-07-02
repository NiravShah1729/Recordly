import Card from "./Card";

interface StatCardProps {
  label: string;
  value: number | string;
}

export default function StatCard({ label, value }: StatCardProps) {
  return (
    <Card>
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="text-2xl font-semibold text-[var(--text-primary)] mt-1">
        {value}
      </p>
    </Card>
  );
}
