import { WebGpuMap } from '../WebGpuMap.js';
import type { BasemapShaderParams } from '../lib/basemapStyle.js';
import type { DrawStyle, GeoJson } from '../lib/drawtools.js';

type DemoCase = {
  readonly name: string;
  readonly geoJson: GeoJson;
  readonly style: DrawStyle;
};

const canvas = document.getElementById('map');
const hud = document.getElementById('hud');
const errorBox = document.getElementById('error');
const controls = document.getElementById('controls');
const featureSelect = document.getElementById('feature-demo');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="map"> in the document');
}

if (hud == null || errorBox == null || !(controls instanceof HTMLFormElement)) {
  throw new Error('Expected #hud, #error, and #controls in the document');
}

if (!(featureSelect instanceof HTMLSelectElement)) {
  throw new Error('Expected #feature-demo <select> in the document');
}

const hudEl: HTMLElement = hud;
const errBox: HTMLElement = errorBox;
const controlsEl: HTMLFormElement = controls;
const featureSelectEl: HTMLSelectElement = featureSelect;

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

const resetStyleButton = document.getElementById('reset-style');

if (!(resetStyleButton instanceof HTMLButtonElement)) {
  throw new Error('Expected #reset-style <button> in the document');
}

function showError(message: unknown) {
  errBox.style.display = 'flex';
  errBox.textContent = String(message == null ? 'Unknown error' : message);
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

  map.setGeoJson(demo.geoJson, demo.style);
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

featureSelectEl.addEventListener('change', applyFeatureDemo);

for (const input of Object.values(styleInputs)) {
  input.addEventListener('input', () => {
    updateStyleOutput();
    map.setBasemapShaderParams(readBasemapStyle());
  });
}

resetStyleButton.addEventListener('click', () => {
  resetStyleControls();
  map.resetBasemapStyle();
});

resetStyleControls();
applyFeatureDemo();

void map.init().catch((err: unknown) => {
  showError(err instanceof Error ? err.message : String(err));
});
