import { memo, type CSSProperties } from "react";

type Design = {
  rows: string[];
  palette?: Partial<Record<string, string>>;
};

const DEFAULT_COLORS: Record<string, string> = {
  K: "#0a0a0c",
  W: "#fafafa",
  S: "#38bdf8",
  M: "#ff4a2d",
  G: "#3ddc97",
  D: "#d4d4d8",
};

const WIDTH = 34;

const DESIGNS: Design[] = [
  // Design 0: runner retro-futurista original
  {
    rows: [
      ".......KKKKKK",
      "......KWWWWWWK",
      "......KWWWWGWWK",
      ".....KWWWWWWWWK",
      ".....KWWSSWWWWWK",
      "....KWWSSSSWWWWWK",
      "....KWWSSSSSWWWWWK",
      "...KWWWWWSSSWWWWWWK",
      "...KWWWWWWWWSSWWWWWWKK",
      "..KWWWWWWWWWWWSWWWWWWWWK",
      ".KWKWWKWWKWWWWWWWWWWWWWWWWKK",
      "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
      "KDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK",
      ".KDDKDDDKDDKDDDKDDKDDDKDDKDDDK",
      "..KKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    ],
  },
  // Design 1: high-top chunky con más caña
  {
    rows: [
      "......KKKKKK",
      "......KWWWWWKK",
      "......KWWWWGWWK",
      "......KWWWWWWWK",
      ".....KWWSSWWWWK",
      ".....KWWSSSSWWWK",
      "....KWWSSSSSWWWWK",
      "....KWWWWWSSSWWWWWK",
      "...KWWWWWWWWSSWWWWWWK",
      "...KWWWWWWWWWSWWWWWWWKK",
      "..KWWWWWWWWWWWWWWWWWWWWWK",
      ".KWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KMMMMMMMMMMMMMMMMMMMMMMMMMMK",
      "KDDDDDDDDDDDDDDDDDDDDDDDDDDK",
      ".KDDDKDDDKDDDKDDDKDDDKDDDKK",
      "..KKKKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { S: "#3ddc97", M: "#38bdf8", G: "#ff4a2d" },
  },
  // Design 2: low-profile futurista
  {
    rows: [
      "...........KKKK",
      "..........KWWWWK",
      ".........KWWWWWK",
      "........KWWWWWWWK",
      ".......KWWSSWWWWWK",
      "......KWWSSSSWWWWWK",
      ".....KWWWSSSSSWWWWWK",
      "....KWWWWWWSSWWWWWWK",
      "...KWWWWWWWWWSWWWWWWWK",
      "...KWWWWWWWWWWWWWWWWWWWK",
      "..KWWWWWWWWWWWWWWWWWWWWWWK",
      ".KWWWWWWWWWWWWWWWWWWWWWWWWK",
      "KMMMMMMMMMMMMMMMMMMMMMMMMMMK",
      "KDDDDDDDDDDDDDDDDDDDDDDDDDDK",
      ".KDDDDDDDDDDDDDDDDDDDDDDDDK",
      "..KKKKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { S: "#9945ff", M: "#14f195", G: "#38bdf8" },
  },
  // Design 3: skate/tech con lengüeta alta y suela ancha
  {
    rows: [
      "........KKKKK",
      ".......KWWWWWK",
      "......KWWWWWWK",
      "......KWWSSWWWK",
      ".....KWWSSSSWWWK",
      ".....KWWSSSSSWWWK",
      "....KWWWWWSSWWWWK",
      "....KWWWWWWWWWWWWK",
      "...KWWWWWWWWWWWWWWK",
      "...KWWKWWKWWWWWWWWWK",
      "..KWWWWWWWWWWWWWWWWWWK",
      ".KWWWWWWWWWWWWWWWWWWWWWK",
      "KMMMMMMMMMMMMMMMMMMMMMMMK",
      "KDDDDDDDDDDDDDDDDDDDDDDDK",
      ".KDDDKDDDKDDDKDDDKDDDKDDK",
      "..KKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { S: "#ff4a2d", M: "#3ddc97", G: "#d4d4d8" },
  },
  // Design 4: speed racer con caña alta y puntera afilada
  {
    rows: [
      ".......KKKK",
      "......KWWWWK",
      "......KWWWWK",
      ".....KWWWWWK",
      ".....KWWSSWK",
      "....KWWSSSWWK",
      "....KWWSSSSWWK",
      "....KWWSSSSSWWWK",
      "...KWWWWWSSSWWWWK",
      "...KWWWWWWWSSWWWWK",
      "..KWWWWWWWWWWWWWWKK",
      "..KWWWWWWWWWWWWWWWWWK",
      ".KWWWWWWWWWWWWWWWWWWWWK",
      "KMMMMMMMMMMMMMMMMMMMMMMMK",
      "KDDDDDDDDDDDDDDDDDDDDDDDK",
      ".KDDDKDDDKDDDKDDDKDDDKDDK",
      "..KKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { S: "#14f195", M: "#9945ff", G: "#38bdf8" },
  },
  // Design 5: slip-on futurista con franja lateral
  {
    rows: [
      "..........KKKK",
      ".........KWWWWK",
      ".........KWWWWK",
      "........KWWWWWWK",
      ".......KWWWWWWWWK",
      "......KWWSSSSWWWWK",
      ".....KWWSSSSSSWWWWK",
      ".....KWWSSSSSWWWWWK",
      "....KWWWWSSWWWWWWWWK",
      "...KWWWWWWWWWWWWWWWWK",
      "...KWWWWWWWWWWWWWWWWWK",
      "..KWWWWWWWWWWWWWWWWWWWK",
      "KMMMMMMMMMMMMMMMMMMMMMMMMK",
      "KDDDDDDDDDDDDDDDDDDDDDDDDK",
      ".KDDDDDDDDDDDDDDDDDDDDDDDK",
      "..KKKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { S: "#8247e5", M: "#38bdf8", G: "#c084fc" },
  },
  // Design 6: basketball retro con tobillo alto y base ancha
  {
    rows: [
      "........KKKK",
      ".......KWWWWK",
      ".......KWWWWK",
      "......KWWWWWK",
      "......KWWWWWK",
      ".....KWWSSWWWK",
      ".....KWWSSSWWWK",
      "....KWWSSSSWWWWK",
      "....KWWSSSSSWWWWWK",
      "...KWWWWWWSSSWWWWWK",
      "...KWWWWWWWWWWWWWWWK",
      "..KWWWWWWWWWWWWWWWWWWK",
      ".KWWWWWWWWWWWWWWWWWWWWWK",
      "KMMMMMMMMMMMMMMMMMMMMMMMMK",
      "KDDDDDDDDDDDDDDDDDDDDDDDDK",
      ".KDDDKDDDKDDDKDDDKDDDKDDDK",
      "..KKKKKKKKKKKKKKKKKKKKKKKK",
    ],
    palette: { S: "#ff8a5c", M: "#ff4a2d", G: "#3ddc97" },
  },
];

function PixelSneaker({
  className,
  design = 0,
  palette,
  style,
}: {
  className?: string;
  design?: number;
  palette?: Partial<Record<string, string>>;
  style?: CSSProperties;
}) {
  const { rows, palette: designPalette } =
    DESIGNS[design % DESIGNS.length] ?? DESIGNS[0];
  const colors = { ...DEFAULT_COLORS, ...designPalette, ...palette };
  const height = rows.length;

  return (
    <svg
      viewBox={`-1 -1 ${WIDTH + 2} ${height + 3}`}
      className={className}
      style={style}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Retro-futuristic pixelated NFT sneaker, style ${design + 1}`}
    >
      <ellipse
        cx={WIDTH / 2}
        cy={height + 0.6}
        rx={15}
        ry={0.9}
        fill="#0a0a0c"
        opacity={0.08}
        shapeRendering="auto"
      />
      {rows.map((row, y) =>
        row
          .padEnd(WIDTH, ".")
          .split("")
          .map((cell, x) =>
            cell === "." ? null : (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={1.02}
                height={1.02}
                fill={colors[cell]}
              />
            ),
          ),
      )}
    </svg>
  );
}

export default memo(PixelSneaker);
