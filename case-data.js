// Datos transcritos del caso PDF/Excel. Horas civiles de planta, sin conversión de zona.
export const period = {
  label: "12–16 de octubre de 2026",
  days: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  start: "08:00", end: "16:00",
};

export const assets = [
  { id: "cnc", reference: "TC-01", name: "Torno CNC", location: "Planta 1 > Nave A > Celda 2", requiredSchedule: true, demo: false },
  { id: "compressor", reference: "C-02", name: "Compresor", location: "Planta 1 > Sala de servicios", requiredSchedule: false, demo: false },
  { id: "robot", reference: "DEMO-03", name: "Robot de manipulación", location: "Demostración visual · sin datos en este caso", requiredSchedule: false, demo: true },
];

export const modes = [
  {
    assetId: "cnc", id: "sensor", code: "F1", title: "Sensor de resguardo parpadea",
    component: "Sensor / resguardo", observedIn: ["C1"],
    effect: "La señal es intermitente y el torno no gira en condiciones seguras.",
    note: "Modo posible y observado en C1. El resaltado localiza el sensor y su resguardo; no representa una alarma en tiempo real.",
  },
  {
    assetId: "cnc", id: "spindle", code: "F2", title: "Rodamiento del husillo vibra",
    component: "Rodamiento / husillo", observedIn: ["C2"],
    effect: "La vibración provoca marcas y piezas no conformes.",
    note: "Modo posible y observado en C2. El modelo señala el conjunto rodamiento/husillo de forma esquemática.",
  },
  {
    assetId: "compressor", id: "filter", code: "F1", title: "Filtro saturado",
    component: "Filtro", observedIn: [],
    effect: "Una saturación del filtro podría causar una caída de presión.",
    note: "Solo modo posible: no consta que ocurriera. P1 es una intervención preventiva sobre filtro, presión y purgador, no evidencia de esta avería.",
  },
  {
    assetId: "compressor", id: "drain", code: "F2", title: "Purgador bloqueado",
    component: "Purgador", observedIn: [],
    effect: "Un bloqueo podría acumular condensado y afectar a la calidad del aire.",
    note: "Solo modo posible: no consta que ocurriera. No se atribuye pérdida de función al compresor ni parada al torno por P1.",
  },
];

export const requests = [
  {
    id: "C1", assetId: "cnc", kind: "corrective", title: "Sensor de resguardo",
    modeId: "sensor", scheduledAt: "2026-10-13T09:20", plannedMinutes: 45, status: "Reparado",
    milestones: {
      loss: "2026-10-13T09:00", opened: "2026-10-13T09:08",
      technicalStart: "2026-10-13T09:20", technicalEnd: "2026-10-13T10:20",
      recovery: "2026-10-13T10:30", closed: "2026-10-13T11:00",
    },
  },
  {
    id: "C2", assetId: "cnc", kind: "corrective", title: "Rodamiento del husillo",
    modeId: "spindle", scheduledAt: "2026-10-15T13:35", plannedMinutes: 60, status: "Reparado",
    milestones: {
      loss: "2026-10-15T13:10", opened: "2026-10-15T13:18",
      technicalStart: "2026-10-15T13:35", technicalEnd: "2026-10-15T14:50",
      recovery: "2026-10-15T15:05", closed: "2026-10-15T15:30",
    },
  },
  {
    id: "P1", assetId: "compressor", kind: "preventive", title: "Filtro, presión y purgador",
    modeId: null, scheduledAt: "2026-10-16T16:15", plannedMinutes: 45, status: "Reparado",
    milestones: {
      loss: null, opened: "2026-10-12T11:00",
      technicalStart: "2026-10-16T16:15", technicalEnd: "2026-10-16T17:00",
      recovery: "2026-10-16T17:00", closed: "2026-10-16T17:20",
    },
  },
];

// Cada fila conserva sus horas y tarifa: no se aplica una tarifa media por solicitud.
export const labor = [
  { requestId: "C1", person: "Luis Mora", specialty: "Electricidad", hours: 0.75, rate: 32 },
  { requestId: "C1", person: "Lucía Rey", specialty: "Instrumentación", hours: 0.50, rate: 36 },
  { requestId: "C2", person: "Ana Ruiz", specialty: "Mecánica", hours: 1.25, rate: 30 },
  { requestId: "C2", person: "Luis Mora", specialty: "Electricidad", hours: 0.50, rate: 32 },
  { requestId: "P1", person: "Ana Ruiz", specialty: "Mecánica", hours: 0.75, rate: 30 },
  { requestId: "P1", person: "Lucía Rey", specialty: "Instrumentación", hours: 0.25, rate: 36 },
];

export const materials = [
  { requestId: "C1", item: "Sensor", quantity: 1, unitPrice: 45 },
  { requestId: "C1", item: "Cable", quantity: 1, unitPrice: 8 },
  { requestId: "C2", item: "Rodamiento", quantity: 1, unitPrice: 90 },
  { requestId: "C2", item: "Juntas", quantity: 2, unitPrice: 12 },
  { requestId: "P1", item: "Filtro", quantity: 1, unitPrice: 18 },
];

export const sum = (values) => values.reduce((total, value) => total + value, 0);
const timestamp = (value) => Date.parse(`${value}Z`);
export const minutesBetween = (start, end) => (timestamp(end) - timestamp(start)) / 60000;
export const requiredMinutes = sum(period.days.map((day) => minutesBetween(`${day}T${period.start}`, `${day}T${period.end}`)));

export function calculateRequest(request) {
  const people = labor.filter((row) => row.requestId === request.id);
  const items = materials.filter((row) => row.requestId === request.id);
  const technicalMinutes = minutesBetween(request.milestones.technicalStart, request.milestones.technicalEnd);
  const downtimeMinutes = request.milestones.loss ? minutesBetween(request.milestones.loss, request.milestones.recovery) : 0;
  const personHours = sum(people.map((row) => row.hours));
  const laborCost = sum(people.map((row) => row.hours * row.rate));
  const materialCost = sum(items.map((row) => row.quantity * row.unitPrice));
  return { ...request, people, items, technicalMinutes, downtimeMinutes, personHours, laborCost, materialCost, directCost: laborCost + materialCost };
}

export function calculateCase() {
  // El robot de demostración queda fuera incluso si se añadieran solicitudes ficticias.
  const includedIds = assets.filter((asset) => !asset.demo).map((asset) => asset.id);
  const rows = requests.filter((request) => includedIds.includes(request.assetId)).map(calculateRequest);
  const corrective = rows.filter((row) => row.assetId === "cnc" && row.kind === "corrective");
  // Intersección de pérdidas/recuperaciones del torno con cada jornada requerida.
  const downtime = sum(corrective.map((row) => sum(period.days.map((day) => {
    const start = Math.max(timestamp(row.milestones.loss), timestamp(`${day}T${period.start}`));
    const end = Math.min(timestamp(row.milestones.recovery), timestamp(`${day}T${period.end}`));
    return Math.max(0, (end - start) / 60000);
  }))));
  return {
    rows, corrective, requiredMinutes, downtime,
    meanCorrective: sum(corrective.map((row) => row.technicalMinutes)) / corrective.length,
    plannedMinutes: sum(rows.map((row) => row.plannedMinutes)),
    personHours: sum(rows.map((row) => row.personHours)),
    laborCost: sum(rows.map((row) => row.laborCost)),
    materialCost: sum(rows.map((row) => row.materialCost)),
    directCost: sum(rows.map((row) => row.directCost)),
    availability: (requiredMinutes - downtime) / requiredMinutes * 100,
    counts: assets.filter((asset) => !asset.demo).map((asset) => ({
      assetId: asset.id,
      corrective: rows.filter((row) => row.assetId === asset.id && row.kind === "corrective").length,
      preventive: rows.filter((row) => row.assetId === asset.id && row.kind === "preventive").length,
    })),
  };
}
