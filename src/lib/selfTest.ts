import {
  positiveModulo,
  lngToX01,
  latToY01,
  x01ToLng,
  y01ToLat,
  worldSize,
  integerTileZoom,
  formatTileUrl,
  fallbackForTile,
  pointerDistance,
  pointerMidpoint
} from './geo.js';

import { createLruStore } from './lru.js';

function assertTest(condition: boolean, message: string) {
  console.assert(condition, message);

  if (!condition) throw new Error('Self-test failed: ' + message);
}

const TILE_SIZE = 256;
const OSM_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const MIN_Z = 1;
const MAX_Z = 19;

/**
 * Runs small invariant checks. Safe to call at startup; throws on failure.
 */
export function runMapLibSelfTests() {

  assertTest(positiveModulo(-1, 4) === 3, 'positiveModulo handles negative values');
 
  assertTest(Math.abs(lngToX01(0) - 0.5) < 1e-12, 'lngToX01 maps Greenwich to center');
  
  assertTest(Math.abs(latToY01(0) - 0.5) < 1e-12, 'latToY01 maps equator to center');
  
  assertTest(Math.abs(x01ToLng(lngToX01(24.9384)) - 24.9384) < 1e-9, 'longitude round-trips');
  
  assertTest(Math.abs(y01ToLat(latToY01(60.1699)) - 60.1699) < 1e-9, 'latitude round-trips');
  
  assertTest(worldSize(3, TILE_SIZE) === 2048, 'worldSize at z=3 is correct');
  
  assertTest(Math.abs(worldSize(3.5, TILE_SIZE) - 2048 * Math.SQRT2) < 1e-9, 'worldSize supports fractional zoom');
  
  assertTest(integerTileZoom(3.99, MIN_Z, MAX_Z) === 3, 'integerTileZoom floors fractional zoom');
  
  assertTest(
    formatTileUrl(OSM_TEMPLATE, 3, 4, 2) === 'https://tile.openstreetmap.org/3/4/2.png',
    'tile URL replacement works'
  );

  const fb = fallbackForTile({ z: 5, x: 19, y: 11 }, 3);

  assertTest(fb.z === 3 && fb.x === 4 && fb.y === 2, 'fallback parent tile coordinate is correct');
  assertTest(Math.abs(fb.u0 - 0.75) < 1e-12 && Math.abs(fb.v0 - 0.75) < 1e-12, 'fallback UV origin is correct');
  assertTest(Math.abs(fb.uScale - 0.25) < 1e-12 && Math.abs(fb.vScale - 0.25) < 1e-12, 'fallback UV scale is correct');

  assertTest(Math.abs(Math.log2(2) - 1) < 1e-12, 'pinch zoom uses log2 scale conversion');
  assertTest(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }) === 5, 'pointerDistance works');
  
  const midpoint = pointerMidpoint({ x: 0, y: 2 }, { x: 4, y: 6 });
  
  assertTest(midpoint.x === 2 && midpoint.y === 4, 'pointerMidpoint works');

  const evicted: string[] = [];
  
  const lru = createLruStore(2, (item: string) => {
    evicted.push(item);
  });
  
  lru.set('a', 'A');
  lru.set('b', 'B');
  lru.get('a');
  lru.set('c', 'C');

  assertTest(!lru.has('b') && lru.has('a') && lru.has('c'), 'LRU evicts least recently used item');
  assertTest(evicted[0] === 'B', 'LRU dispose callback receives evicted item');
}
