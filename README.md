# Planta 1 · Caso GMAO 3D

Aplicación **estática, sin framework ni build**, adaptada de `fabrica-3d-demo` en una carpeta nueva. La carpeta original no se modifica. HTML, CSS y JavaScript nativos; Three.js 0.170.0 desde jsDelivr. Toda la geometría es procedural: sin modelos, texturas ni imágenes descargadas.

## Abrir por HTTP

Necesitas Internet para el CDN y un navegador moderno con import maps, **WebGL 2** y aceleración gráfica (Chrome, Edge, Firefox o Safari actualizados).

```powershell
cd C:\Users\migue\Downloads\fabrica-3d-gmao-caso
py -m http.server 8000
```

Abre <http://localhost:8000>. Si no existe `py`, usa `python -m http.server 8000` (Python 3). Detén el servidor con `Ctrl+C`. **No abras mediante `file://`**: se utilizan módulos ES.

## Recorrido

1. **Planta interactiva:** selecciona el activo en su tarjeta, etiqueta o geometría. Selecciona un modo o pulsa su pieza para resaltarla en ámbar. Las etiquetas distinguen «posible · observado» de «solo posible · no observado».
2. **Solicitudes e hitos:** el selector C1/C2/P1 muestra planificación, seis hitos, tiempos derivados y desglose de personas/materiales. «Localizar en la planta» lleva al activo; en correctivas también resalta su componente. P1 no selecciona un modo, porque no hay avería observada.
3. **Indicadores:** fórmulas, tabla de cálculo y límites del análisis.
4. **Auditoría / Odoo:** aclaraciones de fuente y comprobaciones **PENDIENTES**.

### Cámara y accesibilidad

- Arrastrar con botón izquierdo / un dedo: rotar.
- Rueda, botón central o pellizco: zoom.
- Botón derecho y arrastrar / dos dedos: desplazar. Con el lienzo enfocado, también sirven las flechas.
- «Vista general»: restaurar el encuadre de los tres equipos.
- Los controles HTML funcionan con `Tab`, `Enter` y `Espacio`; el selector admite teclado. Las secciones se adaptan a móvil y las tablas anchas tienen desplazamiento horizontal.

La escena es esquemática y no está a escala. No hay telemetría, diagnóstico automático ni control de maquinaria real. Toda revisión física requiere aislamiento y personal cualificado.

## Datos y alcance

`case-data.js` contiene los datos normalizados transcritos del PDF/Excel revisados: activos, modos, solicitudes, hitos, filas de mano de obra y materiales. No se incluyen los documentos originales ni se simula su importación.

- **TC-01 · Torno CNC:** Planta 1 > Nave A > Celda 2. Requerido 08:00–16:00, del 12 al 16 de octubre de 2026: 5 × 8 h = 40 h = 2400 min.
- **C-02 · Compresor:** Planta 1 > Sala de servicios. Horario requerido **no definido**; no se calcula disponibilidad.
- **DEMO-03 · Robot:** demostración visual, **sin datos en este caso**. Fuera de solicitudes y de todas las cifras.
- TC-01 F1 sensor/resguardo y F2 rodamiento/husillo son modos posibles **observados**, respectivamente en C1 y C2.
- C-02 F1 filtro saturado y F2 purgador bloqueado son **solo posibles**: no consta que ocurrieran. P1 es preventivo de filtro/presión/purgador, no una avería.
- C1, C2 y P1 tienen estado **Reparado**. Sus inicios previstos son 13-oct 09:20, 15-oct 13:35 y 16-oct 16:15; duraciones previstas 45, 60 y 45 min.

### Reglas de cálculo

Los resultados se calculan en `calculateRequest()` y `calculateCase()`, no se almacenan como KPI constantes:

- Tiempo técnico = fin técnico − inicio técnico. C1: 60 min; C2: 75; P1: 45.
- Media técnica **correctiva** = (60 + 75) / 2 = **67,5 min**; excluye P1. No se presenta como una estimación general de fiabilidad.
- Parada funcional = recuperación − pérdida de función, intersectada con el horario requerido para disponibilidad. C1: 90 min; C2: 115; TC-01 total **205 min**.
- Cierre administrativo **no es recuperación**: C1 recupera a las 10:30 y cierra a las 11:00; C2 recupera a las 15:05 y cierra a las 15:30. No se añaden esos minutos administrativos a la parada.
- P1 **no tiene pérdida de función** ni genera parada del compresor o del torno. Su aceptación es 16-oct a las **17:00**, aclarada por el PDF; el Excel dejó la celda vacía con una nota. Cierra a las 17:20.
- h-persona = suma de horas registradas por persona. No es el tiempo técnico transcurrido.
- Mano de obra = Σ(horas × tarifa **de cada fila**); materiales = Σ(cantidad × precio unitario); directo = MO + materiales.
- Disponibilidad de TC-01 = (2400 − 205) / 2400 × 100 = **91,46 %**, bajo el supuesto explícito de **ninguna otra parada** del torno en el periodo. No se calcula disponibilidad de planta ni se extrapola a C-02.
- Duraciones calculadas con horas civiles de planta, sin conversión de huso horario ni dependencia del huso del navegador.

| Caso | Técnica (min) | Parada (min) | h-persona | MO (€) | Materiales (€) | Directo (€) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| C1 | 60 | 90 | 1,25 | 42,00 | 53,00 | 95,00 |
| C2 | 75 | 115 | 1,75 | 53,50 | 114,00 | 167,50 |
| P1 | 45 | No procede | 1,00 | 31,50 | 18,00 | 49,50 |
| Total | 180 | 205 (TC-01) | 4,00 | **127,00** | **185,00** | **312,00** |

Conteos: TC-01, **2 correctivas**; C-02, **1 preventiva**. Planificación: 45 + 60 + 45 = **150 min previstos**, distinta de los tiempos reales. Solo se consideran costes directos, sin impuestos ni costes indirectos.

## Odoo: PENDIENTE

El Excel no contiene el contraste Odoo completado. Esta aplicación **no se integra con Odoo** ni inventa identificadores, importaciones o verificaciones. La auditoría enumera lo pendiente: activos, solicitudes, hitos, filas económicas e indicadores. Para completarla se necesita evidencia real del sistema.

## Publicar en GitHub Pages

1. Crea un repositorio público y sube a la raíz de `main`: `index.html`, `style.css`, `app.js`, **`case-data.js`** y `README.md`. Puedes incluir `verify-case.mjs` para las pruebas.
2. En **Settings → Pages → Build and deployment**, elige **Deploy from a branch**.
3. Selecciona `main` y `/ (root)`, y guarda.
4. Espera al despliegue y abre `https://TU-USUARIO.github.io/TU-REPOSITORIO/`.

Todas las rutas son relativas y admiten un subdirectorio de Pages. No se necesitan servidor de aplicación, claves ni compilación. No es una aplicación offline: Three.js requiere acceso al CDN.

## Archivos y pruebas

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Secciones, controles accesibles e import map del CDN. |
| `style.css` | Visor, diseño responsive y presentación del caso. |
| `app.js` | Interfaz, tablas derivadas, geometría, raycasting, resaltado y OrbitControls. |
| `case-data.js` | Datos normalizados y funciones puras de cálculo. |
| `verify-case.mjs` | Pruebas de tiempos, costes, alcance, modos y aceptación. |

Con Node.js moderno (sin instalar dependencias):

```powershell
node --check app.js
node --check case-data.js
node --test verify-case.mjs
```

Prueba manual por HTTP: recorrer los tres activos y los cuatro modos; comprobar resaltes, cámara libre y selección de piezas; cambiar C1/C2/P1; comprobar que P1 no tiene parada; verificar los cuatro KPI principales, los totales económicos y el estado Odoo PENDIENTE. Repetir en viewport móvil y revisar la consola del navegador.
