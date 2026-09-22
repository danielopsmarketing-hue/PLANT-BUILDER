// Equipment pictograms modeled on a reference set of mobile-plant product
// illustrations: red chassis/conveyor structure, dark gray hopper/housing
// bodies, near-black tracks and belts, a small yellow accent (a railing/
// walkway detail). Not photorealistic renders -- these are lightweight
// vector line art at icon size (~28-64px) -- but the same color language
// and compositional grammar (tracked/wheeled base + hopper + body +
// angled discharge conveyor) as the reference. Category color still shows
// as a small accent tick under the icon on canvas (see colorForCategory),
// kept separate from the icon's own illustration colors.

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

const RED = "#c8102e"; // chassis / conveyor structure
const GRAY = "#565d66"; // hopper / housing bodies
const DARK = "#22262b"; // tracks, belts, outlines
const YELLOW = "#f4c430"; // small safety-yellow accent
const STONE = "#a39a8d"; // aggregate material (stockpiles), not machinery

export function iconSvg(iconType, category) {
  switch (iconType) {
    case "hopper":
      // Grizzly feeder: wide hopper mouth, grizzly bars, chute, support legs.
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M6 9h30l-8 17h-14z" fill="${GRAY}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>
        <line x1="12" y1="9" x2="12" y2="13" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>
        <line x1="21" y1="9" x2="21" y2="13" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>
        <line x1="30" y1="9" x2="30" y2="13" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>
        <rect x="34" y="12" width="8" height="7" rx="1.2" fill="${YELLOW}" stroke="${DARK}" stroke-width="1.6"/>
        <line x1="18" y1="26" x2="14" y2="42" stroke="${DARK}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="26" y1="26" x2="30" y2="42" stroke="${DARK}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    // Crushers/screens render as a mobile tracked plant train (crawler base +
    // hopper/crusher body + angled discharge conveyor), matching how these
    // machines are actually pictured in flowsheet diagrams -- not an
    // abstract pictogram of the crushing mechanism alone.
    case "crusher-jaw":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="27" height="7" rx="3.5" fill="${DARK}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="14" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="20" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="25" cy="38.5" r="1.4" fill="#6b7280"/>
        <path d="M4 9h15l-3.5 9H8z" fill="${GRAY}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>
        <rect x="8" y="18" width="15" height="17" rx="1.5" fill="${GRAY}" stroke="${DARK}" stroke-width="2"/>
        <rect x="9" y="19.5" width="13" height="2.6" rx="1" fill="${YELLOW}"/>
        <path d="M15 23 L21 29 L27 23" stroke="${RED}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="39" cy="24" r="6" fill="${RED}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="39" cy="24" r="1.4" fill="${DARK}"/>
        <path d="M21 29 L43 10" stroke="${RED}" stroke-width="4.4" stroke-linecap="round"/>
        <path d="M21 29 L43 10" stroke="${DARK}" stroke-width="4.4" fill="none" opacity="0" />
        <circle cx="43" cy="10" r="2.6" fill="${DARK}"/>
        <line x1="30" y1="23.5" x2="30" y2="29.5" stroke="${DARK}" stroke-width="1.8"/>
      </svg>`;
    case "crusher-cone":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="27" height="7" rx="3.5" fill="${DARK}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="14" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="20" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="25" cy="38.5" r="1.4" fill="#6b7280"/>
        <path d="M9 9h30l-3.5 8H12.5z" fill="${GRAY}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12.5 17 L24 34 L35.5 17 Z" fill="${GRAY}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>
        <ellipse cx="24" cy="17" rx="11.5" ry="2.4" fill="none" stroke="${DARK}" stroke-width="1.8"/>
        <circle cx="24" cy="25" r="4.5" fill="${RED}" stroke="${DARK}" stroke-width="1.6"/>
        <rect x="9" y="33" width="12" height="5" rx="1.2" fill="${DARK}" opacity="0.85"/>
        <path d="M21 29 L43 10" stroke="${RED}" stroke-width="4.4" stroke-linecap="round"/>
        <circle cx="43" cy="10" r="2.6" fill="${DARK}"/>
        <line x1="30" y1="23.5" x2="30" y2="29.5" stroke="${DARK}" stroke-width="1.8"/>
      </svg>`;
    case "crusher-impact":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="27" height="7" rx="3.5" fill="${DARK}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="14" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="20" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="25" cy="38.5" r="1.4" fill="#6b7280"/>
        <path d="M4 9h14l-3 9H8z" fill="${GRAY}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>
        <rect x="7" y="18" width="17" height="17" rx="1.5" fill="#e7e5e4" stroke="${DARK}" stroke-width="2"/>
        <rect x="8.5" y="19.5" width="14" height="2.6" rx="1" fill="${YELLOW}"/>
        <circle cx="15.5" cy="27.5" r="4.6" fill="${RED}" stroke="${DARK}" stroke-width="1.8"/>
        <path d="M21 29 L43 10" stroke="${RED}" stroke-width="4.4" stroke-linecap="round"/>
        <circle cx="43" cy="10" r="2.6" fill="${DARK}"/>
        <line x1="30" y1="23.5" x2="30" y2="29.5" stroke="${DARK}" stroke-width="1.8"/>
      </svg>`;
    case "screen":
      // Mobile tracked screen: same crawler-train grammar, wider decked box.
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="3" y="35" width="30" height="7" rx="3.5" fill="${DARK}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="8" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="14" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="21" cy="38.5" r="1.4" fill="#6b7280"/>
        <circle cx="28" cy="38.5" r="1.4" fill="#6b7280"/>
        <g transform="rotate(-9 18 24)">
          <rect x="4" y="18" width="28" height="12" rx="1.5" fill="#e7e5e4" stroke="${DARK}" stroke-width="2"/>
          <line x1="13" y1="18" x2="13" y2="30" stroke="${DARK}" stroke-width="1.4"/>
          <line x1="23" y1="18" x2="23" y2="30" stroke="${DARK}" stroke-width="1.4"/>
        </g>
        <path d="M25 29 L44 12" stroke="${RED}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="44" cy="12" r="2.4" fill="${DARK}"/>
        <path d="M4 25 L4 30 L14 27" stroke="${RED}" stroke-width="3" stroke-linecap="round" fill="none"/>
      </svg>`;
    case "conveyor":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="4" y="19" width="40" height="7" rx="3.5" fill="${RED}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="9" cy="22.5" r="4" fill="${DARK}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="39" cy="22.5" r="4" fill="${DARK}" stroke="${DARK}" stroke-width="2"/>
        <circle cx="18" cy="22.5" r="1.6" fill="${YELLOW}"/>
        <circle cx="24" cy="22.5" r="1.6" fill="${YELLOW}"/>
        <circle cx="30" cy="22.5" r="1.6" fill="${YELLOW}"/>
        <line x1="14" y1="30" x2="12" y2="40" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>
        <line x1="34" y1="30" x2="36" y2="40" stroke="${DARK}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case "stacker":
      return `<svg viewBox="0 0 48 48" fill="none">
        <circle cx="8" cy="39" r="4.5" fill="${DARK}" stroke="${DARK}" stroke-width="1.6"/>
        <circle cx="8" cy="39" r="1.6" fill="#9ca3af"/>
        <circle cx="17" cy="39" r="4.5" fill="${DARK}" stroke="${DARK}" stroke-width="1.6"/>
        <circle cx="17" cy="39" r="1.6" fill="#9ca3af"/>
        <path d="M30 44 L46 44 L38 26 Z" fill="${STONE}" stroke="${DARK}" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M10 34 L40 8" stroke="${RED}" stroke-width="4.4" stroke-linecap="round"/>
        <circle cx="40" cy="8" r="2.6" fill="${DARK}"/>
        <line x1="20" y1="24" x2="20" y2="31" stroke="${DARK}" stroke-width="1.8"/>
      </svg>`;
    case "stockpile":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M4 40 L24 8 L44 40 Z" fill="${STONE}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M14 34 L20 24 M24 36 L30 22 M32 34 L36 27" stroke="#78716c" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
      </svg>`;
    case "washer":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M24 5 C24 5 12 22 12 31 a12 12 0 0 0 24 0 C36 22 24 5 24 5 Z" fill="#0891b2" fill-opacity="0.85" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M8 40 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="${DARK}" stroke-width="1.8" fill="none"/>
      </svg>`;
    case "shredder":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="18" rx="2" fill="${GRAY}" stroke="${DARK}" stroke-width="2"/>
        <rect x="8" y="12" width="32" height="2.6" rx="1" fill="${YELLOW}"/>
        <path d="M6 28 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8" stroke="${RED}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>
        <circle cx="12" cy="19" r="2.2" fill="${DARK}"/>
        <circle cx="36" cy="19" r="2.2" fill="${DARK}"/>
      </svg>`;
    case "mixer":
      return `<svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="17" fill="${GRAY}" stroke="${DARK}" stroke-width="2"/>
        <path d="M24 10 V38 M13 15 L35 33 M35 15 L13 33" stroke="${RED}" stroke-width="2.4"/>
        <circle cx="24" cy="24" r="2.4" fill="${DARK}"/>
      </svg>`;
    default:
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="6" width="36" height="36" rx="4" fill="${GRAY}" fill-opacity="0.5" stroke="${DARK}" stroke-width="2"/>
      </svg>`;
  }
}
