import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Permite probar el módulo del navegador sin package.json ni proceso de build.
const source = await readFile(new URL("./case-data.js", import.meta.url), "utf8");
const data = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const result = data.calculateCase();

test("duraciones técnicas, paradas y planificación desde los seis hitos", () => {
  assert.deepEqual(result.rows.map((row) => row.technicalMinutes), [60, 75, 45]);
  assert.deepEqual(result.rows.map((row) => row.downtimeMinutes), [90, 115, 0]);
  assert.equal(result.meanCorrective, 67.5);
  assert.equal(result.downtime, 205);
  assert.equal(result.plannedMinutes, 150);
  for (const row of result.rows) {
    assert.equal(Object.keys(row.milestones).length, 6);
    assert.equal(row.status, "Reparado");
    assert.equal(row.scheduledAt, row.milestones.technicalStart);
  }
});

test("esfuerzo y costes respetan cada fila de horas, tarifa y material", () => {
  assert.deepEqual(result.rows.map((row) => row.personHours), [1.25, 1.75, 1]);
  assert.deepEqual(result.rows.map((row) => row.laborCost), [42, 53.5, 31.5]);
  assert.deepEqual(result.rows.map((row) => row.materialCost), [53, 114, 18]);
  assert.deepEqual(result.rows.map((row) => row.directCost), [95, 167.5, 49.5]);
  assert.equal(result.personHours, 4);
  assert.equal(result.laborCost, 127);
  assert.equal(result.materialCost, 185);
  assert.equal(result.directCost, 312);
});

test("disponibilidad solo del torno, cinco jornadas y sin sumar cierre administrativo", () => {
  assert.equal(result.requiredMinutes, 2400);
  assert.equal(Number(result.availability.toFixed(2)), 91.46);
  assert.equal(data.assets.find((asset) => asset.id === "compressor").requiredSchedule, false);
  assert.equal(data.minutesBetween(result.rows[0].milestones.recovery, result.rows[0].milestones.closed), 30);
  assert.equal(data.minutesBetween(result.rows[1].milestones.recovery, result.rows[1].milestones.closed), 25);
});

test("P1 conserva aceptación aclarada en PDF, sin pérdida ni modo observado", () => {
  const p1 = result.rows.find((row) => row.id === "P1");
  assert.equal(p1.milestones.loss, null);
  assert.equal(p1.milestones.recovery, "2026-10-16T17:00");
  assert.equal(p1.milestones.closed, "2026-10-16T17:20");
  assert.equal(p1.kind, "preventive");
  assert.equal(p1.modeId, null);
  assert.equal(p1.downtimeMinutes, 0);
});

test("cuatro modos posibles, solo los del torno observados en C1/C2", () => {
  assert.equal(data.modes.length, 4);
  assert.deepEqual(data.modes.map((mode) => mode.observedIn), [["C1"], ["C2"], [], []]);
  for (const request of result.corrective) {
    const mode = data.modes.find((item) => item.assetId === request.assetId && item.id === request.modeId);
    assert.ok(mode.observedIn.includes(request.id));
  }
});

test("conteos por activo y exclusión explícita de la tercera máquina demo", () => {
  assert.deepEqual(result.counts, [
    { assetId: "cnc", corrective: 2, preventive: 0 },
    { assetId: "compressor", corrective: 0, preventive: 1 },
  ]);
  assert.equal(data.assets.filter((asset) => asset.demo).length, 1);
  assert.ok(result.rows.every((row) => row.assetId !== "robot"));
  // La exclusión no depende únicamente de que ahora no haya filas ficticias.
  data.requests.push({ ...data.requests[0], id: "DEMO-TEST", assetId: "robot" });
  try {
    const withDemo = data.calculateCase();
    assert.equal(withDemo.directCost, result.directCost);
    assert.equal(withDemo.downtime, result.downtime);
    assert.equal(withDemo.rows.length, result.rows.length);
  } finally {
    data.requests.pop();
  }
});
