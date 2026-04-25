/**
 * Spherical Web Mercator helpers (0..1 space for x/y) and map interaction math.
 */
export function clamp(value: number, min: number, max: number): number {

  return Math.max(min, Math.min(max, value));

}

export function positiveModulo(n: number, m: number): number {

  return ((n % m) + m) % m;

}

export function lngToX01(lng: number): number {

  return (lng + 180) / 360;

}

export function latToY01(lat: number): number {

  const clamped = clamp(lat, -85.051_128_78, 85.051_128_78);
  const rad = (clamped * Math.PI) / 180;

  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

export function x01ToLng(x: number): number {
  return x * 360 - 180;
}

export function y01ToLat(y: number): number {

  const n = Math.PI - 2 * Math.PI * y;

  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

}

export function worldSize(zoom: number, tileSize: number): number {
  return tileSize * 2 ** zoom;
}

export function integerTileZoom(zoom: number, minZ: number, maxZ: number): number {
  return clamp(Math.floor(zoom), minZ, maxZ);
}

export function formatTileUrl(
  template: string,
  z: number,
  x: number,
  y: number
): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function pointerDistance(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number }
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointerMidpoint(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number }
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export type FallbackTile = {
  z: number;
  x: number;
  y: number;
  key: string;
  u0: number;
  v0: number;
  uScale: number;
  vScale: number;
};

export function fallbackForTile(
  tile: { z: number; x: number; y: number },
  parentZ: number
): FallbackTile {
  const dz = tile.z - parentZ;
  const divisor = 1 << dz;
  const parentX = Math.floor(tile.x / divisor);
  const parentY = Math.floor(tile.y / divisor);
  const localX = tile.x - parentX * divisor;
  const localY = tile.y - parentY * divisor;
  const uvScale = 1 / divisor;

  return {
    z: parentZ,
    x: parentX,
    y: parentY,
    key: String(parentZ) + '/' + String(parentX) + '/' + String(parentY),
    u0: localX * uvScale,
    v0: localY * uvScale,
    uScale: uvScale,
    vScale: uvScale
  };
}
