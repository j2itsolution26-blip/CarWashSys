/**
 * Wash-bay backdrop for the sign-in screen.
 *
 * PURELY DECORATIVE. The whole tree is `aria-hidden` and every layer carries
 * `pointer-events-none`, so nothing here can intercept a click or a tab stop
 * meant for the form — the card sits above it on its own stacking context.
 *
 * Built from CSS and inline SVG rather than photography: it costs no image
 * bytes, stays sharp at any density, needs no JavaScript, and cannot delay the
 * form becoming interactive. To use a real photograph of the shop instead, drop
 * one in `public/images/` and point PHOTO_BACKDROP at it — the illustrated bays
 * fade out automatically and the navy overlay + centre vignette keep the card
 * readable over whatever the photo happens to contain.
 */

/**
 * Path to a photographic backdrop under `public/`, or null for the illustrated
 * bays. See `public/images/README.md` for the file this expects.
 *
 * Set: the photo becomes the scene, and the illustrated vehicles, washers and
 * bay signage are withdrawn — a real photograph is ONE scene, so drawing a
 * second illustrated car over it, or captioning half of a car-wash photo
 * "MOTORCYCLE WASH", would look wrong and read as a mistake.
 *
 * Applied as a CSS background rather than <Image>, so a missing or misnamed
 * file degrades to the illustrated scene instead of rendering a broken image on
 * the sign-in screen.
 */
const PHOTO_BACKDROP: string | null = "/images/login-bg.jpg";

/** True when the illustrated bays should draw. */
const SHOW_ILLUSTRATION = PHOTO_BACKDROP === null;

const NAVY_DEEP = "#020817";
const NAVY = "#071a3d";
const BRIGHT_BLUE = "#1683ff";

/**
 * A washer leaning into a pressure-washer lance.
 *
 * A backlit silhouette rather than a detailed figure: at this size detail reads
 * as clip-art, while a silhouette against haze reads as a real photographed
 * scene. Proportions are life-like — head ≈ 1/7.5 of standing height.
 */
function Washer() {
  return (
    <g fill={NAVY_DEEP}>
      <circle cx="34" cy="65" r="4.6" />
      <path d="M29.2 63.4 h9.6 l3.4 -1.6 h-13 z" />
      <path d="M30.5 70 q4.5 -2 8 0.6 l2.2 15.5 q-6 2.6 -11.5 0 z" />
      <path d="M39.5 74 l16 6.4 l-1.5 3.2 l-16.5 -5.9 z" />
      <path d="M31 74.5 l-4.6 10.4 l3 1.2 l5.2 -9 z" />
      <path d="M30 86.5 l-2.4 19.5 h3.9 l3.8 -16.4 z" />
      <path d="M37.4 87 l3.8 19 h3.9 l-3 -19.6 z" />
      <path d="M25.6 106 h7.2 v2.8 h-8.8 z" />
      <path d="M40 106 h7.2 v2.8 h-8.8 z" />
      <rect x="54" y="79.5" width="20" height="2" rx="1" />
    </g>
  );
}

/** Fine conical spray leaving the lance tip. */
function Spray({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L34 -10 L34 11 Z" fill="url(#sprayCone)" />
      {[...Array(12)].map((_, i) => {
        const t = (i + 1) / 13;
        return (
          <circle
            key={i}
            cx={t * 34}
            cy={(i % 2 === 0 ? -1 : 1) * t * 8 * ((i % 3) / 2.2)}
            r={0.4 + t * 0.8}
            fill="#eaf3ff"
            opacity={0.5 - t * 0.3}
          />
        );
      })}
    </g>
  );
}

/** Bay signage: title on a dark fascia with an LED strip beneath it. */
function BaySign({
  title,
  side,
  features,
}: {
  title: string;
  side: "left" | "right";
  features: Array<{ label: string; detail: string }>;
}) {
  return (
    <div
      className={`pointer-events-none absolute top-0 hidden w-[34%] lg:block ${
        side === "left" ? "left-0" : "right-0"
      }`}
    >
      {/* fascia */}
      <div className="relative bg-[#040e22]/90 px-6 py-4">
        <p
          className={`text-2xl font-extrabold uppercase tracking-wide text-white/95 xl:text-3xl ${
            side === "left" ? "text-left" : "text-right"
          }`}
        >
          {title}
        </p>
        {/* LED strip */}
        <span
          className="absolute inset-x-0 bottom-0 h-[3px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${BRIGHT_BLUE}, transparent)`,
            boxShadow: `0 0 12px ${BRIGHT_BLUE}, 0 0 26px ${BRIGHT_BLUE}66`,
          }}
        />
      </div>

      {/* Secondary feature chips — deliberately recessive. */}
      <ul className={`mt-6 space-y-3 px-6 ${side === "left" ? "text-left" : "text-right"}`}>
        {features.map((feature) => (
          <li
            key={feature.label}
            className={`flex items-center gap-2.5 ${side === "left" ? "" : "flex-row-reverse"}`}
          >
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-md bg-[#0b1b38]/80 text-[0.7rem] font-bold"
              style={{ color: BRIGHT_BLUE, boxShadow: `inset 0 0 0 1px ${BRIGHT_BLUE}33` }}
            >
              ◆
            </span>
            <span>
              <span
                className="block text-[0.7rem] font-bold uppercase tracking-wider"
                style={{ color: BRIGHT_BLUE }}
              >
                {feature.label}
              </span>
              <span className="block text-[0.66rem] text-white/45">{feature.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LoginScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* ---- base: deep navy, lifted at the two work bays ---------------- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${NAVY_DEEP} 0%, ${NAVY} 45%, #05132b 78%, ${NAVY_DEEP} 100%)`,
        }}
      />

      {PHOTO_BACKDROP ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url('${PHOTO_BACKDROP}')` }}
          />
          {/*
            Navy grade over the photograph. A raw photo behind a login form is
            the usual way these designs fail: mid-tones sit right where the card
            needs contrast. This pins the whole image into the brand's dark navy
            range before the vignette narrows it further.
          */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                `linear-gradient(180deg, rgb(2 8 23 / 0.82), rgb(7 26 61 / 0.68) 45%, rgb(2 8 23 / 0.88))`,
            }}
          />
        </>
      ) : null}

      {/* Light pools over each bay — the lit-from-above look of a wash tunnel. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 66% at 15% 46%, rgba(22,131,255,0.30), transparent 70%)," +
            "radial-gradient(58% 66% at 85% 46%, rgba(22,131,255,0.30), transparent 70%)",
        }}
      />

      {/*
        Bay structure: overhead light bars and a floor line. These fill the
        vertical space between the signage and the vehicles, which otherwise
        reads as an empty band, and give the scene the depth of a real wash
        tunnel rather than a figure floating on a gradient.
      */}
      {SHOW_ILLUSTRATION && (["left", "right"] as const).map((side) => (
        <div
          key={side}
          className={`pointer-events-none absolute top-[26%] hidden h-[46%] w-[46%] lg:block ${
            side === "left" ? "left-0" : "right-0"
          }`}
        >
          {[0, 1, 2].map((row) => (
            <span
              key={row}
              className="absolute h-[2px] rounded-full"
              style={{
                top: `${row * 15 + 4}%`,
                // Bars recede toward the centre of the frame, giving perspective.
                left: side === "left" ? `${row * 5}%` : "auto",
                right: side === "right" ? `${row * 5}%` : "auto",
                width: `${58 - row * 9}%`,
                background: `linear-gradient(90deg, transparent, ${BRIGHT_BLUE}aa, transparent)`,
                boxShadow: `0 0 14px ${BRIGHT_BLUE}55`,
                opacity: 0.5 - row * 0.11,
              }}
            />
          ))}
        </div>
      ))}

      {/* ---- LEFT BAY: car ------------------------------------------------ */}
      {SHOW_ILLUSTRATION ? (
      <svg
        className="pointer-events-none absolute bottom-[17%] left-0 hidden w-[39%] lg:block"
        viewBox="0 0 200 120"
        preserveAspectRatio="xMidYMax meet"
      >
        <defs>
          <linearGradient id="sprayCone" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#cfe4ff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#cfe4ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="carSheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#12305e" />
            <stop offset="1" stopColor={NAVY_DEEP} />
          </linearGradient>
        </defs>

        {/* sedan in profile — long bonnet, tapered cabin */}
        <g>
          <path
            d="M92 104 L96 92 Q98 87 104 86 L118 84.5 Q123 76 133 75.2 L151 75.2 Q160 76 165 85 L177 87 Q184 88.5 184 95 L184 104 Z"
            fill="url(#carSheen)"
          />
          {/* headlight glow */}
          <ellipse cx="183" cy="93" rx="4" ry="2.2" fill="#dceaff" opacity="0.85" />
          <circle cx="110" cy="104.5" r="7.4" fill={NAVY_DEEP} />
          <circle cx="166" cy="104.5" r="7.4" fill={NAVY_DEEP} />
        </g>
        {/* foam clinging to the flank */}
        <g fill="#eaf3ff" opacity="0.5">
          <ellipse cx="116" cy="92" rx="9" ry="3.6" />
          <ellipse cx="138" cy="86" rx="11" ry="4" />
          <ellipse cx="160" cy="91" rx="7" ry="3" />
        </g>

        <Washer />
        <Spray x={75} y={80} />
      </svg>
      ) : null}

      {/* ---- RIGHT BAY: motorcycle --------------------------------------- */}
      {/* Mirrored so the washer faces inward, toward the machine. */}
      {SHOW_ILLUSTRATION ? (
      <svg
        className="pointer-events-none absolute bottom-[17%] right-0 hidden w-[39%] scale-x-[-1] lg:block"
        viewBox="0 0 200 120"
        preserveAspectRatio="xMidYMax meet"
      >
        {/* sport bike in profile */}
        <g fill={NAVY_DEEP}>
          <circle cx="112" cy="96" r="10.5" fill="none" stroke={NAVY_DEEP} strokeWidth="3.4" />
          <circle cx="164" cy="96" r="10.5" fill="none" stroke={NAVY_DEEP} strokeWidth="3.4" />
          {/* fairing + tank */}
          <path d="M112 96 L124 82 Q132 76 142 76 L152 76 L164 96 Z" />
          <path d="M129 78 L134 70 Q140 67 148 68 L152 76 Z" />
          {/* screen + nose */}
          <path d="M150 70 L164 64 L167 68 L153 74 Z" />
          <rect x="124" y="73" width="22" height="4.4" rx="2.2" />
          {/* exhaust */}
          <rect x="150" y="90" width="16" height="3.4" rx="1.7" />
        </g>
        {/* blue rim accent, so the bike reads as a machine not a blob */}
        <circle cx="112" cy="96" r="6" fill="none" stroke={BRIGHT_BLUE} strokeWidth="1.2" opacity="0.65" />
        <circle cx="164" cy="96" r="6" fill="none" stroke={BRIGHT_BLUE} strokeWidth="1.2" opacity="0.65" />
        <ellipse cx="167" cy="67" rx="3" ry="1.8" fill="#dceaff" opacity="0.8" />

        <g fill="#eaf3ff" opacity="0.45">
          <ellipse cx="138" cy="84" rx="9" ry="3.4" />
          <ellipse cx="157" cy="89" rx="6.5" ry="2.8" />
        </g>

        <Washer />
        <Spray x={75} y={80} />
      </svg>
      ) : null}

      {/* ---- wet floor: mirrored sheen along the bottom ------------------- */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[24%]"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(22,131,255,0.16) 45%, rgba(2,8,23,0.7))",
        }}
      />

      {/* ---- drifting mist ----------------------------------------------- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(44% 28% at 24% 76%, rgba(190,220,255,0.14), transparent 70%)," +
            "radial-gradient(44% 28% at 76% 76%, rgba(190,220,255,0.14), transparent 70%)",
        }}
      />

      {/* ---- droplet texture --------------------------------------------- */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 12% 22%, rgba(255,255,255,0.5) 0 1.4px, transparent 1.6px)," +
            "radial-gradient(circle at 68% 14%, rgba(255,255,255,0.42) 0 1.1px, transparent 1.3px)," +
            "radial-gradient(circle at 36% 62%, rgba(255,255,255,0.34) 0 1.6px, transparent 1.8px)," +
            "radial-gradient(circle at 88% 46%, rgba(255,255,255,0.4) 0 1.2px, transparent 1.4px)",
          backgroundSize: "190px 170px, 150px 210px, 240px 190px, 170px 160px",
        }}
      />

      {/* ---- centre vignette --------------------------------------------- */}
      {/* The one layer that exists purely for legibility: it darkens the middle
          third so the card never has to fight the scene behind it. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(44% 60% at 50% 50%, rgba(2,8,23,0.9), rgba(2,8,23,0.5) 60%, transparent 82%)",
        }}
      />

      {/* ---- bay signage -------------------------------------------------- */}
      {/* Withdrawn in photo mode: captioning half of a single photograph
          "MOTORCYCLE WASH" would be describing something that is not there. */}
      {SHOW_ILLUSTRATION ? (
      <>
      <BaySign
        title="Car Wash"
        side="left"
        features={[
          { label: "Clean", detail: "Spotless results" },
          { label: "Protect", detail: "Care that lasts" },
          { label: "Shine", detail: "Brilliant finish" },
        ]}
      />
      <BaySign
        title="Motorcycle Wash"
        side="right"
        features={[
          { label: "Safe", detail: "Gentle on every part" },
          { label: "Clean", detail: "Thorough & effective" },
          { label: "Perform", detail: "Keep your ride at its best" },
        ]}
      />
      </>
      ) : null}
    </div>
  );
}
