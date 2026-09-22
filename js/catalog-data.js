// Placeholder equipment catalog. Replace with real product data + icons
// once the real equipment lineup and brand assets are supplied (see
// "Open decisions" in the project brief).

export const CATEGORIES = [
  { id: "feeding", label: "Feeding" },
  { id: "crushing", label: "Crushing" },
  { id: "screening", label: "Screening" },
  { id: "conveying", label: "Conveying" },
  { id: "stockpiling", label: "Stockpiling" },
];

export const EQUIPMENT = [
  {
    id: "hopper-vibrating",
    category: "feeding",
    name: "Vibrating Hopper/Feeder",
    model: "VF-100",
    icon: "hopper",
    specs: {
      "Hopper capacity": "8 yd³",
      "Feed opening": "8' x 4'",
      "Power": "15 hp",
    },
  },
  {
    id: "crusher-jaw",
    category: "crushing",
    name: "Jaw Crusher",
    model: "JC-2436",
    icon: "crusher",
    specs: {
      "Feed opening": "24\" x 36\"",
      "Power": "125 hp",
      "Weight": "45,000 lb",
    },
  },
  {
    id: "crusher-cone",
    category: "crushing",
    name: "Cone Crusher",
    model: "CC-300",
    icon: "crusher",
    specs: {
      "Mantle diameter": "51\"",
      "Power": "300 hp",
      "Weight": "52,000 lb",
    },
  },
  {
    id: "crusher-impact",
    category: "crushing",
    name: "Impact Crusher",
    model: "IC-1313",
    icon: "crusher",
    specs: {
      "Rotor size": "13\" x 13\"",
      "Power": "250 hp",
      "Weight": "38,000 lb",
    },
  },
  {
    id: "screen-incline",
    category: "screening",
    name: "Incline Screen",
    model: "IS-6x16-2",
    icon: "screen",
    specs: {
      "Deck size": "6' x 16'",
      "Decks": "2",
      "Power": "40 hp",
    },
  },
  {
    id: "screen-horizontal",
    category: "screening",
    name: "Horizontal Screen",
    model: "HS-6x20-3",
    icon: "screen",
    specs: {
      "Deck size": "6' x 20'",
      "Decks": "3",
      "Power": "50 hp",
    },
  },
  {
    id: "conveyor-belt",
    category: "conveying",
    name: "Belt Conveyor",
    model: "BC-30-60",
    icon: "conveyor",
    specs: {
      "Belt width": "30\"",
      "Length": "60'",
      "Power": "20 hp",
    },
  },
  {
    id: "conveyor-radial-stacker",
    category: "conveying",
    name: "Radial Stacker",
    model: "RS-36-80",
    icon: "stacker",
    specs: {
      "Belt width": "36\"",
      "Length": "80'",
      "Stockpile height": "22'",
    },
  },
  {
    id: "stockpile",
    category: "stockpiling",
    name: "Stockpile",
    model: "—",
    icon: "stockpile",
    specs: {
      "Type": "Ground storage",
    },
  },
];

export function getEquipmentById(id) {
  return EQUIPMENT.find((e) => e.id === id);
}
