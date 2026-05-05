import {
  ATLAS_H,
  ATLAS_PATH,
  ATLAS_W,
  TILE_FRAMES,
  TILE_PX,
  type TileName,
} from "@/content/tiles";

type Props = {
  name: TileName;
  size?: number;
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
  bordered?: boolean;
};

const RADIUS: Record<NonNullable<Props["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

export default function TileChip({
  name,
  size = 16,
  className,
  rounded = "md",
  bordered = true,
}: Props) {
  const frame = TILE_FRAMES[name];
  const scale = size / TILE_PX;
  const sheetW = ATLAS_W * scale;
  const sheetH = ATLAS_H * scale;
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 overflow-hidden ${RADIUS[rounded]} ${
        bordered ? "border border-[var(--color-border-strong)]" : ""
      } ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${ATLAS_PATH})`,
        backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
        backgroundSize: `${sheetW}px ${sheetH}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }}
    />
  );
}
