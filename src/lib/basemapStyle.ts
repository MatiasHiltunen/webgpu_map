import { clamp } from './geo.js';
import type { DrawColor } from './drawtools.js';

export const BASEMAP_SHADER_PARAM_FLOATS = 12;

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
