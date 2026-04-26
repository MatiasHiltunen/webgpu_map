/** @internal Exported for self-tests and reuse; not part of stable public API surface. */
export const TILE_WGSL = `
struct Camera {
  topLeft01 : vec4<f32>,
  viewport : vec4<f32>,
  view : vec4<f32>,
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
  let screen = tile.originAndSize.xy + pos * tile.originAndSize.zw;
  let ndc = vec2<f32>(
    screen.x / camera.viewport.x * 2.0 - 1.0,
    1.0 - screen.y / camera.viewport.y * 2.0
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
export const BASEMAP_COMPOSITE_WGSL = `
struct BasemapEffects {
  targetColor : vec4<f32>,
  bloom : vec4<f32>,
  shape : vec4<f32>,
  light : vec4<f32>,
  viewport : vec4<f32>,
};

@group(0) @binding(0) var compositeSampler : sampler;
@group(0) @binding(1) var basemapTexture : texture_2d<f32>;
@group(0) @binding(2) var<uniform> effects : BasemapEffects;
@group(0) @binding(3) var bloomTexture : texture_2d<f32>;

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex : u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out : VSOut;
  let pos = positions[vertexIndex];
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = pos * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out;
}

fn maskForColor(color : vec3<f32>) -> f32 {
  let tolerance = max(effects.targetColor.a, 0.001);
  let softness = max(effects.shape.y, 0.001);
  let d = distance(color, effects.targetColor.rgb);
  return 1.0 - smoothstep(tolerance - softness, tolerance + softness, d);
}

fn sampleColor(uv : vec2<f32>) -> vec3<f32> {
  return textureSample(basemapTexture, compositeSampler, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0))).rgb;
}

fn sampleMask(uv : vec2<f32>) -> f32 {
  return maskForColor(sampleColor(uv));
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let size = max(effects.viewport.xy, vec2<f32>(1.0));
  let texel = vec2<f32>(1.0) / size;
  let color = sampleColor(in.uv);
  let mask = sampleMask(in.uv);
  let bloomIntensity = effects.bloom.a;
  let heightStrength = effects.shape.w;
  let reliefStrength = effects.viewport.z;
  let bloom = textureSample(bloomTexture, compositeSampler, in.uv).rgb;

  let hL = sampleMask(in.uv - vec2<f32>(texel.x, 0.0)) * heightStrength;
  let hR = sampleMask(in.uv + vec2<f32>(texel.x, 0.0)) * heightStrength;
  let hU = sampleMask(in.uv - vec2<f32>(0.0, texel.y)) * heightStrength;
  let hD = sampleMask(in.uv + vec2<f32>(0.0, texel.y)) * heightStrength;
  let normal = normalize(vec3<f32>((hL - hR) * reliefStrength, (hU - hD) * reliefStrength, 1.0));
  let light = normalize(effects.light.xyz);
  let shade = effects.light.a + max(dot(normal, light), 0.0) * (1.0 - effects.light.a);
  var outColor = color;

  if (heightStrength > 0.0) {
    outColor *= mix(1.0, shade, mask);
    outColor += vec3<f32>(0.035) * mask * heightStrength;
  }

  outColor += bloom * bloomIntensity;

  if (effects.shape.z > 0.5) {
    let preview = mix(vec3<f32>(0.035, 0.04, 0.045), effects.bloom.rgb, mask);
    return vec4<f32>(preview + bloom * 0.25, 1.0);
  }

  return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

/** @internal */
export const BASEMAP_MASK_WGSL = `
struct BasemapEffects {
  targetColor : vec4<f32>,
  bloom : vec4<f32>,
  shape : vec4<f32>,
  light : vec4<f32>,
  viewport : vec4<f32>,
};

@group(0) @binding(0) var compositeSampler : sampler;
@group(0) @binding(1) var basemapTexture : texture_2d<f32>;
@group(0) @binding(2) var<uniform> effects : BasemapEffects;

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex : u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out : VSOut;
  let pos = positions[vertexIndex];
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = pos * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out;
}

fn maskForColor(color : vec3<f32>) -> f32 {
  let tolerance = max(effects.targetColor.a, 0.001);
  let softness = max(effects.shape.y, 0.001);
  let d = distance(color, effects.targetColor.rgb);
  return 1.0 - smoothstep(tolerance - softness, tolerance + softness, d);
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let color = textureSample(basemapTexture, compositeSampler, in.uv).rgb;
  let mask = maskForColor(color);
  return vec4<f32>(effects.bloom.rgb * mask, mask);
}
`;

function blurWgsl(direction: 'x' | 'y') {
  const dir = direction === 'x' ? 'vec2<f32>(1.0, 0.0)' : 'vec2<f32>(0.0, 1.0)';

  return `
struct BasemapEffects {
  targetColor : vec4<f32>,
  bloom : vec4<f32>,
  shape : vec4<f32>,
  light : vec4<f32>,
  viewport : vec4<f32>,
};

@group(0) @binding(0) var compositeSampler : sampler;
@group(0) @binding(1) var sourceTexture : texture_2d<f32>;
@group(0) @binding(2) var<uniform> effects : BasemapEffects;

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex : u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out : VSOut;
  let pos = positions[vertexIndex];
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = pos * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out;
}

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let size = max(effects.viewport.xy, vec2<f32>(1.0));
  let radius = max(effects.shape.x, 0.0);
  let stepUv = ${dir} * radius / size;
  var color = textureSample(sourceTexture, compositeSampler, in.uv).rgba * 0.227027;
  color += textureSample(sourceTexture, compositeSampler, clamp(in.uv + stepUv * 0.384615, vec2<f32>(0.0), vec2<f32>(1.0))).rgba * 0.316216;
  color += textureSample(sourceTexture, compositeSampler, clamp(in.uv - stepUv * 0.384615, vec2<f32>(0.0), vec2<f32>(1.0))).rgba * 0.316216;
  color += textureSample(sourceTexture, compositeSampler, clamp(in.uv + stepUv * 1.384615, vec2<f32>(0.0), vec2<f32>(1.0))).rgba * 0.070270;
  color += textureSample(sourceTexture, compositeSampler, clamp(in.uv - stepUv * 1.384615, vec2<f32>(0.0), vec2<f32>(1.0))).rgba * 0.070270;
  return color;
}
`;
}

/** @internal */
export const BASEMAP_BLUR_X_WGSL = blurWgsl('x');

/** @internal */
export const BASEMAP_BLUR_Y_WGSL = blurWgsl('y');

/** @internal */
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
