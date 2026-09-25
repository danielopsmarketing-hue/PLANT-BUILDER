// Translates a structured "plant specification" -- the intermediate model
// between a natural-language plant description and canvas mutations (see
// the phased instructions' Stream 1) -- into a Command Layer batch
// (PlantBuilderApp.applyCommand/applyCommandBatch in app.js, Phase 4a/4b).
//
// Deliberately a pure, dependency-free module: it never touches the DOM
// or the app's live Maps, only returns plain command objects, so it's
// testable in isolation and so a caller can inspect warnings before
// anything is applied to the canvas.
//
// Spec shape:
// {
//   equipment: [{ ref: "e1", equipmentId: "<real catalog id>" }, ...],
//   connections: [{ from: "e1", to: "e2" }, ...],
//   notes: [{ text: "...", near: "e1" }, ...],   // optional
// }
// `ref` is a scratch id scoped to this one spec, not a canvas id -- it
// only exists so connections/notes can point at an equipment entry before
// that entry has a real node id (which doesn't exist until the create
// commands are actually applied).

const COLUMN_SPACING = 280;
const ROW_SPACING = 170;
const DEFAULT_FLOW_STAGE = 1;
const CANVAS_PADDING = 80;

export function planSpecToCommands(spec, { equipmentById, categories, existingBounds = null }) {
  const warnings = [];
  const equipmentList = Array.isArray(spec?.equipment) ? spec.equipment : [];
  const connections = Array.isArray(spec?.connections) ? spec.connections : [];
  const notes = Array.isArray(spec?.notes) ? spec.notes : [];

  const stageForCategory = (categoryId) => categories.find((c) => c.id === categoryId)?.flowStage ?? DEFAULT_FLOW_STAGE;

  // Only equipment the catalog actually has survives -- this is the
  // "never invent equipment" check applied to the spec itself, on top of
  // search_equipment (server/db.js) only ever returning real catalog rows.
  const seenRefs = new Set();
  const validEquipment = [];
  for (const item of equipmentList) {
    if (!item?.ref || !item?.equipmentId) {
      warnings.push(`Skipped an equipment entry missing "ref" or "equipmentId".`);
      continue;
    }
    if (seenRefs.has(item.ref)) {
      warnings.push(`Skipped "${item.ref}": duplicate ref in this spec.`);
      continue;
    }
    const catalogItem = equipmentById.get(item.equipmentId);
    if (!catalogItem) {
      warnings.push(`Skipped "${item.ref}": equipmentId "${item.equipmentId}" is not in the catalog.`);
      continue;
    }
    seenRefs.add(item.ref);
    validEquipment.push({ ...item, catalogItem, stage: stageForCategory(catalogItem.category) });
  }

  // Group into columns by flow stage (sorted, not necessarily contiguous
  // integers -- conveying's 1.5 sits between crushing's 1 and screening's
  // 2), and place new equipment to the right of whatever's already on the
  // canvas rather than on top of it.
  const stages = [...new Set(validEquipment.map((e) => e.stage))].sort((a, b) => a - b);
  const originX = existingBounds ? existingBounds.maxX + CANVAS_PADDING : CANVAS_PADDING;
  const originY = CANVAS_PADDING;

  const positionByRef = new Map();
  const createCommands = [];
  for (const [colIndex, stage] of stages.entries()) {
    const itemsInStage = validEquipment.filter((e) => e.stage === stage);
    itemsInStage.forEach((item, rowIndex) => {
      const x = originX + colIndex * COLUMN_SPACING;
      const y = originY + rowIndex * ROW_SPACING;
      positionByRef.set(item.ref, { x, y });
      createCommands.push({ type: "addNode", equipmentId: item.equipmentId, x, y, ref: item.ref });
    });
  }

  const refsPresent = new Set(validEquipment.map((e) => e.ref));

  // Connections/notes need real node ids, which only exist once
  // createCommands has actually been applied -- the caller applies those
  // first, then calls this with the resulting ref -> id map (see
  // PlantBuilderApp.applyPlantSpec).
  function buildFollowUpCommands(idsByRef) {
    const followUp = [];
    const seenPairs = new Set();
    for (const conn of connections) {
      if (!conn?.from || !conn?.to || !refsPresent.has(conn.from) || !refsPresent.has(conn.to)) {
        warnings.push(`Skipped a connection referencing an unknown ref ("${conn?.from}" -> "${conn?.to}").`);
        continue;
      }
      const from = idsByRef.get(conn.from);
      const to = idsByRef.get(conn.to);
      if (!from || !to || from === to) continue;
      const pairKey = [from, to].sort().join("|");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      followUp.push({ type: "addConnector", from, to });
    }
    for (const note of notes) {
      if (!note?.text) continue;
      const anchor = note.near ? positionByRef.get(note.near) : null;
      const x = anchor ? anchor.x + 40 : originX;
      const y = anchor ? anchor.y - 90 : originY;
      followUp.push({ type: "addShape", kind: "note", x, y, text: note.text });
    }
    return followUp;
  }

  return { createCommands, buildFollowUpCommands, warnings };
}
