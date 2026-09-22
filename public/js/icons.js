// Simple geometric placeholder icons, one per equipment category.
// Swap these for real equipment photos/icons once we have rights to use them
// (see "Open decisions" in the project brief).

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

export function iconSvg(iconType, category) {
  const color = colorForCategory(category);
  switch (iconType) {
    case "hopper":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M6 8h36l-12 20v8h-12v-8z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <line x1="16" y1="36" x2="12" y2="43" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="36" x2="36" y2="43" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    // Crushers get a distinct silhouette per type (jaw/cone/impact), AggFlow-style,
    // instead of one generic shape -- the category color still ties them together.
    case "crusher-jaw":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M8 8h32l-4 10H12z" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M12 18h24v14a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M17 20 L24 27 L31 20" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="14" y1="40" x2="11" y2="45" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="34" y1="40" x2="37" y2="45" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    case "crusher-cone":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M10 10h28l-3 8H13z" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M13 18 L24 40 L35 18 Z" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <ellipse cx="24" cy="18" rx="11" ry="2.5" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="16" y1="42" x2="13" y2="46" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="42" x2="35" y2="46" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    case "crusher-impact":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="7" y="10" width="34" height="26" rx="2" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2.5"/>
        <circle cx="24" cy="23" r="8" fill="none" stroke="${color}" stroke-width="2.5"/>
        <path d="M24 15 V31 M17 23 H31 M19 18 L29 28 M29 18 L19 28" stroke="${color}" stroke-width="1.6"/>
        <line x1="14" y1="36" x2="11" y2="42" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="34" y1="36" x2="37" y2="42" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    case "screen":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="5" y="12" width="38" height="18" rx="2" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" transform="rotate(-6 24 21)"/>
        <line x1="14" y1="14" x2="12" y2="28" stroke="${color}" stroke-width="1.8" transform="rotate(-6 24 21)"/>
        <line x1="24" y1="13" x2="22.5" y2="29" stroke="${color}" stroke-width="1.8" transform="rotate(-6 24 21)"/>
        <line x1="34" y1="12" x2="33" y2="30" stroke="${color}" stroke-width="1.8" transform="rotate(-6 24 21)"/>
        <line x1="10" y1="38" x2="13" y2="44" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="38" y1="38" x2="35" y2="44" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>`;
    case "conveyor":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="4" y="19" width="40" height="7" rx="3.5" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
        <circle cx="9" cy="22.5" r="4" fill="none" stroke="${color}" stroke-width="2.5"/>
        <circle cx="39" cy="22.5" r="4" fill="none" stroke="${color}" stroke-width="2.5"/>
        <line x1="14" y1="30" x2="12" y2="40" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        <line x1="34" y1="30" x2="36" y2="40" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case "stacker":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="4" y="4" width="36" height="7" rx="3.5" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" transform="rotate(35 4 4)"/>
        <circle cx="7" cy="9" r="3.2" fill="none" stroke="${color}" stroke-width="2" transform="rotate(35 4 4)"/>
        <path d="M6 44 L40 44 L30 26 L18 26 Z" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2"/>
      </svg>`;
    case "stockpile":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M4 40 L24 8 L44 40 Z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>`;
    case "washer":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M24 5 C24 5 12 22 12 31 a12 12 0 0 0 24 0 C36 22 24 5 24 5 Z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M8 40 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="${color}" stroke-width="2" fill="none"/>
      </svg>`;
    case "shredder":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="18" rx="2" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
        <path d="M6 28 l6 8 l6 -8 l6 8 l6 -8 l6 8 l6 -8" stroke="${color}" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
      </svg>`;
    case "mixer":
      return `<svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="17" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2.5"/>
        <path d="M24 10 V38 M13 15 L35 33 M35 15 L13 33" stroke="${color}" stroke-width="2.5"/>
      </svg>`;
    default:
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="6" width="36" height="36" rx="4" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
      </svg>`;
  }
}
