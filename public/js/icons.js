// AggFlow-style equipment pictograms: bold silhouette per machine type plus
// one or two mechanical accents (a flywheel, a motor box, support legs) --
// legible at ~28px, not fine cross-hatching that turns to mud that small.
// Swap these for real product photos once available (see admin.html).

const CATEGORY_COLORS = {
  feeding: "#d97706",
  crushing: "#dc2626",
  screening: "#2563eb",
  conveying: "#059669",
  stockpiling: "#7c3aed",
  washing: "#0891b2",
  shredding: "#9a3412",
  mixing: "#4338ca",
};

export function colorForCategory(category) {
  return CATEGORY_COLORS[category] || "#6b7280";
}

const NEUTRAL_ICON_COLOR = "#334155"; // slate-700 -- AggFlow's equipment icons are black/white, not colored per category

export function iconSvg(iconType, category) {
  // Monochrome by default, AggFlow-style: the icon shows equipment TYPE,
  // category color is a separate accent (see colorForCategory), not baked
  // into the icon itself.
  const color = NEUTRAL_ICON_COLOR;
  switch (iconType) {
    case "hopper":
      // Grizzly feeder: wide hopper mouth, grizzly bars, chute, support legs.
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M6 9h30l-8 17h-14z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <line x1="12" y1="9" x2="12" y2="13" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <line x1="21" y1="9" x2="21" y2="13" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <line x1="30" y1="9" x2="30" y2="13" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <rect x="34" y="12" width="8" height="7" rx="1.2" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="2"/>
        <line x1="18" y1="26" x2="14" y2="42" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="26" y1="26" x2="30" y2="42" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    // Crushers/screens render as a mobile tracked plant train (crawler base +
    // hopper/crusher body + angled discharge conveyor), matching how these
    // machines are actually pictured in flowsheet diagrams -- not an
    // abstract pictogram of the crushing mechanism alone.
    case "crusher-jaw":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="27" height="7" rx="3.5" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="14" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="20" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="25" cy="38.5" r="1.4" fill="${color}"/>
        <path d="M4 9h15l-3.5 9H8z" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
        <rect x="8" y="18" width="15" height="17" rx="1.5" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.2"/>
        <circle cx="20.5" cy="26.5" r="3.6" fill="none" stroke="${color}" stroke-width="2"/>
        <circle cx="20.5" cy="26.5" r="1" fill="${color}"/>
        <path d="M21 29 L43 10" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.25"/>
        <path d="M21 29 L43 10" stroke="${color}" stroke-width="2.2"/>
        <circle cx="43" cy="10" r="2.6" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="30" y1="23.5" x2="30" y2="29.5" stroke="${color}" stroke-width="1.8"/>
      </svg>`;
    case "crusher-cone":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="27" height="7" rx="3.5" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="14" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="20" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="25" cy="38.5" r="1.4" fill="${color}"/>
        <ellipse cx="15" cy="16" rx="8" ry="2.2" fill="none" stroke="${color}" stroke-width="2"/>
        <path d="M7 16 L11 31 L19 31 L23 16 Z" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
        <rect x="9" y="30" width="12" height="5" rx="1.2" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2"/>
        <path d="M21 29 L43 10" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.25"/>
        <path d="M21 29 L43 10" stroke="${color}" stroke-width="2.2"/>
        <circle cx="43" cy="10" r="2.6" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="30" y1="23.5" x2="30" y2="29.5" stroke="${color}" stroke-width="1.8"/>
      </svg>`;
    case "crusher-impact":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="27" height="7" rx="3.5" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="14" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="20" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="25" cy="38.5" r="1.4" fill="${color}"/>
        <path d="M4 9h14l-3 9H8z" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
        <rect x="7" y="18" width="17" height="17" rx="1.5" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.2"/>
        <circle cx="15.5" cy="26.5" r="4.6" fill="none" stroke="${color}" stroke-width="2"/>
        <path d="M15.5 22 V31 M11 26.5 H20" stroke="${color}" stroke-width="1.6"/>
        <path d="M21 29 L43 10" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.25"/>
        <path d="M21 29 L43 10" stroke="${color}" stroke-width="2.2"/>
        <circle cx="43" cy="10" r="2.6" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="30" y1="23.5" x2="30" y2="29.5" stroke="${color}" stroke-width="1.8"/>
      </svg>`;
    case "screen":
      // Mobile tracked screen: same crawler-train grammar, wider decked box.
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="30" height="7" rx="3.5" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="14" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="21" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="28" cy="38.5" r="1.4" fill="${color}"/>
        <g transform="rotate(-9 18 24)">
          <rect x="4" y="18" width="28" height="12" rx="1.5" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2.2"/>
          <line x1="13" y1="18" x2="13" y2="30" stroke="${color}" stroke-width="1.6"/>
          <line x1="23" y1="18" x2="23" y2="30" stroke="${color}" stroke-width="1.6"/>
        </g>
        <path d="M25 29 L44 12" stroke="${color}" stroke-width="4.6" stroke-linecap="round" opacity="0.25"/>
        <path d="M25 29 L44 12" stroke="${color}" stroke-width="2.2"/>
        <circle cx="44" cy="12" r="2.4" fill="none" stroke="${color}" stroke-width="2"/>
      </svg>`;
    case "conveyor":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="4" y="19" width="40" height="7" rx="3.5" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
        <circle cx="9" cy="22.5" r="4" fill="none" stroke="${color}" stroke-width="2.5"/>
        <circle cx="39" cy="22.5" r="4" fill="none" stroke="${color}" stroke-width="2.5"/>
        <circle cx="18" cy="22.5" r="1.6" fill="${color}"/>
        <circle cx="24" cy="22.5" r="1.6" fill="${color}"/>
        <circle cx="30" cy="22.5" r="1.6" fill="${color}"/>
        <line x1="14" y1="30" x2="12" y2="40" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <line x1="34" y1="30" x2="36" y2="40" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case "stacker":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="14" height="7" rx="3.5" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.2"/>
        <circle cx="7.5" cy="38.5" r="1.4" fill="${color}"/>
        <circle cx="12.5" cy="38.5" r="1.4" fill="${color}"/>
        <path d="M30 44 L46 44 L38 26 Z" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M10 34 L40 8" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity="0.25"/>
        <path d="M10 34 L40 8" stroke="${color}" stroke-width="2.2"/>
        <circle cx="40" cy="8" r="2.6" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="24" y1="21" x2="24" y2="27" stroke="${color}" stroke-width="1.8"/>
      </svg>`;
    case "stockpile":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M4 40 L24 8 L44 40 Z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M14 34 L20 24 M24 36 L30 22 M32 34 L36 27" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
      </svg>`;
    case "washer":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M24 5 C24 5 12 22 12 31 a12 12 0 0 0 24 0 C36 22 24 5 24 5 Z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M8 40 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="${color}" stroke-width="2" fill="none"/>
        <line x1="24" y1="14" x2="24" y2="30" stroke="${color}" stroke-width="1.6" stroke-dasharray="3 2.5"/>
      </svg>`;
    case "shredder":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="18" rx="2" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
        <path d="M6 28 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8" stroke="${color}" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
        <circle cx="12" cy="19" r="2.4" fill="none" stroke="${color}" stroke-width="1.8"/>
        <circle cx="36" cy="19" r="2.4" fill="none" stroke="${color}" stroke-width="1.8"/>
      </svg>`;
    case "mixer":
      return `<svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="17" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2.5"/>
        <path d="M24 10 V38 M13 15 L35 33 M35 15 L13 33" stroke="${color}" stroke-width="2.5"/>
        <circle cx="24" cy="24" r="2.4" fill="${color}"/>
      </svg>`;
    default:
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="6" width="36" height="36" rx="4" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
      </svg>`;
  }
}
