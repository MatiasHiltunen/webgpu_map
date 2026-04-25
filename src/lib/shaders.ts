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

@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var tileSampler : sampler;
@group(1) @binding(1) var tileTexture : texture_2d<f32>;
@group(1) @binding(2) var<uniform> tile : TileInfo;

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

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4<f32> {
  let c = textureSample(tileTexture, tileSampler, in.uv);
  return vec4<f32>(c.rgb, 1.0);
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
  let world = mercator01 * camera.worldSize + localPos * sizeCss;
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
