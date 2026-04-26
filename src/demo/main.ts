import { WebGpuMap } from '../WebGpuMap.js';
import type { BasemapEffectsParams, BasemapShaderParams } from '../lib/basemapStyle.js';
import type { DrawStyle, GeoJson } from '../lib/drawtools.js';

type DemoCase = {
  readonly name: string;
  readonly geoJson: GeoJson;
  readonly style: DrawStyle;
  readonly editable?: boolean;
};

const canvas = document.getElementById('map');
const hud = document.getElementById('hud');
const hudPanel = document.getElementById('hud-panel');
const errorBox = document.getElementById('error');
const controls = document.getElementById('controls');
const featureSelect = document.getElementById('feature-demo');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="map"> in the document');
}

if (
  !(hud instanceof HTMLPreElement) ||
  !(hudPanel instanceof HTMLElement) ||
  errorBox == null ||
  !(controls instanceof HTMLFormElement)
) {
  throw new Error('Expected #hud, #hud-panel, #error, and #controls in the document');
}

if (!(featureSelect instanceof HTMLSelectElement)) {
  throw new Error('Expected #feature-demo <select> in the document');
}

const hudEl: HTMLElement = hud;
const hudPanelEl: HTMLElement = hudPanel;
const errBox: HTMLElement = errorBox;
const controlsEl: HTMLFormElement = controls;
const featureSelectEl: HTMLSelectElement = featureSelect;
const hudFab = button('hud-fab');
const hudCollapse = button('hud-collapse');
const controlsFab = button('controls-fab');
const controlsCollapse = button('controls-collapse');
const geoJsonEditorWrap = element('geojson-editor-wrap');
const geoJsonEditor = textarea('geojson-editor');
const geoJsonApply = button('geojson-apply');
const geoJsonReset = button('geojson-reset');
const geoJsonStatus = element('geojson-status');

const styleInputs = {
  brightness: rangeInput('style-brightness'),
  contrast: rangeInput('style-contrast'),
  saturation: rangeInput('style-saturation'),
  gamma: rangeInput('style-gamma'),
  hue: rangeInput('style-hue'),
  tintStrength: rangeInput('style-tint-strength'),
  invert: rangeInput('style-invert'),
  tintColor: colorInput('style-tint-color')
};

const effectInputs = {
  targetColor: colorInput('effect-target-color'),
  tolerance: rangeInput('effect-tolerance'),
  softness: rangeInput('effect-softness'),
  bloomColor: colorInput('effect-bloom-color'),
  bloomIntensity: rangeInput('effect-bloom-intensity'),
  bloomRadius: rangeInput('effect-bloom-radius'),
  heightStrength: rangeInput('effect-height-strength'),
  reliefStrength: rangeInput('effect-relief-strength'),
  maskPreview: checkboxInput('effect-mask-preview')
};

const styleOutputs = {
  brightness: rangeOutput(styleInputs.brightness),
  contrast: rangeOutput(styleInputs.contrast),
  saturation: rangeOutput(styleInputs.saturation),
  gamma: rangeOutput(styleInputs.gamma),
  hue: rangeOutput(styleInputs.hue),
  tintStrength: rangeOutput(styleInputs.tintStrength),
  invert: rangeOutput(styleInputs.invert),
  tintColor: rangeOutput(styleInputs.tintColor)
};

const effectOutputs = {
  targetColor: rangeOutput(effectInputs.targetColor),
  tolerance: rangeOutput(effectInputs.tolerance),
  softness: rangeOutput(effectInputs.softness),
  bloomColor: rangeOutput(effectInputs.bloomColor),
  bloomIntensity: rangeOutput(effectInputs.bloomIntensity),
  bloomRadius: rangeOutput(effectInputs.bloomRadius),
  heightStrength: rangeOutput(effectInputs.heightStrength),
  reliefStrength: rangeOutput(effectInputs.reliefStrength),
  maskPreview: rangeOutput(effectInputs.maskPreview)
};

const resetStyleButton = document.getElementById('reset-style');
const resetEffectsButton = document.getElementById('reset-effects');

if (!(resetStyleButton instanceof HTMLButtonElement)) {
  throw new Error('Expected #reset-style <button> in the document');
}

if (!(resetEffectsButton instanceof HTMLButtonElement)) {
  throw new Error('Expected #reset-effects <button> in the document');
}

function showError(message: unknown) {
  errBox.style.display = 'flex';
  errBox.textContent = String(message == null ? 'Unknown error' : message);
}

function element(id: string): HTMLElement {
  const el = document.getElementById(id);

  if (!(el instanceof HTMLElement)) {
    throw new Error('Expected #' + id + ' element');
  }

  return el;
}

function button(id: string): HTMLButtonElement {
  const el = document.getElementById(id);

  if (!(el instanceof HTMLButtonElement)) {
    throw new Error('Expected #' + id + ' button');
  }

  return el;
}

function textarea(id: string): HTMLTextAreaElement {
  const el = document.getElementById(id);

  if (!(el instanceof HTMLTextAreaElement)) {
    throw new Error('Expected #' + id + ' textarea');
  }

  return el;
}

function rangeInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);

  if (!(el instanceof HTMLInputElement) || el.type !== 'range') {
    throw new Error('Expected #' + id + ' range input');
  }

  return el;
}

function colorInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);

  if (!(el instanceof HTMLInputElement) || el.type !== 'color') {
    throw new Error('Expected #' + id + ' color input');
  }

  return el;
}

function checkboxInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);

  if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox') {
    throw new Error('Expected #' + id + ' checkbox input');
  }

  return el;
}

function rangeOutput(input: HTMLInputElement): HTMLOutputElement {
  const el = controlsEl.querySelector('output[for="' + input.id + '"]');

  if (!(el instanceof HTMLOutputElement)) {
    throw new Error('Expected output for #' + input.id);
  }

  return el;
}

function numberFromInput(input: HTMLInputElement): number {
  return Number.parseFloat(input.value);
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;
  const value = Number.parseInt(raw, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  ];
}

function updateStyleOutput() {
  styleOutputs.brightness.value = numberFromInput(styleInputs.brightness).toFixed(2);
  styleOutputs.contrast.value = numberFromInput(styleInputs.contrast).toFixed(2);
  styleOutputs.saturation.value = numberFromInput(styleInputs.saturation).toFixed(2);
  styleOutputs.gamma.value = numberFromInput(styleInputs.gamma).toFixed(2);
  styleOutputs.hue.value = String(Math.round(numberFromInput(styleInputs.hue)));
  styleOutputs.tintStrength.value = numberFromInput(styleInputs.tintStrength).toFixed(2);
  styleOutputs.invert.value = numberFromInput(styleInputs.invert).toFixed(2);
  styleOutputs.tintColor.value = String(Math.round(numberFromInput(styleInputs.tintStrength) * 100)) + '%';
}

function updateEffectOutput() {
  effectOutputs.targetColor.value = 'mask';
  effectOutputs.tolerance.value = numberFromInput(effectInputs.tolerance).toFixed(3);
  effectOutputs.softness.value = numberFromInput(effectInputs.softness).toFixed(3);
  effectOutputs.bloomColor.value = 'glow';
  effectOutputs.bloomIntensity.value = numberFromInput(effectInputs.bloomIntensity).toFixed(2);
  effectOutputs.bloomRadius.value = String(Math.round(numberFromInput(effectInputs.bloomRadius)));
  effectOutputs.heightStrength.value = numberFromInput(effectInputs.heightStrength).toFixed(2);
  effectOutputs.reliefStrength.value = numberFromInput(effectInputs.reliefStrength).toFixed(2);
  effectOutputs.maskPreview.value = effectInputs.maskPreview.checked ? 'on' : 'off';
}

function readBasemapStyle(): BasemapShaderParams {
  return {
    brightness: numberFromInput(styleInputs.brightness),
    contrast: numberFromInput(styleInputs.contrast),
    saturation: numberFromInput(styleInputs.saturation),
    gamma: numberFromInput(styleInputs.gamma),
    hueRotate: (numberFromInput(styleInputs.hue) * Math.PI) / 180,
    tintColor: hexToRgb(styleInputs.tintColor.value),
    tintStrength: numberFromInput(styleInputs.tintStrength),
    invert: numberFromInput(styleInputs.invert)
  };
}

function readBasemapEffects(): BasemapEffectsParams {
  return {
    targetColor: hexToRgb(effectInputs.targetColor.value),
    tolerance: numberFromInput(effectInputs.tolerance),
    softness: numberFromInput(effectInputs.softness),
    bloomColor: hexToRgb(effectInputs.bloomColor.value),
    bloomIntensity: numberFromInput(effectInputs.bloomIntensity),
    bloomRadius: numberFromInput(effectInputs.bloomRadius),
    heightStrength: numberFromInput(effectInputs.heightStrength),
    reliefStrength: numberFromInput(effectInputs.reliefStrength),
    maskPreview: effectInputs.maskPreview.checked
  };
}

function resetStyleControls() {
  styleInputs.brightness.value = '0';
  styleInputs.contrast.value = '1';
  styleInputs.saturation.value = '1';
  styleInputs.gamma.value = '1';
  styleInputs.hue.value = '0';
  styleInputs.tintColor.value = '#ffffff';
  styleInputs.tintStrength.value = '0';
  styleInputs.invert.value = '0';
  updateStyleOutput();
}

function resetEffectControls() {
  effectInputs.targetColor.value = '#e0dccd';
  effectInputs.tolerance.value = '0.08';
  effectInputs.softness.value = '0.04';
  effectInputs.bloomColor.value = '#59d9ff';
  effectInputs.bloomIntensity.value = '0';
  effectInputs.bloomRadius.value = '10';
  effectInputs.heightStrength.value = '0';
  effectInputs.reliefStrength.value = '4';
  effectInputs.maskPreview.checked = false;
  updateEffectOutput();
}

function setCollapsible(
  panel: HTMLElement,
  fab: HTMLButtonElement,
  collapsed: boolean
) {
  panel.hidden = collapsed;
  fab.hidden = !collapsed;
  panel.setAttribute('aria-hidden', String(collapsed));
  fab.setAttribute('aria-expanded', String(!collapsed));
}

function setGeoJsonStatus(message: string, ok: boolean) {
  geoJsonStatus.textContent = message;
  geoJsonStatus.style.color = ok ? 'rgba(180, 255, 210, 0.86)' : 'rgba(255, 185, 155, 0.92)';
}

function customGeoJsonText(): string {
  return JSON.stringify(customGeoJsonExample, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPosition(value: unknown): value is readonly [number, number, ...number[]] {
  return Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number';
}

function isPositionArray(value: unknown): value is readonly (readonly [number, number, ...number[]])[] {
  return Array.isArray(value) && value.every(isPosition);
}

function isPolygonCoordinates(
  value: unknown
): value is readonly (readonly (readonly [number, number, ...number[]])[])[] {
  return Array.isArray(value) && value.every(isPositionArray);
}

function isGeoJsonGeometry(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'Point':
      return isPosition(value.coordinates);
    case 'MultiPoint':
    case 'LineString':
      return isPositionArray(value.coordinates);
    case 'MultiLineString':
    case 'Polygon':
      return isPolygonCoordinates(value.coordinates);
    case 'MultiPolygon':
      return Array.isArray(value.coordinates) && value.coordinates.every(isPolygonCoordinates);
    case 'GeometryCollection':
      return Array.isArray(value.geometries) && value.geometries.every(isGeoJsonGeometry);
    default:
      return false;
  }
}

function isGeoJson(value: unknown): value is GeoJson {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  if (value.type === 'Feature') {
    return value.geometry === null || isGeoJsonGeometry(value.geometry);
  }

  if (value.type === 'FeatureCollection') {
    return Array.isArray(value.features) &&
      value.features.every((feature) => isRecord(feature) && feature.type === 'Feature' && isGeoJson(feature));
  }

  return isGeoJsonGeometry(value);
}

const customGeoJsonExample = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'custom line' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [24.84, 60.155],
          [24.91, 60.177],
          [24.99, 60.165]
        ]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'custom polygon' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [24.915, 60.19],
            [24.975, 60.188],
            [24.982, 60.225],
            [24.905, 60.218],
            [24.915, 60.19]
          ]
        ]
      }
    }
  ]
} satisfies GeoJson;

const demoCases: readonly DemoCase[] = [
  {
    name: 'Clean Lines',
    geoJson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'LineString',
            coordinates: [
              [24.817, 60.177],
              [24.86, 60.164],
              [24.918, 60.168],
              [24.973, 60.181],
              [25.018, 60.194]
            ]
          }
        },
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'LineString',
            coordinates: [
              [24.842, 60.209],
              [24.902, 60.197],
              [24.951, 60.204],
              [25.016, 60.214]
            ]
          }
        }
      ]
    },
    style: {
      strokeColor: [0.02, 0.78, 1, 0.92],
      strokeWidth: 1.5,
      fillColor: null
    }
  },
  {
    name: 'Polygon Fill + Hole',
    geoJson: {
      type: 'Feature',
      properties: null,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [24.885, 60.14],
            [25.015, 60.145],
            [25.005, 60.22],
            [24.86, 60.205],
            [24.885, 60.14]
          ],
          [
            [24.925, 60.165],
            [24.965, 60.168],
            [24.958, 60.195],
            [24.918, 60.19],
            [24.925, 60.165]
          ]
        ]
      }
    },
    style: {
      fillColor: [0.0, 0.62, 0.95, 0.24],
      strokeColor: [0.0, 0.78, 1.0, 0.88],
      strokeWidth: 1.25
    }
  },
  {
    name: 'Points',
    geoJson: {
      type: 'MultiPoint',
      coordinates: [
        [24.9384, 60.1699],
        [24.955, 60.186],
        [24.904, 60.162],
        [24.984, 60.176],
        [24.871, 60.194]
      ]
    },
    style: {
      markerColor: [1.0, 0.28, 0.08, 0.9],
      markerSize: 13,
      fillColor: null,
      strokeColor: null
    }
  },
  {
    name: 'Mixed GeoJSON',
    geoJson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'LineString',
            coordinates: [
              [24.821, 60.187],
              [24.886, 60.168],
              [24.943, 60.171],
              [25.002, 60.189]
            ]
          }
        },
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [24.91, 60.145],
                [24.99, 60.147],
                [24.982, 60.205],
                [24.905, 60.198],
                [24.91, 60.145]
              ]
            ]
          }
        },
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [24.9384, 60.1699],
              [24.955, 60.186],
              [24.904, 60.162]
            ]
          }
        }
      ]
    },
    style: {
      fillColor: [0.0, 0.6, 0.95, 0.2],
      strokeColor: [0.0, 0.78, 1.0, 0.92],
      strokeWidth: 1.35,
      markerColor: [1.0, 0.28, 0.08, 0.9],
      markerSize: 13
    }
  },
  {
    name: 'Custom GeoJSON',
    geoJson: customGeoJsonExample,
    style: {
      fillColor: [0.0, 0.62, 0.95, 0.22],
      strokeColor: [0.0, 0.86, 1.0, 0.92],
      strokeWidth: 1.35,
      markerColor: [1.0, 0.3, 0.08, 0.9],
      markerSize: 13
    },
    editable: true
  }
];

const map = new WebGpuMap({
  canvas,
  initialZoom: 11.1,
  initialCenter: { lat: 60.178, lng: 24.94 },
  onStats(s) {
    hudEl.textContent = [
      'zoom: ' + s.zoom.toFixed(2) + ' / tiles z' + s.tileZ + ' x' + s.scaleToTileZ.toFixed(2),
      'center: ' + s.centerLat.toFixed(5) + ', ' + s.centerLng.toFixed(5),
      'visible tiles: ' + s.visibleTileCount,
      'fallback draws: ' + s.fallbackDraws,
      'cache: ' + s.cacheSize + ', inflight: ' + s.inflightCount,
      'markers: ' + s.markerCount,
      'fill vertices: ' + s.geometryVertexCount,
      'line segments: ' + s.lineSegmentCount
    ].join('\n');
  }
});

function applyFeatureDemo() {
  const demo = demoCases[featureSelectEl.selectedIndex] ?? demoCases[0]!;

  geoJsonEditorWrap.classList.toggle('hidden', demo.editable !== true);

  if (demo.editable === true) {
    applyCustomGeoJson();
    return;
  }

  setGeoJsonStatus('', true);
  map.setGeoJson(demo.geoJson, demo.style);
}

function applyCustomGeoJson() {
  const demo = demoCases[featureSelectEl.selectedIndex] ?? demoCases[0]!;

  try {
    const parsed: unknown = JSON.parse(geoJsonEditor.value);

    if (!isGeoJson(parsed)) {
      setGeoJsonStatus('Invalid GeoJSON shape.', false);
      return;
    }

    map.setGeoJson(parsed, demo.style);
    setGeoJsonStatus('Applied custom GeoJSON.', true);
  } catch (err: unknown) {
    setGeoJsonStatus(err instanceof Error ? err.message : 'Could not parse JSON.', false);
  }
}

for (const [index, demo] of demoCases.entries()) {
  const option = document.createElement('option');

  option.value = String(index);
  option.textContent = demo.name;
  featureSelectEl.append(option);
}

controlsEl.addEventListener('submit', (event) => {
  event.preventDefault();
});

hudCollapse.addEventListener('click', () => {
  setCollapsible(hudPanelEl, hudFab, true);
});

hudFab.addEventListener('click', () => {
  setCollapsible(hudPanelEl, hudFab, false);
});

controlsCollapse.addEventListener('click', () => {
  setCollapsible(controlsEl, controlsFab, true);
});

controlsFab.addEventListener('click', () => {
  setCollapsible(controlsEl, controlsFab, false);
});

featureSelectEl.addEventListener('change', applyFeatureDemo);

geoJsonApply.addEventListener('click', applyCustomGeoJson);

geoJsonReset.addEventListener('click', () => {
  geoJsonEditor.value = customGeoJsonText();
  applyCustomGeoJson();
});

for (const input of Object.values(styleInputs)) {
  input.addEventListener('input', () => {
    updateStyleOutput();
    map.setBasemapShaderParams(readBasemapStyle());
  });
}

for (const input of Object.values(effectInputs)) {
  input.addEventListener('input', () => {
    updateEffectOutput();
    map.setBasemapEffects(readBasemapEffects());
  });
}

resetStyleButton.addEventListener('click', () => {
  resetStyleControls();
  map.resetBasemapStyle();
});

resetEffectsButton.addEventListener('click', () => {
  resetEffectControls();
  map.resetBasemapEffects();
});

resetStyleControls();
resetEffectControls();
geoJsonEditor.value = customGeoJsonText();
applyFeatureDemo();

void map.init().catch((err: unknown) => {
  showError(err instanceof Error ? err.message : String(err));
});
