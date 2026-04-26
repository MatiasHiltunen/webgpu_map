import { WebGpuMap } from '../WebGpuMap.js';
import type { GeoJson } from '../lib/drawtools.js';

const canvas = document.getElementById('map');
const hud = document.getElementById('hud');
const errorBox = document.getElementById('error');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="map"> in the document');
}

if (hud == null || errorBox == null) {
  throw new Error('Expected #hud and #error in the document');
}

const hudEl: HTMLElement = hud;
const errBox: HTMLElement = errorBox;

function showError(message: unknown) {
  errBox.style.display = 'flex';
  errBox.textContent = String(message == null ? 'Unknown error' : message);
}

const map = new WebGpuMap({
  canvas,
  onStats(s) {
    hudEl.textContent = [
      'zoom: ' + s.zoom.toFixed(2) + ' / tiles z' + s.tileZ + ' x' + s.scaleToTileZ.toFixed(2),
      'center: ' + s.centerLat.toFixed(5) + ', ' + s.centerLng.toFixed(5),
      'visible tiles: ' + s.visibleTileCount,
      'fallback draws: ' + s.fallbackDraws,
      'cache: ' + s.cacheSize + ', inflight: ' + s.inflightCount,
      'markers: ' + s.markerCount,
      'geometry vertices: ' + s.geometryVertexCount
    ].join('\n');
  }
});

const demoGeoJson = {
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
} satisfies GeoJson;

map.setGeoJson(demoGeoJson, {
  fillColor: [0.0, 0.6, 0.95, 0.22],
  strokeColor: [0.0, 0.78, 1.0, 0.9],
  strokeWidth: 4,
  markerColor: [1.0, 0.28, 0.08, 0.9],
  markerSize: 13
});


void map.init().catch((err: unknown) => {
  showError(err instanceof Error ? err.message : String(err));
});
