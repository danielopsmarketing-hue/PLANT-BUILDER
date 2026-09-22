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
        <path d="M6 10h36l-12 20v10h-12V30z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>`;
    case "crusher":
      return `<svg viewBox="0 0 48 48" fill="none">
        <path d="M24 4 42 14v20L24 44 6 34V14z" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="24" cy="24" r="7" fill="none" stroke="${color}" stroke-width="2.5"/>
      </svg>`;
    case "screen":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="5" y="14" width="38" height="20" rx="2" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
        <line x1="14" y1="14" x2="14" y2="34" stroke="${color}" stroke-width="2"/>
        <line x1="24" y1="14" x2="24" y2="34" stroke="${color}" stroke-width="2"/>
        <line x1="34" y1="14" x2="34" y2="34" stroke="${color}" stroke-width="2"/>
      </svg>`;
    case "conveyor":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="4" y="20" width="40" height="8" rx="4" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
        <circle cx="9" cy="24" r="4" fill="none" stroke="${color}" stroke-width="2.5"/>
        <circle cx="39" cy="24" r="4" fill="none" stroke="${color}" stroke-width="2.5"/>
      </svg>`;
    case "stacker":
      return `<svg viewBox="0 0 48 48" fill="none">
        <rect x="4" y="4" width="36" height="7" rx="3.5" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5" transform="rotate(35 4 4)"/>
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
