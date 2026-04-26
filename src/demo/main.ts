import { WebGpuMap } from '../WebGpuMap.js';

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
      'markers: ' + s.markerCount
    ].join('\n');
  }
});


void map.init().catch((err: unknown) => {
  showError(err instanceof Error ? err.message : String(err));
});
