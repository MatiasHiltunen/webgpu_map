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

