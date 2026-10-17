export type JerseyStyle = "plain" | "bicolor" | "striped" | "hoops" | "sash" | "diagonal" | "chevron" | "collar";

type JerseySVGProps = {
  uid: string;
  color1: string;
  color2: string;
  color3: string;
  style: JerseyStyle;
  number: string;
  numberColor?: string;
};

const JERSEY_PATH = "M25 20C25 20 40 10 50 10C60 10 75 20 75 20L95 40L80 55L75 45V90H25V45L20 55L5 40L25 20Z";

function defaultNumberColor(style: JerseyStyle, color1: string, color2: string, color3: string): string {
  if (style === "bicolor") return color1;
  if (style === "plain") return color2;
  return color3;
}

export function JerseySVG({ uid, color1, color2, color3, style, number, numberColor }: JerseySVGProps) {
  const clipId = `clip-${uid}`;
  const numColor = numberColor ?? defaultNumberColor(style, color1, color2, color3);

  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <clipPath id={clipId}>
          <path d={JERSEY_PATH} />
        </clipPath>

        {style === "striped" && (
          <pattern id={`pat-${uid}`} x="0" y="0" width="12" height="100" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="6" height="100" fill={color1} />
            <rect x="6" y="0" width="6" height="100" fill={color2} />
          </pattern>
        )}

        {style === "hoops" && (
          <pattern id={`pat-${uid}`} x="0" y="0" width="100" height="16" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100" height="8" fill={color1} />
            <rect x="0" y="8" width="100" height="8" fill={color2} />
          </pattern>
        )}
      </defs>

      {style === "plain" && (
        <path d={JERSEY_PATH} fill={color1} stroke={color3} strokeWidth="4" />
      )}

      {style === "bicolor" && (
        <>
          <path d={JERSEY_PATH} fill={color1} stroke={color3} strokeWidth="4" />
          <g clipPath={`url(#${clipId})`}>
            <polygon points="5,40 25,20 40,10 40,55 20,55" fill={color2} opacity="0.9" />
            <polygon points="95,40 75,20 60,10 60,55 80,55" fill={color2} opacity="0.9" />
          </g>
          <path d={JERSEY_PATH} fill="none" stroke={color3} strokeWidth="4" />
        </>
      )}

      {style === "striped" && (
        <path d={JERSEY_PATH} fill={`url(#pat-${uid})`} stroke={color3} strokeWidth="4" />
      )}

      {style === "hoops" && (
        <path d={JERSEY_PATH} fill={`url(#pat-${uid})`} stroke={color3} strokeWidth="4" />
      )}

      {style === "sash" && (
        <>
          <path d={JERSEY_PATH} fill={color1} stroke={color3} strokeWidth="4" />
          <g clipPath={`url(#${clipId})`}>
            <polygon points="30,10 70,10 85,90 45,90" fill={color2} opacity="0.85" />
          </g>
          <path d={JERSEY_PATH} fill="none" stroke={color3} strokeWidth="4" />
        </>
      )}

      {style === "diagonal" && (
        <>
          <path d={JERSEY_PATH} fill={color1} stroke={color3} strokeWidth="4" />
          <g clipPath={`url(#${clipId})`}>
            <polygon points="0,0 100,0 100,100" fill={color2} opacity="0.85" />
          </g>
          <path d={JERSEY_PATH} fill="none" stroke={color3} strokeWidth="4" />
        </>
      )}

      {style === "chevron" && (
        <>
          <path d={JERSEY_PATH} fill={color1} stroke={color3} strokeWidth="4" />
          <g clipPath={`url(#${clipId})`}>
            <polygon points="0,25 50,55 100,25 100,100 0,100" fill={color2} opacity="0.85" />
          </g>
          <path d={JERSEY_PATH} fill="none" stroke={color3} strokeWidth="4" />
        </>
      )}

      {style === "collar" && (
        <>
          <path d={JERSEY_PATH} fill={color1} stroke={color3} strokeWidth="4" />
          <g clipPath={`url(#${clipId})`}>
            <rect x="35" y="10" width="30" height="14" rx="4" fill={color2} />
            <rect x="38" y="10" width="24" height="8" rx="3" fill={color2} />
          </g>
          <path d={JERSEY_PATH} fill="none" stroke={color3} strokeWidth="4" />
        </>
      )}

      <text
        x="50"
        y="66"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="24"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
        fill={numColor}
        stroke={color1}
        strokeWidth="1"
        paintOrder="stroke"
      >
        {number}
      </text>
    </svg>
  );
}

export const JERSEY_STYLE_LABELS: Record<JerseyStyle, string> = {
  plain:    "Uni",
  bicolor:  "Bicolore",
  striped:  "Rayures",
  hoops:    "Bandes",
  sash:     "Écharpe",
  diagonal: "Diagonal",
  chevron:  "Chevron",
  collar:   "Col",
};
