/**
 * Cinematic backdrop for the sign-in screen.
 *
 * PURELY DECORATIVE. The whole tree is `aria-hidden` and every layer carries
 * `pointer-events-none`, so nothing here can intercept a click or tab stop
 * meant for the form — the form sits above it on its own stacking context.
 *
 * Rendered as CSS + inline SVG rather than a photograph so it costs no image
 * bytes, stays sharp on any display, and recolours with the brand token. To use
 * a real photograph of the shop instead, drop one at the path below and set
 * PHOTO_BACKDROP to it: the illustrated scenes fade back automatically and the
 * gradient/vignette treatment continues to guarantee the card stays readable.
 */

/** e.g. "/images/login-bg.jpg". Null keeps the illustrated scene. */
const PHOTO_BACKDROP: string | null = null;

/**
 * A worker in overalls leaning into a pressure-washer lance.
 *
 * Deliberately a silhouette: at this size a detailed figure reads as clip-art,
 * whereas a backlit silhouette against haze reads as a real photographed scene.
 * Proportions are life-like (head ≈ 1/7.5 of standing height) for the same
 * reason.
 */
function Worker() {
  // Feet rest on the ground line at y=112; standing height ≈54 units, with the
  // head about a seventh of it.
  return (
    <g>
      {/* head + cap */}
      <circle cx="34" cy="65" r="4.6" />
      <path d="M29.2 63.4 h9.6 l3.4 -1.6 h-13 z" />
      {/* torso, leaning into the lance */}
      <path d="M30.5 70 q4.5 -2 8 0.6 l2.2 15.5 q-6 2.6 -11.5 0 z" />
      {/* forward arm gripping the lance */}
      <path d="M39.5 74 l16 6.4 l-1.5 3.2 l-16.5 -5.9 z" />
      {/* rear arm */}
      <path d="M31 74.5 l-4.6 10.4 l3 1.2 l5.2 -9 z" />
      {/* braced legs */}
      <path d="M30 86.5 l-2.4 19.5 h3.9 l3.8 -16.4 z" />
      <path d="M37.4 87 l3.8 19 h3.9 l-3 -19.6 z" />
      {/* boots */}
      <path d="M25.6 106 h7.2 v2.8 h-8.8 z" />
      <path d="M40 106 h7.2 v2.8 h-8.8 z" />
      {/* pressure-washer lance */}
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
            opacity={0.45 - t * 0.28}
          />
        );
      })}
    </g>
  );
}

export function LoginScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* ---- base: deep cinematic blue, brighter at the two work bays ---- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #06122b 0%, #0a1f47 42%, #071733 78%, #040c1d 100%)",
        }}
      />

      {/* Optional real photograph, when one has been supplied. */}
      {PHOTO_BACKDROP ? (
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60"
          style={{ backgroundImage: `url('${PHOTO_BACKDROP}')` }}
        />
      ) : null}

      {/* Light pools over each bay — the lit-from-above look of a wash tunnel. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 70% at 16% 45%, rgba(56,132,255,0.34), transparent 70%)," +
            "radial-gradient(60% 70% at 84% 45%, rgba(56,132,255,0.34), transparent 70%)",
        }}
      />

      {/* ---- the two work bays ---------------------------------------- */}
      {/* Hidden below lg: on a phone these become unreadable clutter behind
          the card, and the spec calls for a simplified background there. */}
      {/*
        `meet` (not `slice`) with a viewBox whose aspect matches the artwork, so
        the figures keep their proportions and nothing is cropped. Anchored to
        the bottom of the frame, standing on the wet floor.
      */}
      <svg
        className="pointer-events-none absolute bottom-[16%] left-[1%] hidden w-[38%] lg:block"
        viewBox="0 0 200 120"
        preserveAspectRatio="xMidYMax meet"
        fill="#020a19"
      >
        <defs>
          <linearGradient id="sprayCone" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#cfe4ff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#cfe4ff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* sedan in profile — long bonnet, tapered cabin */}
        <g opacity="0.96">
          <path d="M92 104 L96 92 Q98 87 104 86 L118 84.5 Q123 76 133 75.2 L151 75.2 Q160 76 165 85 L177 87 Q184 88.5 184 95 L184 104 Z" />
          <circle cx="110" cy="104.5" r="7.4" />
          <circle cx="166" cy="104.5" r="7.4" />
        </g>
        {/* foam clinging to the flank */}
        <g fill="#eaf3ff" opacity="0.42">
          <ellipse cx="116" cy="92" rx="9" ry="3.6" />
          <ellipse cx="138" cy="86" rx="11" ry="4" />
          <ellipse cx="160" cy="91" rx="7" ry="3" />
        </g>

        <Worker />
        <Spray x={75} y={80} />
      </svg>

      <svg
        className="pointer-events-none absolute bottom-[16%] right-[1%] hidden w-[38%] scale-x-[-1] lg:block"
        viewBox="0 0 200 120"
        preserveAspectRatio="xMidYMax meet"
        fill="#020a19"
      >
        {/* motorcycle in profile */}
        <g opacity="0.96">
          <circle cx="112" cy="96" r="10.5" fill="none" stroke="#020a19" strokeWidth="3.4" />
          <circle cx="164" cy="96" r="10.5" fill="none" stroke="#020a19" strokeWidth="3.4" />
          <path d="M112 96 L128 80 L150 80 L164 96 Z" />
          <path d="M129 80 L134 71 L149 71 L153 80 Z" />
          <path d="M150 71 L163 66 L165 69.5 L152 74 Z" />
          <rect x="126" y="75" width="24" height="4.4" rx="2.2" />
        </g>
        <g fill="#eaf3ff" opacity="0.4">
          <ellipse cx="138" cy="86" rx="9" ry="3.4" />
          <ellipse cx="157" cy="90" rx="6.5" ry="2.8" />
        </g>

        <Worker />
        <Spray x={75} y={80} />
      </svg>

      {/* ---- wet floor: a mirrored sheen along the bottom -------------- */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[26%]"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(96,164,255,0.20) 45%, rgba(10,32,72,0.55))",
        }}
      />

      {/* ---- drifting mist ------------------------------------------- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46% 30% at 26% 74%, rgba(190,220,255,0.16), transparent 70%)," +
            "radial-gradient(46% 30% at 74% 74%, rgba(190,220,255,0.16), transparent 70%)",
        }}
      />

      {/* ---- droplet texture ----------------------------------------- */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.32]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 12% 22%, rgba(255,255,255,0.5) 0 1.4px, transparent 1.6px)," +
            "radial-gradient(circle at 68% 14%, rgba(255,255,255,0.42) 0 1.1px, transparent 1.3px)," +
            "radial-gradient(circle at 36% 62%, rgba(255,255,255,0.34) 0 1.6px, transparent 1.8px)," +
            "radial-gradient(circle at 88% 46%, rgba(255,255,255,0.4) 0 1.2px, transparent 1.4px)",
          backgroundSize: "190px 170px, 150px 210px, 240px 190px, 170px 160px",
        }}
      />

      {/* ---- centre vignette ----------------------------------------- */}
      {/* The one layer that exists purely for legibility: it darkens the middle
          third so the card never has to fight the artwork behind it. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46% 62% at 50% 50%, rgba(3,10,26,0.86), rgba(3,10,26,0.42) 62%, transparent 82%)",
        }}
      />

      {/* ---- bay captions -------------------------------------------- */}
      {/* Sat above the vehicles rather than beside them, so the type never
          overlaps the artwork at any window height. */}
      <span className="pointer-events-none absolute left-0 top-[22%] hidden w-[40%] text-center text-[0.7rem] font-semibold uppercase tracking-[0.42em] text-white/40 lg:block">
        Car Wash
      </span>
      <span className="pointer-events-none absolute right-0 top-[22%] hidden w-[40%] text-center text-[0.7rem] font-semibold uppercase tracking-[0.42em] text-white/40 lg:block">
        Motorcycle Wash
      </span>
    </div>
  );
}
