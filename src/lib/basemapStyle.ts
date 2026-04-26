import { clamp } from './geo.js';
import type { DrawColor } from './drawtools.js';

export const BASEMAP_SHADER_PARAM_FLOATS = 12;
export const BASEMAP_EFFECT_PARAM_FLOATS = 20;

export type BasemapShaderParams = {
  /** Additive brightness in linear RGB-ish shader space. Useful range: -1..1. */
  readonly brightness?: number;
  /** Contrast multiplier around 0.5. Useful range: 0..4. */
  readonly contrast?: number;
  /** Saturation multiplier. 0 = grayscale, 1 = unchanged. */
  readonly saturation?: number;
  /** Gamma correction. Values above 1 darken midtones, below 1 lighten. */
  readonly gamma?: number;
  /** Hue rotation in radians. */
  readonly hueRotate?: number;
  /** Blend toward inverted colors. Useful range: 0..1. */
  readonly invert?: number;
  /** RGB tint color. Alpha is used as tintStrength when tintStrength is omitted. */
  readonly tintColor?: DrawColor;
  /** Blend toward color * tintColor. Useful range: 0..1. */
  readonly tintStrength?: number;
};

export type ResolvedBasemapShaderParams = {
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly gamma: number;
  readonly hueRotate: number;
  readonly invert: number;
  readonly tintColor: readonly [number, number, number];
  readonly tintStrength: number;
};

export type BasemapEffectsParams = {
  /** Pixel color affected by mask/bloom/relief, after basemap style adjustments. */
  readonly targetColor?: DrawColor;
  /** Euclidean RGB distance around targetColor. Useful range: 0..1. */
  readonly tolerance?: number;
  /** Feathering around tolerance. Useful range: 0..1. */
  readonly softness?: number;
  /** Bloom tint. Alpha is used as bloomIntensity when bloomIntensity is omitted. */
  readonly bloomColor?: DrawColor;
  /** Adds glow around pixels matching targetColor. */
  readonly bloomIntensity?: number;
  /** Local single-pass bloom radius in physical pixels. */
  readonly bloomRadius?: number;
  /** Render the color mask instead of the normal basemap. */
  readonly maskPreview?: boolean;
  /** Pseudo-3D relief strength derived from matching pixels. */
  readonly heightStrength?: number;
  /** Screen-space normal strength for the pseudo-3D relief. */
  readonly reliefStrength?: number;
  /** Directional light used by pseudo-3D relief. */
  readonly lightDirection?: readonly [number, number, number];
  readonly ambient?: number;
};

export type ResolvedBasemapEffectsParams = {
  readonly targetColor: readonly [number, number, number];
  readonly tolerance: number;
  readonly softness: number;
  readonly bloomColor: readonly [number, number, number];
  readonly bloomIntensity: number;
  readonly bloomRadius: number;
  readonly maskPreview: boolean;
  readonly heightStrength: number;
  readonly reliefStrength: number;
  readonly lightDirection: readonly [number, number, number];
  readonly ambient: number;
};

export const DEFAULT_BASEMAP_SHADER_PARAMS: ResolvedBasemapShaderParams = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  hueRotate: 0,
  invert: 0,
  tintColor: [1, 1, 1],
  tintStrength: 0
};

export const DEFAULT_BASEMAP_EFFECTS_PARAMS: ResolvedBasemapEffectsParams = {
  targetColor: [0.88, 0.86, 0.8],
  tolerance: 0.08,
  softness: 0.04,
  bloomColor: [0.35, 0.85, 1],
  bloomIntensity: 0,
  bloomRadius: 10,
  maskPreview: false,
  heightStrength: 0,
  reliefStrength: 4,
  lightDirection: [0.45, -0.6, 0.65],
  ambient: 0.62
};

export function resolveBasemapShaderParams(
  params: BasemapShaderParams = {},
  base: ResolvedBasemapShaderParams = DEFAULT_BASEMAP_SHADER_PARAMS
): ResolvedBasemapShaderParams {
  const tintColor = params.tintColor ?? base.tintColor;

  return {
    brightness: clamp(params.brightness ?? base.brightness, -1, 1),
    contrast: clamp(params.contrast ?? base.contrast, 0, 4),
    saturation: clamp(params.saturation ?? base.saturation, 0, 4),
    gamma: clamp(params.gamma ?? base.gamma, 0.1, 4),
    hueRotate: params.hueRotate ?? base.hueRotate,
    invert: clamp(params.invert ?? base.invert, 0, 1),
    tintColor: [
      clamp(tintColor[0], 0, 1),
      clamp(tintColor[1], 0, 1),
      clamp(tintColor[2], 0, 1)
    ],
    tintStrength: clamp(params.tintStrength ?? tintColor[3] ?? base.tintStrength, 0, 1)
  };
}

export function packBasemapShaderParams(
  params: ResolvedBasemapShaderParams,
  out = new Float32Array(BASEMAP_SHADER_PARAM_FLOATS)
): Float32Array {
  out[0] = params.brightness;
  out[1] = params.contrast;
  out[2] = params.saturation;
  out[3] = params.gamma;
  out[4] = params.tintColor[0];
  out[5] = params.tintColor[1];
  out[6] = params.tintColor[2];
  out[7] = params.tintStrength;
  out[8] = params.hueRotate;
  out[9] = params.invert;
  out[10] = 0;
  out[11] = 0;

  return out;
}

export function resolveBasemapEffectsParams(
  params: BasemapEffectsParams = {},
  base: ResolvedBasemapEffectsParams = DEFAULT_BASEMAP_EFFECTS_PARAMS
): ResolvedBasemapEffectsParams {
  const targetColor = params.targetColor ?? base.targetColor;
  const bloomColor = params.bloomColor ?? base.bloomColor;
  const light = normalizeLight(params.lightDirection ?? base.lightDirection);

  return {
    targetColor: [
      clamp(targetColor[0], 0, 1),
      clamp(targetColor[1], 0, 1),
      clamp(targetColor[2], 0, 1)
    ],
    tolerance: clamp(params.tolerance ?? base.tolerance, 0.001, 1),
    softness: clamp(params.softness ?? base.softness, 0.001, 1),
    bloomColor: [
      clamp(bloomColor[0], 0, 1),
      clamp(bloomColor[1], 0, 1),
      clamp(bloomColor[2], 0, 1)
    ],
    bloomIntensity: clamp(params.bloomIntensity ?? bloomColor[3] ?? base.bloomIntensity, 0, 4),
    bloomRadius: clamp(params.bloomRadius ?? base.bloomRadius, 0, 80),
    maskPreview: params.maskPreview ?? base.maskPreview,
    heightStrength: clamp(params.heightStrength ?? base.heightStrength, 0, 3),
    reliefStrength: clamp(params.reliefStrength ?? base.reliefStrength, 0, 24),
    lightDirection: light,
    ambient: clamp(params.ambient ?? base.ambient, 0, 1)
  };
}

export function packBasemapEffectsParams(
  params: ResolvedBasemapEffectsParams,
  out = new Float32Array(BASEMAP_EFFECT_PARAM_FLOATS),
  widthPx = 1,
  heightPx = 1
): Float32Array {
  out[0] = params.targetColor[0];
  out[1] = params.targetColor[1];
  out[2] = params.targetColor[2];
  out[3] = params.tolerance;
  out[4] = params.bloomColor[0];
  out[5] = params.bloomColor[1];
  out[6] = params.bloomColor[2];
  out[7] = params.bloomIntensity;
  out[8] = params.bloomRadius;
  out[9] = params.softness;
  out[10] = params.maskPreview ? 1 : 0;
  out[11] = params.heightStrength;
  out[12] = params.lightDirection[0];
  out[13] = params.lightDirection[1];
  out[14] = params.lightDirection[2];
  out[15] = params.ambient;
  out[16] = Math.max(1, widthPx);
  out[17] = Math.max(1, heightPx);
  out[18] = params.reliefStrength;
  out[19] = 0;

  return out;
}

function normalizeLight(v: readonly [number, number, number]): readonly [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;

  return [v[0] / len, v[1] / len, v[2] / len];
}
