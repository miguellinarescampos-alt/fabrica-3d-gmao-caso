import { assets, modes, period, calculateCase, minutesBetween, sum } from "./case-data.js";

const positions = [[-6, 0, -0.8], [0, 0, 1], [6, 0, -0.8]];
const icons = [
  '<path d="M4 26V8h24v18ZM8 12h16v10H8ZM12 14v6m0-3h9M9 26v3m14-3v3"/>',
  '<rect x="4" y="13" width="24" height="12" rx="6"/><path d="M8 25v4m16-4v4M10 13V7h12v6m-6-6V3m10 15h4"/>',
  '<path d="M8 28h16M11 28v-6h10v6M16 22v-6l7-6-5-6M23 10l4 4"/><circle cx="16" cy="16" r="3"/>',
];
const machines = assets.map((asset, index) => ({
  ...asset, number: String(index + 1).padStart(2, "0"),
  short: `${asset.reference} · ${asset.demo ? "Robot demo" : asset.name}`,
  position: positions[index], icon: icons[index],
  description: asset.demo ? "Sin datos en este caso. Solo demostración visual: excluido de solicitudes, tiempos, costes y disponibilidad."
    : `${asset.location}. ${asset.requiredSchedule ? `Requerido de ${period.start} a ${period.end}, ${period.label}.` : "Horario requerido no definido; no se calcula su disponibilidad."}`,
  faults: modes.filter((mode) => mode.assetId === asset.id),
}));

const byId = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
const money = (value) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
const dateTime = (value) => new Intl.DateTimeFormat("es-ES", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
}).format(new Date(`${value}Z`));
const clock = (value) => value.slice(11);
const kindName = (kind) => kind === "corrective" ? "Correctivo" : "Preventivo";
const evidence = (fault) => fault.observedIn.length ? `Posible · observado en ${fault.observedIn.join(", ")}` : "Solo posible · no observado";
const summary = calculateCase();
let selectedMachineId = "cnc";
let selectedFaultId = null;
let selectedCaseId = "C1";
let sceneApi = null;

function selectedMachine() {
  return machines.find((machine) => machine.id === selectedMachineId);
}

function renderPanel() {
  const machine = selectedMachine();
  byId("machine-list").innerHTML = machines.map((item) => `
    <button class="machine-card" type="button" data-machine="${item.id}" aria-pressed="${item.id === selectedMachineId}">
      <span class="machine-card-icon" aria-hidden="true"><svg viewBox="0 0 32 32">${item.icon}</svg></span>
      <span class="machine-card-copy"><strong>${item.short}</strong><small>${item.demo ? "Sin datos en este caso · fuera de KPI" : item.location}</small></span>
      <span class="machine-card-indicator" aria-hidden="true"></span>
    </button>`).join("");
  renderFaults(machine);
  byId("machine-description").textContent = machine.description;
  renderDetail(machine);
}

function renderFaults(machine) {
  byId("fault-list").innerHTML = machine.faults.length ? machine.faults.map((fault) => `
    <button class="fault-card" type="button" data-fault="${fault.id}" aria-pressed="${fault.id === selectedFaultId}">
      <span class="fault-symbol" aria-hidden="true">${fault.code}</span>
      <span class="fault-card-copy"><strong>${fault.title}</strong><small class="${fault.observedIn.length ? "observed-text" : ""}">${evidence(fault)}</small></span>
      <span class="fault-arrow" aria-hidden="true">›</span>
    </button>`).join("") : '<p class="empty-demo">Sin modos documentados. Demostración visual, sin datos en este caso.</p>';
}

function renderDetail(machine) {
  const fault = machine.faults.find((item) => item.id === selectedFaultId);
  byId("detail-empty").hidden = Boolean(fault);
  byId("fault-detail").hidden = !fault;
  byId("selection-status").textContent = fault ? `${machine.reference} · ${fault.component}` : machine.name;
  byId("detail-empty").querySelector("p").textContent = machine.demo
    ? "Este robot no tiene datos en el caso y no interviene en los indicadores."
    : "Elige un modo para localizar la pieza. La etiqueta distingue posibilidad de ocurrencia documentada.";
  if (fault) {
    byId("component-name").textContent = fault.component;
    byId("fault-explanation").textContent = fault.effect;
    byId("fault-review").textContent = fault.note;
    byId("fault-evidence").textContent = evidence(fault);
    byId("fault-evidence").className = `evidence-badge ${fault.observedIn.length ? "observed" : "possible"}`;
    byId("callout-name").textContent = fault.component;
    byId("open-case").hidden = !fault.observedIn.length;
    byId("open-case").dataset.case = fault.observedIn[0] || "";
  }
}

function selectMachine(id) {
  if (id === selectedMachineId) return;
  selectedMachineId = id;
  selectedFaultId = null;
  // Update in place: keyboard focus stays on the machine button.
  document.querySelectorAll(".machine-card").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.machine === id));
  });
  const machine = selectedMachine();
  byId("machine-description").textContent = machine.description;
  renderFaults(machine);
  renderDetail(machine);
  sceneApi?.updateSelection();
  byId("announcement").textContent = `${machine.reference}, ${machine.name}. ${machine.demo ? "Sin datos en este caso." : "Elige un modo de fallo."}`;
}

function selectFault(id) {
  selectedFaultId = id;
  document.querySelectorAll(".fault-card").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.fault === id));
  });
  const machine = selectedMachine();
  renderDetail(machine);
  sceneApi?.updateSelection();
  const fault = machine.faults.find((item) => item.id === id);
  byId("announcement").textContent = fault ? `${fault.title}. ${evidence(fault)}. Componente resaltado: ${fault.component}.` : "Resaltado eliminado.";
}

const milestoneNames = [
  ["loss", "Pérdida de función"], ["opened", "Apertura administrativa"],
  ["technicalStart", "Inicio técnico"], ["technicalEnd", "Fin técnico"],
  ["recovery", "Recuperación / aceptación"], ["closed", "Cierre administrativo"],
];

function renderRequest() {
  const row = summary.rows.find((request) => request.id === selectedCaseId);
  const asset = assets.find((item) => item.id === row.assetId);
  const m = row.milestones;
  const adminLag = minutesBetween(m.recovery, m.closed);
  byId("case-select").value = row.id;
  byId("request-content").innerHTML = `
    <article class="request-overview surface">
      <div><div class="request-badges"><span class="case-id">${row.id}</span><span class="scope-badge">${kindName(row.kind)}</span><span class="repaired-badge">${row.status}</span></div>
      <h3>${asset.reference} · ${row.title}</h3><p>${asset.location}</p>
      <p class="small-note">Inicio previsto / solicitud: ${dateTime(row.scheduledAt)} · Duración prevista: <strong>${number(row.plannedMinutes)} min</strong></p></div>
      <button type="button" class="action-button" data-show-asset="${row.assetId}" data-show-mode="${row.modeId || ""}">Localizar en la planta ↗</button>
    </article>
    <div class="notice ${row.kind === "preventive" ? "notice-amber" : ""}">${row.kind === "corrective"
      ? `<strong>Observado en ${row.id}.</strong> El modo ${modes.find((mode) => mode.assetId === row.assetId && mode.id === row.modeId).code} del torno está documentado. La parada termina en la recuperación, no en el cierre.`
      : "<strong>Preventivo, sin pérdida de función.</strong> P1 revisa filtro, presión y purgador de C-02. No acredita que ocurrieran sus modos F1/F2 y no genera parada del compresor ni del torno."}</div>
    <article class="surface milestones-surface"><div class="surface-title"><h3>Los seis hitos</h3><span class="small-note">Fechas de planta · octubre 2026</span></div>
      <ol class="milestone-list">${milestoneNames.map(([key, label], index) => `<li class="${key === "recovery" ? "recovery" : ""} ${!m[key] ? "no-loss" : ""}"><span class="milestone-index">${String(index + 1).padStart(2, "0")}</span><strong>${label}</strong>${m[key] ? `<time datetime="${m[key]}">${dateTime(m[key])}</time>` : "<span>Sin pérdida de función</span>"}${row.id === "P1" && key === "recovery" ? "<small>Aclarado en PDF; celda Excel vacía con nota.</small>" : ""}</li>`).join("")}</ol>
      <div class="time-equations">
        <p><strong>Tiempo técnico:</strong> ${clock(m.technicalEnd)} − ${clock(m.technicalStart)} = <b>${number(row.technicalMinutes)} min</b>.</p>
        <p><strong>Parada funcional:</strong> ${m.loss ? `${clock(m.recovery)} − ${clock(m.loss)} = <b>${number(row.downtimeMinutes)} min</b>. Espera previa ${number(minutesBetween(m.loss, m.technicalStart))} + intervención ${number(row.technicalMinutes)} + aceptación ${number(minutesBetween(m.technicalEnd, m.recovery))} min.` : "<b>No procede</b>: sin pérdida de función; contribución a parada del caso = 0 min."}</p>
        <p><strong>Cierre ≠ recuperación:</strong> ${clock(m.closed)} − ${clock(m.recovery)} = ${number(adminLag)} min administrativos posteriores, <b>no añadidos a la parada</b>.</p>
      </div>
    </article>
    <div class="resource-grid">
      <article class="surface"><h3>Personas y mano de obra</h3><div class="table-scroll"><table><caption>${row.id} · Horas y tarifa de cada persona</caption><thead><tr><th>Persona / especialidad</th><th>Horas × €/h</th><th>Importe</th></tr></thead><tbody>${row.people.map((person) => `<tr><td><strong>${person.person}</strong><small>${person.specialty}</small></td><td>${number(person.hours)} × ${number(person.rate)}</td><td>${money(person.hours * person.rate)}</td></tr>`).join("")}</tbody><tfoot><tr><th>Total MO</th><td>${row.people.map((person) => number(person.hours)).join(" + ")} = ${number(row.personHours)} h-persona</td><td>${money(row.laborCost)}</td></tr></tfoot></table></div><p class="small-note">Las horas-persona se suman por fila. No equivalen al tiempo técnico transcurrido (${number(row.technicalMinutes)} min); pueden participar varias personas.</p></article>
      <article class="surface"><h3>Materiales consumidos</h3><div class="table-scroll"><table><caption>${row.id} · Cantidad y precio unitario</caption><thead><tr><th>Material</th><th>Cantidad × €/ud.</th><th>Importe</th></tr></thead><tbody>${row.items.map((item) => `<tr><td>${item.item}</td><td>${number(item.quantity)} × ${number(item.unitPrice)}</td><td>${money(item.quantity * item.unitPrice)}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="2">Total materiales</th><td>${money(row.materialCost)}</td></tr></tfoot></table></div><p class="direct-total">Coste directo: ${money(row.laborCost)} + ${money(row.materialCost)} = <strong>${money(row.directCost)}</strong></p></article>
    </div>`;
}

function renderMetrics() {
  const s = summary;
  byId("intro-summary").innerHTML = `<strong>${s.rows.length}<small>intervenciones</small></strong><strong>${s.counts.length}<small>activos del caso</small></strong><strong>${number(s.plannedMinutes)}<small>min previstos</small></strong>`;
  byId("metrics-content").innerHTML = `
    <div class="kpi-grid">
      <article class="kpi"><span>Media técnica correctiva · TC-01</span><strong data-kpi="mean">${number(s.meanCorrective)} <small>min</small></strong><p>(${s.corrective.map((row) => number(row.technicalMinutes)).join(" + ")}) / ${s.corrective.length} intervenciones</p></article>
      <article class="kpi"><span>Parada funcional · TC-01</span><strong data-kpi="downtime">${number(s.downtime)} <small>min</small></strong><p>${s.corrective.map((row) => number(row.downtimeMinutes)).join(" + ")} · pérdida → recuperación</p></article>
      <article class="kpi"><span>Coste directo · caso completo</span><strong data-kpi="cost">${money(s.directCost)}</strong><p>${money(s.laborCost)} MO + ${money(s.materialCost)} materiales</p></article>
      <article class="kpi kpi-accent"><span>Disponibilidad · solo TC-01</span><strong data-kpi="availability">${number(s.availability)} <small>%</small></strong><p>(${number(s.requiredMinutes)} − ${number(s.downtime)}) / ${number(s.requiredMinutes)} × 100</p></article>
    </div>
    <div class="notice"><strong>Supuesto explícito:</strong> ninguna otra parada del TC-01 en el periodo. Horario requerido ${period.start}–${period.end}, ${period.label}: ${period.days.length} días × ${number(minutesBetween(`2026-10-12T${period.start}`, `2026-10-12T${period.end}`) / 60)} h × 60 = <strong>${number(s.requiredMinutes)} min (${number(s.requiredMinutes / 60)} h)</strong>. Se intersectan las paradas con ese horario. C-02 tiene horario requerido <strong>no definido</strong>: su disponibilidad no se calcula. No se extrapola una disponibilidad global de planta.</div>
    <article class="surface"><h3>Resumen derivado por intervención</h3><div class="table-scroll"><table class="summary-table"><caption>Tiempo transcurrido, esfuerzo de personas y costes son magnitudes distintas</caption><thead><tr><th>Caso / activo</th><th>Prevista (min)</th><th>Técnica (min)</th><th>Parada (min)</th><th>h-persona</th><th>MO</th><th>Materiales</th><th>Directo</th></tr></thead><tbody>${s.rows.map((row) => `<tr><th>${row.id} · ${assets.find((asset) => asset.id === row.assetId).reference}<small>${kindName(row.kind)}</small></th><td>${number(row.plannedMinutes)}</td><td>${number(row.technicalMinutes)}</td><td>${row.kind === "corrective" ? number(row.downtimeMinutes) : "No procede¹"}</td><td>${number(row.personHours)}</td><td>${money(row.laborCost)}</td><td>${money(row.materialCost)}</td><td><strong>${money(row.directCost)}</strong></td></tr>`).join("")}</tbody><tfoot><tr><th>Total del caso</th><td>${number(s.plannedMinutes)}</td><td>${number(sum(s.rows.map((row) => row.technicalMinutes)))}</td><td>${number(s.downtime)} (TC-01)</td><td>${number(s.personHours)}</td><td>${money(s.laborCost)}</td><td>${money(s.materialCost)}</td><td>${money(s.directCost)}</td></tr></tfoot></table></div><p class="small-note">¹ P1 no tiene pérdida de función: no se le asigna parada; aporta 0 min al total. La duración prevista es planificación, no duración real ni parada.</p></article>
    <div class="audit-grid">
      <article class="surface"><h3>Fórmulas y derivación</h3><dl class="formula-list"><dt>Tiempo técnico por caso</dt><dd>Fin técnico − inicio técnico. Media correctiva = suma de tiempos técnicos de C1/C2 / número de correctivas; P1 queda fuera.</dd><dt>Parada funcional</dt><dd>Recuperación − pérdida de función, dentro de horario requerido. No se usa cierre − apertura administrativa.</dd><dt>Mano de obra y materiales</dt><dd>MO = Σ(horas de cada persona × su tarifa). Materiales = Σ(cantidad × precio unitario). Directo = MO + materiales.</dd><dt>Comprobación de sumas</dt><dd>MO: ${s.rows.map((row) => money(row.laborCost)).join(" + ")} = ${money(s.laborCost)}.<br>Materiales: ${s.rows.map((row) => money(row.materialCost)).join(" + ")} = ${money(s.materialCost)}.<br>Directo: ${s.rows.map((row) => money(row.directCost)).join(" + ")} = ${money(s.directCost)}.</dd></dl></article>
      <article class="surface"><h3>Conteo y cobertura de activos</h3><div class="table-scroll"><table><caption>Solo solicitudes documentadas del caso</caption><thead><tr><th>Activo</th><th>Correctivas</th><th>Preventivas</th></tr></thead><tbody>${s.counts.map((count) => `<tr><th>${assets.find((asset) => asset.id === count.assetId).reference}</th><td>${count.corrective}</td><td>${count.preventive}</td></tr>`).join("")}</tbody></table></div><p><strong>Planificación:</strong> ${s.rows.map((row) => number(row.plannedMinutes)).join(" + ")} = ${number(s.plannedMinutes)} min previstos.</p><p class="small-note">El robot DEMO-03 está marcado «sin datos en este caso». No forma parte de los conteos, costes, tiempos ni denominadores.</p></article>
    </div>`;
}

function selectCase(id) {
  selectedCaseId = id;
  renderRequest();
}

byId("machine-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-machine]");
  if (button) selectMachine(button.dataset.machine);
});
byId("fault-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-fault]");
  if (button) selectFault(button.dataset.fault);
});
byId("clear-fault").addEventListener("click", () => {
  const previousFault = selectedFaultId;
  selectFault(null);
  byId("fault-list").querySelector(`[data-fault="${previousFault}"]`)?.focus();
});
byId("retry-button").addEventListener("click", () => window.location.reload());
byId("reset-camera").addEventListener("click", () => sceneApi?.resetCamera());
byId("case-select").addEventListener("change", (event) => selectCase(event.target.value));
byId("open-case").addEventListener("click", (event) => {
  selectCase(event.currentTarget.dataset.case);
  byId("solicitudes").scrollIntoView({ behavior: "instant", block: "start" });
  byId("case-select").focus({ preventScroll: true });
});
byId("request-content").addEventListener("click", (event) => {
  const button = event.target.closest("[data-show-asset]");
  if (!button) return;
  selectMachine(button.dataset.showAsset);
  selectFault(button.dataset.showMode || null);
  byId("planta").scrollIntoView({ behavior: "instant", block: "start" });
  byId("machine-list").querySelector(`[data-machine="${selectedMachineId}"]`).focus({ preventScroll: true });
});
renderPanel();
renderRequest();
renderMetrics();

function showError(error) {
  console.error("No se pudo iniciar la fábrica 3D:", error);
  byId("loading-state").hidden = true;
  byId("scene-error").hidden = false;
  byId("scene-container").setAttribute("aria-busy", "false");
  byId("scene-error-message").textContent = "Comprueba tu conexión a Internet (Three.js se carga desde un CDN), abre la página con un servidor HTTP y utiliza un navegador actualizado con WebGL 2 y aceleración gráfica habilitados.";
}

async function start() {
  try {
    const [THREE, { OrbitControls }] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
    ]);
    sceneApi = createFactory(THREE, OrbitControls);
    byId("loading-state").hidden = true;
    byId("scene-container").setAttribute("aria-busy", "false");
    byId("reset-camera").disabled = false;
  } catch (error) {
    showError(error);
  }
}

function createFactory(THREE, OrbitControls) {
  const canvas = byId("factory-canvas");
  const container = byId("scene-container");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101e29");
  scene.fog = new THREE.Fog("#101e29", 29, 65);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 110);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 7;
  controls.maxDistance = 43;
  controls.maxPolarAngle = Math.PI / 2.08;
  controls.minPolarAngle = 0.16;
  controls.target.set(0, 1, 0);
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.listenToKeyEvents(canvas);
  controls.keyPanSpeed = 12;

  scene.add(new THREE.HemisphereLight(0xc7e7ff, 0x35423b, 2.7));
  const sun = new THREE.DirectionalLight(0xffeed5, 4);
  sun.position.set(-8, 16, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.far = 55;
  sun.shadow.normalBias = 0.045;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x72c9df, 2.2);
  rim.position.set(5, 7, -10);
  scene.add(rim);

  const mat = (color, metalness = 0.15, roughness = 0.65) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const materials = {
    floor: mat("#24343f", 0.1, 0.9),
    platform: mat("#344955", 0.3),
    slate: mat("#516b78", 0.4),
    dark: mat("#1d2d36", 0.5),
    body: mat("#b5c9c9", 0.35),
    light: mat("#d8e1d7", 0.25),
    mint: mat("#6cbda9", 0.35),
    orange: mat("#e6a057", 0.3),
    yellow: mat("#c2a766", 0.2),
    metal: mat("#879eaa", 0.75, 0.35),
    rubber: mat("#26373c", 0.05, 0.92),
    box: mat("#bb9872", 0, 0.95),
    tape: mat("#e6c58f", 0, 0.9),
    screen: new THREE.MeshStandardMaterial({ color: "#79dfb9", emissive: "#4fae96", emissiveIntensity: 0.9, roughness: 0.4 }),
    red: new THREE.MeshStandardMaterial({ color: "#d66a50", emissive: "#722d1f", emissiveIntensity: 0.3 }),
    guard: new THREE.MeshStandardMaterial({ color: "#82b7c0", transparent: true, opacity: 0.26, roughness: 0.25, metalness: 0.1 }),
  };
  const highlight = new THREE.MeshStandardMaterial({ color: "#ffc476", emissive: "#dc731e", emissiveIntensity: 0.55, metalness: 0.25, roughness: 0.35 });

  function mesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.baseMaterial = material;
    parent.add(object);
    return object;
  }
  function box(parent, size, material, position, rotation) {
    return mesh(parent, new THREE.BoxGeometry(...size), material, position, rotation);
  }
  function cylinder(parent, radius, length, material, position, rotation = [0, 0, 0], bottomRadius = radius) {
    return mesh(parent, new THREE.CylinderGeometry(radius, bottomRadius, length, 24), material, position, rotation);
  }
  function beam(parent, from, to, radius, material) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const object = cylinder(parent, radius, direction.length(), material, start.clone().add(end).multiplyScalar(0.5).toArray());
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return object;
  }
  function pipe(parent, points, radius, material) {
    const path = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return mesh(parent, new THREE.TubeGeometry(path, 32, radius, 8, false), material);
  }

  // Everything in the scene is procedural geometry; no textures or models are downloaded.
  const factory = new THREE.Group();
  scene.add(factory);
  box(factory, [27, 0.28, 19], materials.floor, [0, -0.2, 0]);
  const grid = new THREE.GridHelper(26, 26, 0x48606b, 0x30434f);
  grid.position.y = -0.045;
  scene.add(grid);

  // A low, open industrial backdrop keeps the entire factory visible from orbit.
  box(factory, [25, 0.42, 0.65], materials.slate, [0, 5.5, -6.9]);
  for (const x of [-11.7, -3.9, 3.9, 11.7]) {
    box(factory, [0.32, 5.5, 0.36], materials.slate, [x, 2.65, -6.9]);
    box(factory, [0.65, 0.2, 0.7], materials.dark, [x, 0.05, -6.9]);
    box(factory, [1.5, 0.12, 0.7], materials.dark, [x, 5.15, -6.9]);
    box(factory, [1.2, 0.04, 0.48], materials.screen, [x, 5.07, -6.9]);
  }
  beam(factory, [-11.7, 0.3, -6.9], [-3.9, 5.2, -6.9], 0.045, materials.slate);
  beam(factory, [3.9, 5.2, -6.9], [11.7, 0.3, -6.9], 0.045, materials.slate);
  beam(factory, [-12, 4.6, -6.5], [12, 4.6, -6.5], 0.09, materials.mint);
  beam(factory, [-12, 4.15, -6.5], [12, 4.15, -6.5], 0.065, materials.metal);
  for (let x = -11; x <= 11; x += 1.2) {
    box(factory, [0.65, 0.015, 0.08], materials.yellow, [x, -0.035, 5.6]);
  }
  box(factory, [24, 0.015, 0.06], materials.yellow, [0, -0.035, 6.2]);
  box(factory, [24, 0.015, 0.06], materials.yellow, [0, -0.035, 4.9]);
  // Pallet and crates add context without competing with the three selectable machines.
  for (let index = 0; index < 3; index++) {
    box(factory, [0.3, 0.12, 1.8], materials.box, [-9.7 + index * 0.65, 0.05, 3.8]);
  }
  for (let index = 0; index < 5; index++) {
    box(factory, [1.8, 0.1, 0.25], materials.box, [-9.05, 0.16, 3.1 + index * 0.35]);
  }
  box(factory, [1.3, 0.9, 1.15], materials.box, [-9.1, 0.65, 3.75]);
  box(factory, [0.16, 0.92, 1.17], materials.tape, [-9.1, 0.65, 3.75]);
  box(factory, [1.8, 1.2, 0.9], materials.slate, [10.6, 0.55, -4.8]);
  for (const x of [10.25, 10.95]) {
    box(factory, [0.5, 0.85, 0.025], materials.dark, [x, 0.7, -4.34]);
    box(factory, [0.035, 0.2, 0.04], materials.metal, [x + 0.15, 0.8, -4.3]);
  }

  const machineObjects = new Map();
  function setupMachine(machine) {
    const root = new THREE.Group();
    root.position.set(...machine.position);
    root.userData.machineId = machine.id;
    scene.add(root);
    box(root, [5.15, 0.2, 4.8], materials.platform, [0, 0.04, 0]);
    for (const x of [-2.35, 2.35]) {
      box(root, [0.05, 0.018, 4.35], materials.slate, [x, 0.15, 0]);
    }
    const outlinePoints = [
      [-2.55, 0.17, -2.37], [2.55, 0.17, -2.37], [2.55, 0.17, 2.37],
      [-2.55, 0.17, 2.37], [-2.55, 0.17, -2.37],
    ].map((point) => new THREE.Vector3(...point));
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePoints), new THREE.LineBasicMaterial({ color: "#79e2c0" }));
    root.add(outline);
    const components = new Map();
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "machine-marker";
    marker.innerHTML = `<span>${machine.number}</span>${machine.short}`;
    marker.setAttribute("aria-label", `Seleccionar ${machine.name}`);
    marker.addEventListener("click", () => selectMachine(machine.id));
    byId("machine-markers").append(marker);
    const entry = { root, outline, components, marker, markerPosition: new THREE.Vector3(machine.position[0], 0.3, machine.position[2] + 2.7) };
    machineObjects.set(machine.id, entry);
    return entry;
  }
  function component(entry, id, builder) {
    const group = new THREE.Group();
    group.userData.componentId = id;
    entry.root.add(group);
    builder(group);
    entry.components.set(id, group);
    return group;
  }

  const cnc = setupMachine(machines[0]);
  // Torno de eje horizontal: bancada, cabezal, contrapunto y resguardo esquemáticos.
  box(cnc.root, [3.7, 0.85, 2.65], materials.dark, [0, 0.7, 0]);
  box(cnc.root, [3.7, 2.4, 0.35], materials.body, [0, 2.2, -1.12]);
  box(cnc.root, [0.8, 2.4, 2.25], materials.body, [-1.48, 2.2, -0.1]);
  box(cnc.root, [0.4, 2.4, 2.25], materials.body, [1.67, 2.2, -0.1]);
  box(cnc.root, [3.7, 0.24, 2.65], materials.mint, [0, 3.5, 0]);
  for (const z of [-0.5, 0.32]) {
    box(cnc.root, [2.65, 0.14, 0.13], materials.metal, [0.2, 1.35, z]);
  }
  box(cnc.root, [0.58, 0.65, 0.85], materials.slate, [1.05, 1.72, -0.15]);
  cylinder(cnc.root, 0.12, 0.55, materials.metal, [0.72, 2, -0.15], [0, 0, Math.PI / 2]);
  box(cnc.root, [0.6, 0.35, 0.6], materials.orange, [0.15, 1.65, 0.35]);
  box(cnc.root, [0.82, 1.4, 0.12], materials.slate, [2.03, 2.38, 0.55], [-0.15, -0.2, 0]);
  box(cnc.root, [0.59, 0.6, 0.055], materials.screen, [2.03, 2.6, 0.68], [-0.15, -0.2, 0]);
  for (const x of [1.85, 2.04, 2.23]) {
    cylinder(cnc.root, 0.055, 0.04, materials.dark, [x, 2.1, 0.7], [Math.PI / 2, 0, 0]);
  }
  cylinder(cnc.root, 0.1, 0.07, materials.red, [2.18, 1.94, 0.72], [Math.PI / 2, 0, 0]);
  component(cnc, "spindle", (group) => {
    cylinder(group, 0.48, 0.48, materials.slate, [-0.93, 2, -0.15], [0, 0, Math.PI / 2]);
    cylinder(group, 0.39, 0.12, materials.metal, [-0.64, 2, -0.15], [0, 0, Math.PI / 2]);
    cylinder(group, 0.18, 0.85, materials.metal, [-0.16, 2, -0.15], [0, 0, Math.PI / 2]);
    for (const z of [-0.4, 0.1]) {
      box(group, [0.13, 0.18, 0.16], materials.dark, [-0.53, 2, z]);
    }
  });
  component(cnc, "sensor", (group) => {
    box(group, [1.65, 1.65, 0.045], materials.guard, [0.2, 2.32, 1.12]);
    for (const x of [-0.66, 1.06]) {
      box(group, [0.065, 1.75, 0.09], materials.metal, [x, 2.32, 1.12]);
    }
    box(group, [1.78, 0.08, 0.1], materials.metal, [0.2, 3.17, 1.12]);
    box(group, [0.22, 0.38, 0.2], materials.orange, [1.04, 2.76, 1.26]);
    cylinder(group, 0.055, 0.05, materials.screen, [1.04, 2.85, 1.38], [Math.PI / 2, 0, 0]);
    box(group, [0.075, 0.5, 0.09], materials.dark, [0.79, 2.25, 1.22]);
  });
  cylinder(cnc.root, 0.055, 0.4, materials.metal, [1.3, 3.84, 0.7]);
  cylinder(cnc.root, 0.11, 0.16, materials.screen, [1.3, 4.12, 0.7]);

  const compressor = setupMachine(machines[1]);
  for (const x of [-1.15, 1.15]) {
    box(compressor.root, [0.24, 0.55, 1.35], materials.dark, [x, 0.5, 0]);
    box(compressor.root, [0.65, 0.1, 1.55], materials.slate, [x, 0.24, 0]);
  }
  cylinder(compressor.root, 0.82, 3.2, materials.mint, [0, 1.25, 0], [0, 0, Math.PI / 2]);
  for (const x of [-1.6, 1.6]) {
    const cap = mesh(compressor.root, new THREE.SphereGeometry(0.82, 24, 16), materials.mint, [x, 1.25, 0]);
    cap.scale.x = 0.3;
  }
  box(compressor.root, [2.2, 0.15, 0.95], materials.metal, [-0.15, 2.08, 0]);
  cylinder(compressor.root, 0.35, 0.95, materials.slate, [-0.75, 2.48, 0], [0, 0, Math.PI / 2]);
  for (let x = -1.1; x <= -0.4; x += 0.12) {
    cylinder(compressor.root, 0.38, 0.035, materials.metal, [x, 2.48, 0], [0, 0, Math.PI / 2]);
  }
  for (const x of [0.15, 0.65]) {
    cylinder(compressor.root, 0.2, 0.65, materials.body, [x, 2.48, 0]);
    for (let y = 2.3; y <= 2.75; y += 0.12) {
      box(compressor.root, [0.5, 0.04, 0.5], materials.metal, [x, y, 0]);
    }
  }
  pipe(compressor.root, [[0.4, 2.8, 0], [1.1, 2.95, 0], [1.4, 2.15, 0]], 0.065, materials.metal);
  cylinder(compressor.root, 0.19, 0.1, materials.light, [1.3, 2.45, 0.22], [Math.PI / 2, 0, 0]);
  beam(compressor.root, [1.3, 2.45, 0.28], [1.37, 2.52, 0.28], 0.014, materials.dark);
  component(compressor, "filter", (group) => {
    cylinder(group, 0.25, 0.75, materials.orange, [1.35, 2.05, 0.7]);
    cylinder(group, 0.29, 0.12, materials.dark, [1.35, 2.46, 0.7]);
    cylinder(group, 0.18, 0.16, materials.metal, [1.35, 1.6, 0.7]);
    pipe(group, [[0.7, 2.7, 0], [1.35, 2.75, 0.7], [1.35, 2.45, 0.7]], 0.06, materials.metal);
  });
  component(compressor, "drain", (group) => {
    pipe(group, [[0.25, 0.55, 0], [0.25, 0.43, 0.8], [0.25, 0.65, 1.05]], 0.065, materials.metal);
    box(group, [0.42, 0.38, 0.32], materials.orange, [0.25, 0.73, 1.07]);
    cylinder(group, 0.09, 0.2, materials.dark, [0.25, 0.46, 1.07]);
    box(group, [0.3, 0.055, 0.1], materials.red, [0.25, 0.97, 1.07]);
  });

  const robot = setupMachine(machines[2]);
  cylinder(robot.root, 0.86, 0.25, materials.dark, [-0.5, 0.33, 0]);
  cylinder(robot.root, 0.65, 0.7, materials.slate, [-0.5, 0.78, 0]);
  cylinder(robot.root, 0.7, 0.18, materials.orange, [-0.5, 1.17, 0]);
  box(robot.root, [0.65, 1.1, 0.7], materials.orange, [-0.5, 1.72, 0]);
  component(robot, "servo", (group) => {
    cylinder(group, 0.43, 0.92, materials.dark, [-0.5, 2.25, 0], [Math.PI / 2, 0, 0]);
    cylinder(group, 0.29, 0.09, materials.metal, [-0.5, 2.25, 0.51], [Math.PI / 2, 0, 0]);
    cylinder(group, 0.12, 0.11, materials.orange, [-0.5, 2.25, 0.58], [Math.PI / 2, 0, 0]);
  });
  beam(robot.root, [-0.5, 2.25, 0], [0.25, 3.65, 0], 0.27, materials.orange);
  cylinder(robot.root, 0.35, 0.68, materials.dark, [0.25, 3.65, 0], [Math.PI / 2, 0, 0]);
  cylinder(robot.root, 0.23, 0.08, materials.metal, [0.25, 3.65, 0.38], [Math.PI / 2, 0, 0]);
  beam(robot.root, [0.25, 3.65, 0], [1.45, 3.1, 0.65], 0.2, materials.orange);
  pipe(robot.root, [[-0.8, 1.6, -0.38], [-0.95, 2.8, -0.38], [0.15, 3.95, -0.38], [1.4, 3.35, 0.4]], 0.065, materials.dark);
  component(robot, "gripper", (group) => {
    cylinder(group, 0.24, 0.36, materials.metal, [1.45, 2.96, 0.65]);
    box(group, [0.65, 0.18, 0.45], materials.dark, [1.45, 2.7, 0.65]);
    for (const x of [1.2, 1.7]) {
      box(group, [0.12, 0.48, 0.18], materials.metal, [x, 2.42, 0.65]);
      box(group, [0.2, 0.09, 0.2], materials.dark, [x + (x < 1.45 ? 0.04 : -0.04), 2.22, 0.65]);
    }
  });
  box(robot.root, [1.1, 0.13, 1.1], materials.metal, [1.35, 1.3, 0.7]);
  box(robot.root, [0.2, 1.08, 0.2], materials.slate, [1.35, 0.73, 0.7]);
  box(robot.root, [0.75, 0.6, 0.75], materials.box, [1.35, 1.67, 0.7]);
  component(robot, "controller", (group) => {
    box(group, [1, 1.7, 0.8], materials.body, [-1.7, 1.05, -1.2]);
    box(group, [0.75, 1.4, 0.04], materials.slate, [-1.7, 1.07, -0.78]);
    box(group, [0.48, 0.34, 0.04], materials.screen, [-1.7, 1.45, -0.74]);
    box(group, [0.04, 0.3, 0.05], materials.metal, [-1.43, 1.02, -0.71]);
    for (let y = 0.55; y < 0.83; y += 0.07) {
      box(group, [0.45, 0.02, 0.02], materials.dark, [-1.75, y, -0.74]);
    }
  });

  const componentBox = new THREE.Box3();
  const boxHelper = new THREE.Box3Helper(componentBox, 0xffc279);
  boxHelper.material.depthTest = false;
  boxHelper.material.transparent = true;
  boxHelper.material.opacity = 0.7;
  boxHelper.renderOrder = 10;
  boxHelper.visible = false;
  scene.add(boxHelper);
  const calloutPosition = new THREE.Vector3();
  let activeComponent = null;

  function updateSelection() {
    machineObjects.forEach((entry, id) => {
      entry.outline.visible = id === selectedMachineId;
      entry.marker.setAttribute("aria-pressed", String(id === selectedMachineId));
      entry.root.traverse((object) => {
        if (object.isMesh) object.material = object.userData.baseMaterial;
      });
    });
    const entry = machineObjects.get(selectedMachineId);
    activeComponent = selectedFaultId ? entry.components.get(selectedFaultId) : null;
    boxHelper.visible = Boolean(activeComponent);
    byId("component-callout").hidden = !activeComponent;
    if (activeComponent) {
      activeComponent.traverse((object) => {
        if (object.isMesh) object.material = highlight;
      });
      activeComponent.updateWorldMatrix(true, true);
      componentBox.setFromObject(activeComponent).expandByScalar(0.12);
      componentBox.getCenter(calloutPosition);
      calloutPosition.y = componentBox.max.y + 0.12;
    }
  }

  // Distinguish deliberate clicks from OrbitControls drags and multitouch gestures.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const activePointers = new Set();
  let clickStart = null;
  let moved = false;
  canvas.addEventListener("pointerdown", (event) => {
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) {
      moved = true;
      return;
    }
    if (event.button !== 0) return;
    clickStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    moved = false;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (clickStart && Math.hypot(event.clientX - clickStart.x, event.clientY - clickStart.y) > 6) moved = true;
  });
  canvas.addEventListener("pointerup", (event) => {
    activePointers.delete(event.pointerId);
    if (!clickStart || event.pointerId !== clickStart.id) return;
    const isClick = !moved && event.button === 0;
    clickStart = null;
    if (!isClick) return;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const roots = [...machineObjects.values()].map((entry) => entry.root);
    const hit = raycaster.intersectObjects(roots, true).find((intersection) => intersection.object.isMesh);
    if (!hit) return;
    let object = hit.object;
    let componentId = null;
    while (object && !object.userData.machineId) {
      if (object.userData.componentId) componentId = object.userData.componentId;
      object = object.parent;
    }
    if (object) {
      selectMachine(object.userData.machineId);
      if (componentId && selectedMachine().faults.some((fault) => fault.id === componentId)) selectFault(componentId);
    }
  });
  canvas.addEventListener("pointercancel", (event) => {
    activePointers.delete(event.pointerId);
    clickStart = null;
    moved = true;
  });
  canvas.addEventListener("lostpointercapture", (event) => activePointers.delete(event.pointerId));
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showError(new Error("Se perdió el contexto WebGL. Recarga la página para recuperarlo."));
  });

  let width = 1;
  let height = 1;
  function resetCamera() {
    controls.target.set(0, 1, 0);
    // Fit a bounding sphere for all three machines and backdrop, including portrait viewports.
    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
    const distance = Math.max(28, 14 / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)));
    const direction = new THREE.Vector3(0.78, 0.87, 1.22).normalize();
    controls.maxDistance = Math.max(43, distance * 1.35);
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  }
  let firstResize = true;
  function resize() {
    const oldAspect = camera.aspect;
    width = Math.max(container.clientWidth, 1);
    height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (firstResize || Math.abs(oldAspect - camera.aspect) > 0.5) resetCamera();
    firstResize = false;
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const projected = new THREE.Vector3();
  function projectLabel(position, element, callout = false) {
    projected.copy(position).project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const visible = projected.z >= -1 && projected.z <= 1 && x > 0 && x < width && y > 0 && y < height;
    element.style.visibility = visible ? "visible" : "hidden";
    const margin = callout ? Math.min(110, width / 2) : 65;
    element.style.left = `${Math.max(margin, Math.min(width - margin, x))}px`;
    element.style.top = `${Math.max(callout ? 90 : 25, Math.min(height - 115, y))}px`;
  }
  function animate() {
    if (document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
    machineObjects.forEach((entry) => projectLabel(entry.markerPosition, entry.marker));
    if (activeComponent) projectLabel(calloutPosition, byId("component-callout"), true);
  }
  updateSelection();
  // Render the first frame immediately; initialization errors reach the loading fallback.
  animate();
  renderer.setAnimationLoop(animate);
  window.addEventListener("pagehide", () => {
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
  }, { once: true });
  // A back/forward-cache restore needs a fresh WebGL lifecycle.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
  return { updateSelection, resetCamera };
}

start();
