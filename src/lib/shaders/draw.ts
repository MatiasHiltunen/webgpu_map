/** @internal Vector overlay shader bundle. */
export const MARKER_WGSL = `
struct Camera {
  topLeft01 : vec4<f32>,
  viewport : vec4<f32>,
  view : vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera : Camera;

fn worldSize() -> f32 {
  return camera.viewport.z;
}

fn viewportSize() -> vec2<f32> {
  return camera.viewport.xy;
}

fn cameraScale() -> f32 {
  return camera.view.y;
}

fn worldShiftX(pointX01 : f32) -> f32 {
  let centerX01 = camera.topLeft01.x + camera.topLeft01.z + viewportSize().x * 0.5 / worldSize();
  return round(centerX01 - pointX01);
}

fn screenFromMercator(mercator01Hi : vec2<f32>, mercator01Lo : vec2<f32>, shiftX01 : f32) -> vec2<f32> {
  let delta01 = vec2<f32>(
    (mercator01Hi.x - camera.topLeft01.x) + (mercator01Lo.x - camera.topLeft01.z) + shiftX01,
    (mercator01Hi.y - camera.topLeft01.y) + (mercator01Lo.y - camera.topLeft01.w)
  );
  return delta01 * worldSize();
}

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) color : vec4<f32>,
};

@vertex
fn vsMain(
  @location(0) localPos : vec2<f32>,
  @location(1) mercator01Hi : vec2<f32>,
  @location(2) mercator01Lo : vec2<f32>,
  @location(3) sizeCss : f32,
  @location(4) color : vec4<f32>
) -> VSOut {
  var out : VSOut;
  let pointX01 = mercator01Hi.x + mercator01Lo.x;
  let screen = screenFromMercator(
    mercator01Hi,
    mercator01Lo,
    worldShiftX(pointX01)
  ) + localPos * sizeCss / cameraScale();
  let ndc = vec2<f32>(
    screen.x / viewportSize().x * 2.0 - 1.0,
    1.0 - screen.y / viewportSize().y * 2.0
  );
  out.position = vec4<f32>(ndc, 0.0, 1.0);
  out.local = localPos;
  out.color = color;
  return out;
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let r = length(in.local * 2.0);
  let alpha = smoothstep(1.0, 0.82, r) * in.color.a;
  return vec4<f32>(in.color.rgb * alpha, alpha);
}
`;

/** @internal */
export const GEOMETRY_WGSL = `
struct Camera {
  topLeft01 : vec4<f32>,
  viewport : vec4<f32>,
  view : vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera : Camera;

fn worldSize() -> f32 {
  return camera.viewport.z;
}

fn viewportSize() -> vec2<f32> {
  return camera.viewport.xy;
}

fn cameraScale() -> f32 {
  return camera.view.y;
}

fn worldShiftX(pointX01 : f32) -> f32 {
  let centerX01 = camera.topLeft01.x + camera.topLeft01.z + viewportSize().x * 0.5 / worldSize();
  return round(centerX01 - pointX01);
}

fn screenFromMercator(mercator01Hi : vec2<f32>, mercator01Lo : vec2<f32>, shiftX01 : f32) -> vec2<f32> {
  let delta01 = vec2<f32>(
    (mercator01Hi.x - camera.topLeft01.x) + (mercator01Lo.x - camera.topLeft01.z) + shiftX01,
    (mercator01Hi.y - camera.topLeft01.y) + (mercator01Lo.y - camera.topLeft01.w)
  );
  return delta01 * worldSize();
}

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

@vertex
fn vsMain(
  @location(0) mercator01Hi : vec2<f32>,
  @location(1) mercator01Lo : vec2<f32>,
  @location(2) offsetCss : vec2<f32>,
  @location(3) color : vec4<f32>
) -> VSOut {
  var out : VSOut;
  let pointX01 = mercator01Hi.x + mercator01Lo.x;
  let screen = screenFromMercator(
    mercator01Hi,
    mercator01Lo,
    worldShiftX(pointX01)
  ) + offsetCss / cameraScale();
  let ndc = vec2<f32>(
    screen.x / viewportSize().x * 2.0 - 1.0,
    1.0 - screen.y / viewportSize().y * 2.0
  );
  out.position = vec4<f32>(ndc, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color.rgb * in.color.a, in.color.a);
}
`;

/** @internal */
export const LINE_WGSL = `
struct Camera {
  topLeft01 : vec4<f32>,
  viewport : vec4<f32>,
  view : vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera : Camera;

fn worldSize() -> f32 {
  return camera.viewport.z;
}

fn viewportSize() -> vec2<f32> {
  return camera.viewport.xy;
}

fn devicePixelRatio() -> f32 {
  return camera.viewport.w;
}

fn cameraScale() -> f32 {
  return camera.view.y;
}

fn worldShiftX(pointX01 : f32) -> f32 {
  let centerX01 = camera.topLeft01.x + camera.topLeft01.z + viewportSize().x * 0.5 / worldSize();
  return round(centerX01 - pointX01);
}

fn screenFromMercator(mercator01Hi : vec2<f32>, mercator01Lo : vec2<f32>, shiftX01 : f32) -> vec2<f32> {
  let delta01 = vec2<f32>(
    (mercator01Hi.x - camera.topLeft01.x) + (mercator01Lo.x - camera.topLeft01.z) + shiftX01,
    (mercator01Hi.y - camera.topLeft01.y) + (mercator01Lo.y - camera.topLeft01.w)
  );
  return delta01 * worldSize();
}

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) lineLocal : vec2<f32>,
  @location(1) halfLenAndWidth : vec2<f32>,
  @location(2) color : vec4<f32>,
};

@vertex
fn vsMain(
  @location(0) quad : vec2<f32>,
  @location(1) start01Hi : vec2<f32>,
  @location(2) start01Lo : vec2<f32>,
  @location(3) end01Hi : vec2<f32>,
  @location(4) end01Lo : vec2<f32>,
  @location(5) widthCss : f32,
  @location(6) color : vec4<f32>
) -> VSOut {
  var out : VSOut;

  let startX01 = start01Hi.x + start01Lo.x;
  let shiftX01 = worldShiftX(startX01);
  let startCss = screenFromMercator(start01Hi, start01Lo, shiftX01) * cameraScale();
  let endCss = screenFromMercator(end01Hi, end01Lo, shiftX01) * cameraScale();
  let delta = endCss - startCss;
  let len = length(delta);
  let safeLen = max(len, 0.0001);
  let dir = delta / safeLen;
  let normal = vec2<f32>(-dir.y, dir.x);
  let halfLen = len * 0.5;
  let halfWidth = max(widthCss, 1.0 / devicePixelRatio()) * 0.5;
  let aa = max(0.75 / devicePixelRatio(), 0.35);
  let extent = halfWidth + aa * 2.0;
  let center = (startCss + endCss) * 0.5;
  let lineLocal = vec2<f32>(quad.x * (halfLen + extent), quad.y * extent);
  let screenCss = center + dir * lineLocal.x + normal * lineLocal.y;
  let screen = screenCss / cameraScale();
  let ndc = vec2<f32>(
    screen.x / viewportSize().x * 2.0 - 1.0,
    1.0 - screen.y / viewportSize().y * 2.0
  );

  out.position = vec4<f32>(ndc, 0.0, 1.0);
  out.lineLocal = lineLocal;
  out.halfLenAndWidth = vec2<f32>(halfLen, halfWidth);
  out.color = color;
  return out;
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let closestX = clamp(in.lineLocal.x, -in.halfLenAndWidth.x, in.halfLenAndWidth.x);
  let dist = length(in.lineLocal - vec2<f32>(closestX, 0.0)) - in.halfLenAndWidth.y;
  let aa = max(0.75 / devicePixelRatio(), 0.35);
  let alpha = (1.0 - smoothstep(-aa, aa, dist)) * in.color.a;

  return vec4<f32>(in.color.rgb * alpha, alpha);
}
`;
