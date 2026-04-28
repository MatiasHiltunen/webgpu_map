/** @internal Basemap postprocess shader bundle. */
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

