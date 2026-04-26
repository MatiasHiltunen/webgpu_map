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
export const LINE_INSTANCE_FLOATS = 10;
export const MARKER_INSTANCE_FLOATS = 8;

const DEFAULT_FILL: DrawColor = [0.1, 0.55, 1, 0.18];
const DEFAULT_STROKE: DrawColor = [0.05, 0.58, 1, 0.92];
const DEFAULT_MARKER: DrawColor = [1, 0.25, 0.08, 0.88];
const DEFAULT_STROKE_WIDTH = 1.5;
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
    if (geometry.type === 'polygon') {
      const fill = rgbaOrNull(resolveColor(geometry.fillColor, style.fillColor), DEFAULT_FILL);

      if (fill != null && fill[3] > 0 && geometry.rings.length > 0) {
        appendPolygonFill(vertices, geometry.rings, fill);
      }
    }
  }

  return new Float32Array(vertices);
}

export function buildLineSegmentInstances(
  geometries: readonly DrawGeometry[],
  style: DrawStyle = {}
): Float32Array {
  const instances: number[] = [];

  for (const geometry of geometries) {
    if (geometry.type === 'line') {
      const color = rgba(resolveColor(geometry.color, style.strokeColor), DEFAULT_STROKE);
      const width = Math.max(0, geometry.width ?? style.strokeWidth ?? DEFAULT_STROKE_WIDTH);

      if (color[3] > 0 && width > 0) {
        appendLineSegments(instances, geometry.coordinates, color, width, false);
      }
    } else {
      const stroke = rgbaOrNull(resolveColor(geometry.strokeColor, style.strokeColor), DEFAULT_STROKE);
      const strokeWidth = Math.max(
        0,
        geometry.strokeWidth ?? style.strokeWidth ?? DEFAULT_STROKE_WIDTH
      );

      if (stroke != null && stroke[3] > 0 && strokeWidth > 0) {
        for (const ring of geometry.rings) {
          appendLineSegments(instances, ring, stroke, strokeWidth, true);
        }
      }
    }
  }

  return new Float32Array(instances);
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

function appendLineSegments(
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

    appendSegmentInstance(out, a, b, color, width);
  }
}

function appendSegmentInstance(
  out: number[],
  a: MercatorPoint,
  b: MercatorPoint,
  color: Rgba,
  width: number
) {
  if (Math.hypot(b.x - a.x, b.y - a.y) <= EPSILON) return;

  out.push(
    a.x,
    a.y,
    b.x,
    b.y,
    width,
    0,
    color[0],
    color[1],
    color[2],
    color[3]
  );
}

function appendPolygonFill(
  out: number[],
  rings: readonly (readonly DrawPosition[])[],
  color: Rgba
) {
  const paths = rings
    .map((ring) => cleanPath(unwrapPath(ring.map(projectPosition)), true))
    .filter((ring) => ring.length >= 3);

  if (paths.length === 0) return;

  appendEvenOddFill(out, paths, color);
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

function appendEvenOddFill(out: number[], paths: readonly MercatorPoint[][], color: Rgba) {
  const xs = uniqueSortedXs(paths);

  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const dx = x1 - x0;

    if (dx <= EPSILON) continue;

    const inset = Math.min(dx * 1e-9, 1e-10);
    const leftX = x0 + inset;
    const rightX = x1 - inset;

    if (rightX <= leftX) continue;

    const left = polygonIntersectionsAtX(paths, leftX);
    const right = polygonIntersectionsAtX(paths, rightX);
    const pairCount = Math.min(left.length, right.length);

    for (let j = 0; j + 1 < pairCount; j += 2) {
      const leftA = left[j]!;
      const leftB = left[j + 1]!;
      const rightA = right[j]!;
      const rightB = right[j + 1]!;

      if (Math.abs(leftB - leftA) <= EPSILON && Math.abs(rightB - rightA) <= EPSILON) continue;

      pushVertex(out, { x: leftX, y: leftA }, 0, 0, color);
      pushVertex(out, { x: rightX, y: rightA }, 0, 0, color);
      pushVertex(out, { x: rightX, y: rightB }, 0, 0, color);
      pushVertex(out, { x: leftX, y: leftA }, 0, 0, color);
      pushVertex(out, { x: rightX, y: rightB }, 0, 0, color);
      pushVertex(out, { x: leftX, y: leftB }, 0, 0, color);
    }
  }
}

function uniqueSortedXs(paths: readonly MercatorPoint[][]): number[] {
  const xs: number[] = [];

  for (const path of paths) {
    for (const point of path) xs.push(point.x);
  }

  xs.sort((a, b) => a - b);

  const out: number[] = [];

  for (const x of xs) {
    const prev = out[out.length - 1];

    if (prev == null || Math.abs(x - prev) > EPSILON) out.push(x);
  }

  return out;
}

function polygonIntersectionsAtX(paths: readonly MercatorPoint[][], x: number): number[] {
  const ys: number[] = [];

  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const a = path[i]!;
      const b = path[(i + 1) % path.length]!;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);

      if (maxX - minX <= EPSILON) continue;
      if (x <= minX || x > maxX) continue;

      const t = (x - a.x) / (b.x - a.x);

      ys.push(a.y + (b.y - a.y) * t);
    }
  }

  ys.sort((a, b) => a - b);

  return ys;
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
