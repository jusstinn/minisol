import type { ArtSpec, ToolGlyph } from "@/domain/art";

/**
 * Illustrated packshot drawn from an ArtSpec: ink outlines on flat fills, the
 * product's real colour, a brand band and the pack size. 80×80 viewBox.
 */
export function ProductArt({ art, size = 64, className }: { art: ArtSpec; size?: number; className?: string }) {
  const ink = "#141311";
  const sw = 1.6;
  const premium = art.quality === "premium";
  const brand = art.brand.slice(0, 10).toUpperCase();
  const label = art.label;

  const shadow = <ellipse cx={40} cy={73} rx={24} ry={3.2} fill="#141311" opacity={0.12} />;

  let body: React.ReactNode;
  switch (art.kind) {
    case "bucket":
      body = (
        <>
          <path d="M18 22 Q40 10 62 22" fill="none" stroke={ink} strokeWidth={sw} />
          <path d="M16 24 L20 68 Q40 74 60 68 L64 24 Z" fill="#f7f5f0" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <ellipse cx={40} cy={24} rx={24} ry={5} fill="#e9e5dc" stroke={ink} strokeWidth={sw} />
          <path d="M17.5 36 L62.5 36 L61.2 52 L18.8 52 Z" fill={art.brandColor} />
          <text x={40} y={43.5} textAnchor="middle" fontSize={6.2} fontWeight={800} fill="#fff" fontFamily="var(--font-archivo)">
            {brand}
          </text>
          <text x={40} y={50} textAnchor="middle" fontSize={5.4} fontWeight={600} fill="#fff" fontFamily="var(--font-jetbrains)">
            {label}
          </text>
          <circle cx={40} cy={61} r={4.2} fill={art.color} stroke={ink} strokeWidth={1} />
        </>
      );
      break;
    case "bag":
      body = (
        <>
          <path d="M20 20 L60 20 L63 66 Q40 72 17 66 Z" fill="#efe9dc" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M20 20 L24 14 L56 14 L60 20" fill="#e2dccd" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M18.6 34 L61.4 34 L62.3 50 L17.7 50 Z" fill={art.brandColor} />
          <text x={40} y={41.5} textAnchor="middle" fontSize={6.2} fontWeight={800} fill="#fff" fontFamily="var(--font-archivo)">
            {brand}
          </text>
          <text x={40} y={48} textAnchor="middle" fontSize={5.6} fontWeight={600} fill="#fff" fontFamily="var(--font-jetbrains)">
            {label}
          </text>
          <rect x={28} y={55} width={24} height={6} rx={1.5} fill={art.color} stroke={ink} strokeWidth={0.8} />
        </>
      );
      break;
    case "box":
      body = (
        <>
          <path d="M14 30 L40 20 L66 30 L40 40 Z" fill={art.color} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <Pattern kind={art.pattern} />
          <path d="M14 30 L14 60 L40 70 L40 40 Z" fill="#f4f1ea" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M66 30 L66 60 L40 70 L40 40 Z" fill="#e3ded3" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M14 42 L40 52 L40 60 L14 50 Z" fill={art.brandColor} />
          <text x={27} y={52} textAnchor="middle" fontSize={4.8} fontWeight={800} fill="#fff" fontFamily="var(--font-archivo)" transform="rotate(21 27 52)">
            {brand}
          </text>
          <text x={53} y={57} textAnchor="middle" fontSize={5.2} fontWeight={600} fill={ink} fontFamily="var(--font-jetbrains)" transform="rotate(-21 53 57)">
            {label}
          </text>
        </>
      );
      break;
    case "roll":
      body = (
        <>
          <path d="M22 26 L58 26 L58 62 L22 62 Z" fill={art.color === "#d9d4c9" ? "#e8eef2" : art.color} stroke={ink} strokeWidth={sw} />
          <ellipse cx={22} cy={44} rx={7} ry={18} fill="#f7f5f0" stroke={ink} strokeWidth={sw} />
          <ellipse cx={22} cy={44} rx={2.6} ry={6.5} fill="#cfc9bb" stroke={ink} strokeWidth={1} />
          <path d="M58 26 Q65 44 58 62" fill="none" stroke={ink} strokeWidth={sw} />
          <rect x={30} y={36} width={24} height={16} fill={art.brandColor} />
          <text x={42} y={43} textAnchor="middle" fontSize={5.4} fontWeight={800} fill="#fff" fontFamily="var(--font-archivo)">
            {brand}
          </text>
          <text x={42} y={49.5} textAnchor="middle" fontSize={5} fontWeight={600} fill="#fff" fontFamily="var(--font-jetbrains)">
            {label}
          </text>
        </>
      );
      break;
    case "plank":
      body = (
        <>
          <path d="M8 52 L58 22 L72 28 L22 58 Z" fill={art.color} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M8 52 L8 58 L22 64 L22 58 Z" fill="#00000022" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M22 58 L22 64 L72 34 L72 28 Z" fill="#00000014" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          {art.pattern === "metal" ? (
            <path d="M13 53 L61 24 M18 56 L66 27" stroke={ink} strokeWidth={0.8} opacity={0.6} />
          ) : (
            <path d="M14 51 Q30 44 40 39 T64 25 M18 55 Q34 47 46 40 T68 29" stroke="#00000040" strokeWidth={0.9} fill="none" />
          )}
          <text x={40} y={75} textAnchor="middle" fontSize={5.6} fontWeight={600} fill={ink} fontFamily="var(--font-jetbrains)">
            {label}
          </text>
        </>
      );
      break;
    case "sheet":
      body = (
        <>
          <path d="M20 16 L60 10 L60 62 L20 68 Z" fill={art.color} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M60 10 L64 12 L64 64 L60 62 Z" fill="#d3d0c8" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M20 44 L60 38 L60 46 L20 52 Z" fill={art.brandColor} />
          <text x={40} y={47.5} textAnchor="middle" fontSize={5} fontWeight={800} fill="#fff" fontFamily="var(--font-archivo)" transform="rotate(-8.5 40 47.5)">
            {brand}
          </text>
          <text x={40} y={60} textAnchor="middle" fontSize={5} fontWeight={600} fill={ink} fontFamily="var(--font-jetbrains)" transform="rotate(-8.5 40 60)">
            {label || "1200×2600"}
          </text>
        </>
      );
      break;
    case "panel":
      body = (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={14 + i * 9} y={18 + (i % 2)} width={8} height={48} rx={1} fill={art.color} stroke={ink} strokeWidth={1.1} />
          ))}
          <rect x={12} y={28} width={58} height={4} fill="#00000030" />
          <rect x={12} y={52} width={58} height={4} fill="#00000030" />
        </>
      );
      break;
    case "tube":
      body = (
        <>
          <path d="M30 22 L50 22 L50 66 L30 66 Z" fill="#f7f5f0" stroke={ink} strokeWidth={sw} />
          <path d="M36 22 L38 10 L42 10 L44 22" fill="#e3ded3" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <rect x={30} y={34} width={20} height={18} fill={art.brandColor} />
          <text x={40} y={45} textAnchor="middle" fontSize={4.6} fontWeight={800} fill="#fff" fontFamily="var(--font-archivo)">
            {brand.slice(0, 7)}
          </text>
          <rect x={30} y={58} width={20} height={4} fill={art.color} />
        </>
      );
      break;
    default:
      body = (
        <>
          <rect x={12} y={12} width={56} height={56} rx={14} fill={art.kind === "power" ? art.brandColor : "#ece8df"} stroke={ink} strokeWidth={sw} />
          <g transform="translate(20 20) scale(1.65)" stroke={art.kind === "power" ? "#fff" : ink} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Glyph g={art.glyph ?? "misc"} />
          </g>
        </>
      );
  }

  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className={className} aria-hidden>
      {shadow}
      {body}
      {premium && (
        <g>
          <circle cx={68} cy={12} r={7} fill="#c9a24a" stroke={ink} strokeWidth={1} />
          <path d="M68 7.5 l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}

function Pattern({ kind }: { kind: ArtSpec["pattern"] }) {
  const ink = "#141311";
  if (kind === "wood")
    return <path d="M20 30 L46 20 M26 32 L52 22 M32 34 L58 24 M38 36 L62 27" stroke="#00000035" strokeWidth={1} />;
  if (kind === "tile")
    return <path d="M27 25 L53 35 M20 27.5 L46 37.5 M40 20 L66 30 M34 22.5 L60 32.5 M27 35 L53 25 M33 37.5 L59 27.5 M21 32.5 L47 22.5" stroke={ink} strokeWidth={0.6} opacity={0.35} />;
  if (kind === "grass")
    return <path d="M30 30 l1-4 M35 28 l1-4 M40 31 l1-4 M45 29 l1-4 M50 31 l1-4 M38 25 l1-3 M44 34 l1-3" stroke="#2e6a2e" strokeWidth={1.2} strokeLinecap="round" />;
  if (kind === "dots")
    return (
      <g fill={ink} opacity={0.35}>
        {[
          [32, 28],
          [40, 25],
          [48, 28],
          [40, 31],
          [32, 33],
          [48, 33],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.1} />
        ))}
      </g>
    );
  return null;
}

/** 24×24 tool glyphs (drawn inside the tool tile). */
function Glyph({ g }: { g: ToolGlyph }) {
  switch (g) {
    case "drill":
      return <path d="M3 8h11l2 2v2l-2 2H9l-1 7H5l1-7H3zM16 11h5M7 8V5h4v3" />;
    case "saw":
      return <path d="M3 16L17 4l3 3L6 19zM6 19l-2 2M8 14l1 1M11 11l1 1M14 8l1 1" />;
    case "trowel":
      return <path d="M4 14h13l3 6H7zM12 14V8M10 8h4V4h-4z" />;
    case "roller":
      return <path d="M4 4h13v5H4zM17 6h3v6h-8v3M11 15h2v6h-2z" />;
    case "brush":
      return <path d="M8 3h8v7H8zM8 10l1 4h6l1-4M11 14v7h2v-7" />;
    case "level":
      return <path d="M2 9h20v6H2zM10 10h4v4h-4zM11 12h2" />;
    case "tape":
      return <path d="M4 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0M11 12h9v3h-3M9 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0" />;
    case "knife":
      return <path d="M3 17l9-9 3 3-9 9H3zM12 8l4-4 4 4-4 4" />;
    case "safety":
      return <path d="M4 9h16v3a4 4 0 0 1-4 4h-1l-3-3-3 3H8a4 4 0 0 1-4-4zM4 10H2M20 10h2" />;
    case "ladder":
      return <path d="M7 3L5 21M17 3l2 18M6.5 7h11M6 11h12M5.6 15h12.8M5.2 19h13.6" />;
    case "garden":
      return <path d="M12 3v11M8 14h8l-1 7H9zM6 3h12" />;
    default:
      return <path d="M4 20L14 10M14 10l3-7 4 4-7 3M4 20l3-1" />;
  }
}
