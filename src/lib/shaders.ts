/** @internal Exported for self-tests and reuse; not part of stable public API surface. */
export const TILE_WGSL = `
struct Camera {
  topLeftWorld : vec2<f32>,
  viewportSize : vec2<f32>,
  worldSize : f32,
  dpr : f32,
  zoom : f32,
  scale : f32,
};

struct TileInfo {
  originAndSize : vec4<f32>,
  uvOriginAndScale : vec4<f32>,
};

struct BasemapStyle {
  adjust : vec4<f32>,
  tint : vec4<f32>,
  extra : vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var tileSampler : sampler;
@group(1) @binding(1) var tileTexture : texture_2d<f32>;
@group(1) @binding(2) var<uniform> tile : TileInfo;
@group(1) @binding(3) var<uniform> basemap : BasemapStyle;

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vsMain(@location(0) pos : vec2<f32>, @location(1) uv : vec2<f32>) -> VSOut {
  var out : VSOut;
  let world = tile.originAndSize.xy + pos * tile.originAndSize.zw;
  let screen = world - camera.topLeftWorld;
  let ndc = vec2<f32>(
    screen.x / camera.viewportSize.x * 2.0 - 1.0,
    1.0 - screen.y / camera.viewportSize.y * 2.0
  );
  out.position = vec4<f32>(ndc, 0.0, 1.0);
  out.uv = tile.uvOriginAndScale.xy + uv * tile.uvOriginAndScale.zw;
  return out;
}

fn hueRotate(color : vec3<f32>, angle : f32) -> vec3<f32> {
  let k = vec3<f32>(0.57735026, 0.57735026, 0.57735026);
  let c = cos(angle);
  let s = sin(angle);
  return color * c + cross(k, color) * s + k * dot(k, color) * (1.0 - c);
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(tileTexture, tileSampler, in.uv);
  let brightness = basemap.adjust.x;
  let contrast = basemap.adjust.y;
  let saturation = basemap.adjust.z;
  let gamma = max(basemap.adjust.w, 0.001);
  let hue = basemap.extra.x;
  let invert = clamp(basemap.extra.y, 0.0, 1.0);
  var color = sampled.rgb;
  let luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));

  color = mix(vec3<f32>(luma), color, saturation);
  color = (color - vec3<f32>(0.5)) * contrast + vec3<f32>(0.5 + brightness);
  color = hueRotate(color, hue);
  color = mix(color, color * basemap.tint.rgb, clamp(basemap.tint.a, 0.0, 1.0));
  color = mix(color, vec3<f32>(1.0) - color, invert);
  color = pow(max(color, vec3<f32>(0.0)), vec3<f32>(gamma));

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

/** @internal */
export const MARKER_WGSL = `
struct Camera {
  topLeftWorld : vec2<f32>,
  viewportSize : vec2<f32>,
  worldSize : f32,
  dpr : f32,
  zoom : f32,
  scale : f32,
};

@group(0) @binding(0) var<uniform> camera : Camera;

fn wrapWorldX(world : vec2<f32>) -> vec2<f32> {
  let centerX = camera.topLeftWorld.x + camera.viewportSize.x * 0.5;
  let shift = round((centerX - world.x) / camera.worldSize) * camera.worldSize;
  return vec2<f32>(world.x + shift, world.y);
}

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) color : vec4<f32>,
};

@vertex
fn vsMain(
  @location(0) localPos : vec2<f32>,
  @location(1) mercator01 : vec2<f32>,
  @location(2) sizeCss : f32,
  @location(3) color : vec4<f32>
) -> VSOut {
  var out : VSOut;
  let world = wrapWorldX(mercator01 * camera.worldSize) + localPos * sizeCss / camera.scale;
  let screen = world - camera.topLeftWorld;
  let ndc = vec2<f32>(
    screen.x / camera.viewportSize.x * 2.0 - 1.0,
    1.0 - screen.y / camera.viewportSize.y * 2.0
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
  topLeftWorld : vec2<f32>,
  viewportSize : vec2<f32>,
  worldSize : f32,
  dpr : f32,
  zoom : f32,
  scale : f32,
};

@group(0) @binding(0) var<uniform> camera : Camera;

fn wrapWorldX(world : vec2<f32>) -> vec2<f32> {
  let centerX = camera.topLeftWorld.x + camera.viewportSize.x * 0.5;
  let shift = round((centerX - world.x) / camera.worldSize) * camera.worldSize;
  return vec2<f32>(world.x + shift, world.y);
}

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

@vertex
fn vsMain(
  @location(0) mercator01 : vec2<f32>,
  @location(1) offsetCss : vec2<f32>,
  @location(2) color : vec4<f32>
) -> VSOut {
  var out : VSOut;
  let world = wrapWorldX(mercator01 * camera.worldSize) + offsetCss / camera.scale;
  let screen = world - camera.topLeftWorld;
  let ndc = vec2<f32>(
    screen.x / camera.viewportSize.x * 2.0 - 1.0,
    1.0 - screen.y / camera.viewportSize.y * 2.0
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
  topLeftWorld : vec2<f32>,
  viewportSize : vec2<f32>,
  worldSize : f32,
  dpr : f32,
  zoom : f32,
  scale : f32,
};

@group(0) @binding(0) var<uniform> camera : Camera;

fn wrapWorldX(world : vec2<f32>) -> vec2<f32> {
  let centerX = camera.topLeftWorld.x + camera.viewportSize.x * 0.5;
  let shift = round((centerX - world.x) / camera.worldSize) * camera.worldSize;
  return vec2<f32>(world.x + shift, world.y);
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
  @location(1) start01 : vec2<f32>,
  @location(2) end01 : vec2<f32>,
  @location(3) widthCss : f32,
  @location(4) color : vec4<f32>
) -> VSOut {
  var out : VSOut;

  let startWorld = wrapWorldX(start01 * camera.worldSize);
  let endWorld = startWorld + (end01 - start01) * camera.worldSize;
  let startCss = (startWorld - camera.topLeftWorld) * camera.scale;
  let endCss = (endWorld - camera.topLeftWorld) * camera.scale;
  let delta = endCss - startCss;
  let len = length(delta);
  let safeLen = max(len, 0.0001);
  let dir = delta / safeLen;
  let normal = vec2<f32>(-dir.y, dir.x);
  let halfLen = len * 0.5;
  let halfWidth = max(widthCss, 1.0 / camera.dpr) * 0.5;
  let aa = max(0.75 / camera.dpr, 0.35);
  let extent = halfWidth + aa * 2.0;
  let center = (startCss + endCss) * 0.5;
  let lineLocal = vec2<f32>(quad.x * (halfLen + extent), quad.y * extent);
  let screenCss = center + dir * lineLocal.x + normal * lineLocal.y;
  let screen = screenCss / camera.scale;
  let ndc = vec2<f32>(
    screen.x / camera.viewportSize.x * 2.0 - 1.0,
    1.0 - screen.y / camera.viewportSize.y * 2.0
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
  let aa = max(0.75 / camera.dpr, 0.35);
  let alpha = (1.0 - smoothstep(-aa, aa, dist)) * in.color.a;

  return vec4<f32>(in.color.rgb * alpha, alpha);
}
`;
