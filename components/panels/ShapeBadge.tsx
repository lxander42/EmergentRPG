import type { FactionShape } from "@/content/factions";

export default function ShapeBadge({
  shape,
  color,
  size = 9,
}: {
  shape: FactionShape;
  color: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-warm)]"
      style={{ height: `${size * 4}px`, width: `${size * 4}px` }}
    >
      <svg width={size * 2.4} height={size * 2.4} viewBox="-12 -12 24 24" aria-hidden>
        <ShapePath shape={shape} color={color} />
      </svg>
    </span>
  );
}

function ShapePath({ shape, color }: { shape: FactionShape; color: string }) {
  const stroke = "rgba(44,40,32,0.4)";
  switch (shape) {
    case "square":
      return <rect x="-9" y="-9" width="18" height="18" rx="3" fill={color} stroke={stroke} strokeWidth="1" />;
    case "triangle":
      return <polygon points="0,-9 9,7 -9,7" fill={color} stroke={stroke} strokeWidth="1" />;
    case "diamond":
      return <polygon points="0,-10 10,0 0,10 -10,0" fill={color} stroke={stroke} strokeWidth="1" />;
    case "hex": {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        pts.push(`${(10 * Math.cos(a)).toFixed(2)},${(10 * Math.sin(a)).toFixed(2)}`);
      }
      return <polygon points={pts.join(" ")} fill={color} stroke={stroke} strokeWidth="1" />;
    }
  }
}
