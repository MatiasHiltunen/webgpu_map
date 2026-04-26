import {
  clamp,
  lngToX01,
  latToY01
} from './geo.js';

export type DrawColor = readonly [number, number, number] | readonly [number, number, number, number];

export type DrawPosition =
  | readonly [lng: number, lat: number, ...rest: number[]]
  | { readonly lng: number; readonly lat: number }
  | { readonly x01: number; readonly y01: number };

export type DrawStyle = {
  readonly fillColor?: DrawColor | null;
  readonly strokeColor?: DrawColor | null;
  readonly strokeWidth?: number;
  readonly markerColor?: DrawColor | null;
  readonly markerSize?: number;
};

export type DrawMarker = {
  readonly position: DrawPosition;
  readonly color?: DrawColor | null;
  readonly size?: number;
};

export type DrawLine = {
  readonly type: 'line';
  readonly coordinates: readonly DrawPosition[];
  readonly color?: DrawColor | null;
  readonly width?: number;
};

export type DrawPolygon = {
  readonly type: 'polygon';
  readonly rings: readonly (readonly DrawPosition[])[];
  readonly fillColor?: DrawColor | null;
  readonly strokeColor?: DrawColor | null;
  readonly strokeWidth?: number;
};

export type DrawGeometry = DrawLine | DrawPolygon;

export type DrawLayer = {
  readonly markers: readonly DrawMarker[];
  readonly geometries: readonly DrawGeometry[];
};

export type GeoJsonPosition = readonly [number, number, ...number[]];

export type GeoJsonGeometry =
  | { readonly type: 'Point'; readonly coordinates: GeoJsonPosition }
  | { readonly type: 'MultiPoint'; readonly coordinates: readonly GeoJsonPosition[] }
  | { readonly type: 'LineString'; readonly coordinates: readonly GeoJsonPosition[] }
  | { readonly type: 'MultiLineString'; readonly coordinates: readonly (readonly GeoJsonPosition[])[] }
  | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly GeoJsonPosition[])[] }
  | { readonly type: 'MultiPolygon'; readonly coordinates: readonly (readonly (readonly GeoJsonPosition[])[])[] }
  | { readonly type: 'GeometryCollection'; readonly geometries: readonly GeoJsonGeometry[] };

export type GeoJsonFeature = {
  readonly type: 'Feature';
  readonly geometry: GeoJsonGeometry | null;
  readonly properties?: unknown;
};

export type GeoJsonFeatureCollection = {
  readonly type: 'FeatureCollection';
  readonly features: readonly GeoJsonFeature[];
};

export type GeoJson = GeoJsonGeometry | GeoJsonFeature | GeoJsonFeatureCollection;

export const DRAW_VERTEX_FLOATS = 8;
export const MARKER_INSTANCE_FLOATS = 8;

const DEFAULT_FILL: DrawColor = [0.1, 0.55, 1, 0.18];
const DEFAULT_STROKE: DrawColor = [0.05, 0.58, 1, 0.92];
const DEFAULT_MARKER: DrawColor = [1, 0.25, 0.08, 0.88];
const DEFAULT_STROKE_WIDTH = 3;
const DEFAULT_MARKER_SIZE = 10;
const EPSILON = 1e-10;

type MercatorPoint = {
  x: number;
  y: number;
};

type Rgba = readonly [number, number, number, number];

export function marker(position: DrawPosition, style: DrawStyle = {}): DrawMarker {
  return {
    position,
    color: style.markerColor,
    size: style.markerSize
  };
}

export function line(coordinates: readonly DrawPosition[], style: DrawStyle = {}): DrawLine {
  return {
    type: 'line',
    coordinates,
    color: style.strokeColor,
    width: style.strokeWidth
  };
}

export function polygon(
  rings: readonly (readonly DrawPosition[])[],
  style: DrawStyle = {}
): DrawPolygon {
  return {
    type: 'polygon',
    rings,
    fillColor: style.fillColor,
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth
  };
}

export function geoJsonToDrawLayer(input: GeoJson, style: DrawStyle = {}): DrawLayer {
  const markers: DrawMarker[] = [];
  const geometries: DrawGeometry[] = [];

  appendGeoJson(input, style, markers, geometries);

  return { markers, geometries };
}

export function buildMarkerInstances(
  markers: readonly DrawMarker[],
  style: DrawStyle = {},
  limit = markers.length
): Float32Array {
  const count = Math.min(markers.length, Math.max(0, Math.floor(limit)));
  const out = new Float32Array(count * MARKER_INSTANCE_FLOATS);

  for (let i = 0; i < count; i++) {
    const item = markers[i]!;
    const p = projectPosition(item.position);
    const color = rgba(resolveColor(item.color, style.markerColor), DEFAULT_MARKER);
    const size = Math.max(0, item.size ?? style.markerSize ?? DEFAULT_MARKER_SIZE);
    const o = i * MARKER_INSTANCE_FLOATS;

    out[o + 0] = p.x;
    out[o + 1] = p.y;
    out[o + 2] = size;
    out[o + 3] = 0;
    out[o + 4] = color[0];
    out[o + 5] = color[1];
    out[o + 6] = color[2];
    out[o + 7] = color[3];
  }

  return out;
}

export function buildGeometryVertices(
  geometries: readonly DrawGeometry[],
  style: DrawStyle = {}
): Float32Array {
  const vertices: number[] = [];

  for (const geometry of geometries) {
    if (geometry.type === 'line') {
      const color = rgba(resolveColor(geometry.color, style.strokeColor), DEFAULT_STROKE);
      const width = Math.max(0, geometry.width ?? style.strokeWidth ?? DEFAULT_STROKE_WIDTH);

      if (color[3] > 0 && width > 0) {
        appendLine(vertices, geometry.coordinates, color, width, false);
      }
      continue;
    }

    const fill = rgbaOrNull(resolveColor(geometry.fillColor, style.fillColor), DEFAULT_FILL);

    if (fill != null && fill[3] > 0 && geometry.rings.length > 0) {
      appendPolygonFill(vertices, geometry.rings[0]!, fill);
    }

    const stroke = rgbaOrNull(resolveColor(geometry.strokeColor, style.strokeColor), DEFAULT_STROKE);
    const strokeWidth = Math.max(
      0,
      geometry.strokeWidth ?? style.strokeWidth ?? DEFAULT_STROKE_WIDTH
    );

    if (stroke != null && stroke[3] > 0 && strokeWidth > 0) {
      for (const ring of geometry.rings) {
        appendLine(vertices, ring, stroke, strokeWidth, true);
      }
    }
  }

  return new Float32Array(vertices);
}

export function projectPosition(position: DrawPosition): MercatorPoint {
  if ('x01' in position) {
    return {
      x: position.x01,
      y: clamp(position.y01, 0, 1)
    };
  }

  if ('lng' in position) {
    return {
      x: lngToX01(position.lng),
      y: latToY01(position.lat)
    };
  }

  return {
    x: lngToX01(position[0]),
    y: latToY01(position[1])
  };
}

function appendGeoJson(
  input: GeoJson,
  style: DrawStyle,
  markers: DrawMarker[],
  geometries: DrawGeometry[]
) {
  if (input.type === 'FeatureCollection') {
    for (const feature of input.features) {
      appendGeoJson(feature, style, markers, geometries);
    }
    return;
  }

  if (input.type === 'Feature') {
    if (input.geometry != null) {
      appendGeometry(input.geometry, style, markers, geometries);
    }
    return;
  }

  appendGeometry(input, style, markers, geometries);
}

function appendGeometry(
  geometry: GeoJsonGeometry,
  style: DrawStyle,
  markers: DrawMarker[],
  geometries: DrawGeometry[]
) {
  switch (geometry.type) {
    case 'Point':
      markers.push(marker(geometry.coordinates, style));
      return;
    case 'MultiPoint':
      for (const position of geometry.coordinates) markers.push(marker(position, style));
      return;
    case 'LineString':
      geometries.push(line(geometry.coordinates, style));
      return;
    case 'MultiLineString':
      for (const coordinates of geometry.coordinates) geometries.push(line(coordinates, style));
      return;
    case 'Polygon':
      geometries.push(polygon(geometry.coordinates, style));
      return;
    case 'MultiPolygon':
      for (const rings of geometry.coordinates) geometries.push(polygon(rings, style));
      return;
    case 'GeometryCollection':
      for (const child of geometry.geometries) appendGeometry(child, style, markers, geometries);
      return;
  }
}

function appendLine(
  out: number[],
  coordinates: readonly DrawPosition[],
  color: Rgba,
  width: number,
  closed: boolean
) {
  const points = cleanPath(unwrapPath(coordinates.map(projectPosition)), closed);

  if (points.length < 2) return;

  const last = closed ? points.length : points.length - 1;

  for (let i = 0; i < last; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;

    appendSegment(out, a, b, color, width);
  }
}

function appendSegment(out: number[], a: MercatorPoint, b: MercatorPoint, color: Rgba, width: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);

  if (length <= EPSILON) return;

  const half = width / 2;
  const ox = (-dy / length) * half;
  const oy = (dx / length) * half;

  pushVertex(out, a, ox, oy, color);
  pushVertex(out, b, ox, oy, color);
  pushVertex(out, b, -ox, -oy, color);
  pushVertex(out, a, ox, oy, color);
  pushVertex(out, b, -ox, -oy, color);
  pushVertex(out, a, -ox, -oy, color);
}

function appendPolygonFill(out: number[], ring: readonly DrawPosition[], color: Rgba) {
  const points = cleanPath(unwrapPath(ring.map(projectPosition)), true);

  if (points.length < 3) return;

  const indices = triangulateRing(points);

  for (const index of indices) {
    pushVertex(out, points[index]!, 0, 0, color);
  }
}

function pushVertex(out: number[], point: MercatorPoint, offsetX: number, offsetY: number, color: Rgba) {
  out.push(
    point.x,
    point.y,
    offsetX,
    offsetY,
    color[0],
    color[1],
    color[2],
    color[3]
  );
}

function cleanPath(points: readonly MercatorPoint[], closed: boolean): MercatorPoint[] {
  const out: MercatorPoint[] = [];

  for (const point of points) {
    const prev = out[out.length - 1];

    if (prev == null || !samePoint(prev, point)) {
      out.push(point);
    }
  }

  if (closed && out.length > 1 && samePoint(out[0]!, out[out.length - 1]!)) {
    out.pop();
  }

  return out;
}

function unwrapPath(points: readonly MercatorPoint[]): MercatorPoint[] {
  if (points.length === 0) return [];

  const out: MercatorPoint[] = [{ x: points[0]!.x, y: points[0]!.y }];

  for (let i = 1; i < points.length; i++) {
    const raw = points[i]!;
    const prev = out[out.length - 1]!;
    let x = raw.x;

    while (x - prev.x > 0.5) x -= 1;
    while (x - prev.x < -0.5) x += 1;

    out.push({ x, y: raw.y });
  }

  return out;
}

function triangulateRing(points: readonly MercatorPoint[]): number[] {
  const area = signedArea(points);

  if (Math.abs(area) <= EPSILON) return [];

  const ccw = area > 0;
  const remaining = points.map((_, i) => i);
  const triangles: number[] = [];
  let guard = 0;

  while (remaining.length > 3 && guard < points.length * points.length) {
    guard++;

    let clipped = false;

    for (let i = 0; i < remaining.length; i++) {
      const prevIndex = remaining[(i + remaining.length - 1) % remaining.length]!;
      const currIndex = remaining[i]!;
      const nextIndex = remaining[(i + 1) % remaining.length]!;
      const a = points[prevIndex]!;
      const b = points[currIndex]!;
      const c = points[nextIndex]!;

      if (!isConvex(a, b, c, ccw)) continue;
      if (containsAnyPoint(points, remaining, prevIndex, currIndex, nextIndex)) continue;

      triangles.push(prevIndex, currIndex, nextIndex);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }

    if (!clipped) return fanTriangulate(points);
  }

  if (remaining.length === 3) {
    triangles.push(remaining[0]!, remaining[1]!, remaining[2]!);
  }

  return triangles;
}

function fanTriangulate(points: readonly MercatorPoint[]): number[] {
  const triangles: number[] = [];

  for (let i = 1; i < points.length - 1; i++) {
    triangles.push(0, i, i + 1);
  }

  return triangles;
}

function containsAnyPoint(
  points: readonly MercatorPoint[],
  remaining: readonly number[],
  prevIndex: number,
  currIndex: number,
  nextIndex: number
): boolean {
  const a = points[prevIndex]!;
  const b = points[currIndex]!;
  const c = points[nextIndex]!;

  for (const index of remaining) {
    if (index === prevIndex || index === currIndex || index === nextIndex) continue;
    if (pointInTriangle(points[index]!, a, b, c)) return true;
  }

  return false;
}

function pointInTriangle(p: MercatorPoint, a: MercatorPoint, b: MercatorPoint, c: MercatorPoint) {
  const ab = cross(a, b, p);
  const bc = cross(b, c, p);
  const ca = cross(c, a, p);
  const hasNegative = ab < -EPSILON || bc < -EPSILON || ca < -EPSILON;
  const hasPositive = ab > EPSILON || bc > EPSILON || ca > EPSILON;

  return !(hasNegative && hasPositive);
}

function isConvex(a: MercatorPoint, b: MercatorPoint, c: MercatorPoint, ccw: boolean) {
  const value = cross(a, b, c);

  return ccw ? value > EPSILON : value < -EPSILON;
}

function cross(a: MercatorPoint, b: MercatorPoint, c: MercatorPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function signedArea(points: readonly MercatorPoint[]) {
  let area = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;

    area += a.x * b.y - b.x * a.y;
  }

  return area / 2;
}

function samePoint(a: MercatorPoint, b: MercatorPoint) {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function resolveColor(
  value: DrawColor | null | undefined,
  fallback: DrawColor | null | undefined
) {
  return value === undefined ? fallback : value;
}

function rgba(color: DrawColor | null | undefined, fallback: DrawColor): Rgba {
  return rgbaOrNull(color, fallback) ?? [0, 0, 0, 0];
}

function rgbaOrNull(color: DrawColor | null | undefined, fallback: DrawColor): Rgba | null {
  if (color === null) return null;

  const source = color ?? fallback;

  return [
    clamp(source[0], 0, 1),
    clamp(source[1], 0, 1),
    clamp(source[2], 0, 1),
    clamp(source[3] ?? 1, 0, 1)
  ];
}
