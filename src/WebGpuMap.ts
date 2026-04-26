import {
  clamp,
  positiveModulo,
  lngToX01,
  latToY01,
  x01ToLng,
  y01ToLat,
  worldSize,
  integerTileZoom,
  formatTileUrl,
  fallbackForTile
} from './lib/geo.js';
import { createLruStore, type LruStore } from './lib/lru.js';
import { TILE_WGSL, MARKER_WGSL } from './lib/shaders.js';
// import { runMapLibSelfTests } from './lib/selfTest.js';
import type { FallbackTile } from './lib/geo.js';

type ResolvedWebGpuMapOptions = {
  canvas: HTMLCanvasElement;
  tileUrlTemplate: string;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  cacheLimit: number;
  prefetchMargin: number;
  maxMarkers: number;
  demoMarkers: number;
  runSelfTests: boolean;
  onStats: (stats: WebGpuMapStats) => void;
  tileRequestInit?: RequestInit;
  initialCenter?: { lat: number; lng: number } | { x01: number; y01: number };
  initialZoom?: number;
};

const DEFAULT_TILE_SIZE = 256;
const DEFAULT_MIN_ZOOM = 1;
const DEFAULT_MAX_ZOOM = 19;
const DEFAULT_CACHE_LIMIT = 768;
const DEFAULT_PREFETCH_MARGIN = 1;
const DEFAULT_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export type WebGpuMapStats = {
  zoom: number;
  tileZ: number;
  scaleToTileZ: number;
  centerLat: number;
  centerLng: number;
  visibleTileCount: number;
  fallbackDraws: number;
  cacheSize: number;
  inflightCount: number;
  markerCount: number;
};

export type WebGpuMapOptions = {
  /** The map draws here; a WebGPU context is used after `init()`. */
  canvas: HTMLCanvasElement;
  /** Raster tile URL template. Placeholders: `{z}`, `{x}`, `{y}`. */
  tileUrlTemplate?: string;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Max decoded tiles retained (LRU). */
  cacheLimit?: number;
  prefetchMargin?: number;
  maxMarkers?: number;
  /** Random demo markers (0 = off). */
  demoMarkers?: number;
  /** OSM and many providers expect no-cache for tile fetches. */
  tileRequestInit?: RequestInit;
  initialCenter?: { lat: number; lng: number } | { x01: number; y01: number };
  initialZoom?: number;
  /**
   * Called after each drawn frame with debug / HUD-friendly stats.
   * Hook up to your UI; omit to skip.
   */
  onStats?: (stats: WebGpuMapStats) => void;
  /**
   * Run `runMapLibSelfTests()` before requesting an adapter. Default true.
   * Set false in production if you want to skip the tiny self-check cost.
   */
  runSelfTests?: boolean;
};

type TileRec = {
  key: string;
  texture: GPUTexture | null;
  view: GPUTextureView | null;
  abort: AbortController;
  ready: boolean;
};

type VisibleTile = {
  key: string;
  z: number;
  x: number;
  worldX: number;
  y: number;
  originX: number;
  originY: number;
  u0: number;
  v0: number;
  uScale: number;
  vScale: number;
  fallback: boolean;
  uniformBuffer?: GPUBuffer;
  boundTextureKey?: string;
  bindGroup?: GPUBindGroup;
};

type MapCamera = {
  zoom: number;
  centerX01: number;
  centerY01: number;
};

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  vx: number;
  vy: number;
  startCenterX01: number;
  startCenterY01: number;
};

type PinchState = {
  startZoom: number;
  startDistance: number;
  startPointerX01: number;
  startPointerY01: number;
};

type PointerSample = { x: number; y: number };


// WebGPU + raster-tiles slippy map (MVP): pan, pinch zoom, wheel, kinetic scroll.
// Dispose with {@link WebGpuMap.destroy} when the canvas is torn down.
export class WebGpuMap {
  readonly canvas: HTMLCanvasElement;
  private readonly opts: ResolvedWebGpuMapOptions;

  private destroyed = false;
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;

  private cameraBindGroupLayout: GPUBindGroupLayout | null = null;
  private tileBindGroupLayout: GPUBindGroupLayout | null = null;
  private tilePipeline: GPURenderPipeline | null = null;
  private markerPipeline: GPURenderPipeline | null = null;
  private tileVertexBuffer: GPUBuffer | null = null;
  private markerVertexBuffer: GPUBuffer | null = null;
  private markerInstanceBuffer: GPUBuffer | null = null;
  private cameraBuffer: GPUBuffer | null = null;
  private cameraBindGroup: GPUBindGroup | null = null;
  private sampler: GPUSampler | null = null;

  private camera: MapCamera;
  private widthCss = 1;
  private heightCss = 1;
  private widthPx = 1;
  private heightPx = 1;
  private dpr = 1;
  private needsFrame = false;
  private raf = 0;
  private tileCache: LruStore<TileRec> | null = null;
  private visibleTiles: VisibleTile[] = [];
  private visibleSignature = '';
  private inflight = new Map<string, TileRec>();
  private markerCount = 0;
  private activePointers = new Map<number, PointerSample>();
  private drag: DragState | null = null;
  private pinch: PinchState | null = null;
  private kinetic = { raf: 0, vx: 0, vy: 0, lastTime: 0 };
  
  private readonly cameraUniform = new Float32Array(8);
  private readonly tileUniform = new Float32Array(8);

  private onResize: () => void;
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private onPointerCancel: (e: PointerEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onDblClick: (e: MouseEvent) => void;

  constructor(options: WebGpuMapOptions) {
    this.canvas = options.canvas;
    
    const initCenter = options.initialCenter ?? { lat: 60.1699, lng: 24.9384 };

    const cx =
      'lat' in initCenter
        ? lngToX01(initCenter.lng)
        : initCenter.x01;
        
    const cy =
      'lat' in initCenter
        ? latToY01(initCenter.lat)
        : initCenter.y01;
        
    this.camera = {
      zoom: options.initialZoom ?? 3,
      centerX01: cx,
      centerY01: cy
    };

    const resolved: ResolvedWebGpuMapOptions = {
      canvas: options.canvas,
      tileUrlTemplate: options.tileUrlTemplate ?? DEFAULT_OSM,
      tileSize: options.tileSize ?? DEFAULT_TILE_SIZE,
      minZoom: options.minZoom ?? DEFAULT_MIN_ZOOM,
      maxZoom: options.maxZoom ?? DEFAULT_MAX_ZOOM,
      cacheLimit: options.cacheLimit ?? DEFAULT_CACHE_LIMIT,
      prefetchMargin: options.prefetchMargin ?? DEFAULT_PREFETCH_MARGIN,
      maxMarkers: options.maxMarkers ?? 100_000,
      demoMarkers: options.demoMarkers ?? 0,
      runSelfTests: options.runSelfTests ?? true,
      onStats: options.onStats ?? (() => {}),
      tileRequestInit: options.tileRequestInit,
      initialCenter: options.initialCenter,
      initialZoom: options.initialZoom
    };
    
    this.opts = resolved;

    this.onResize = () => {
      this.resize();
      this.updateVisibleTiles();
      this.requestFrame();
    };
    
    this.onPointerDown = (e) => this.handlePointerDown(e);
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerUp = (e) => this.handlePointerUp(e);
    this.onPointerCancel = (e) => this.handlePointerCancel(e);
    this.onWheel = (e) => this.handleWheel(e);
    this.onDblClick = (e) => this.handleDblClick(e);
  }

  private tileZ(): number {
    return integerTileZoom(
      this.camera.zoom,
      this.opts.minZoom,
      this.opts.maxZoom
    );
  }

  private wz(z: number) {
    return worldSize(z, this.opts.tileSize);
  }

  private tileUrl(z: number, x: number, y: number) {
    return formatTileUrl(this.opts.tileUrlTemplate, z, x, y);
  }

  private resize() {
    if (this.device == null) return;
    
    this.dpr = window.devicePixelRatio || 1;
    
    this.widthCss = Math.max(1, this.canvas.clientWidth);
    this.heightCss = Math.max(1, this.canvas.clientHeight);
    
    this.widthPx = Math.max(1, Math.floor(this.widthCss * this.dpr));
    this.heightPx = Math.max(1, Math.floor(this.heightCss * this.dpr));

    const max = this.device.limits.maxTextureDimension2D;
    
    const nextWidth = Math.min(max, this.widthPx);
    const nextHeight = Math.min(max, this.heightPx);
    
    if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
    if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;
  }

  private configureCanvas() {
    if (
      this.context == null ||
      this.device == null ||
      this.format == null
    ) {
      return;
    }
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque'
    });
    this.resize();
  }

  private createBuffer(data: Float32Array, usage: GPUBufferUsageFlags) {
    if (this.device == null) throw new Error('WebGpuMap: device not ready');
    const buffer = this.device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }

  private createLayouts() {
    
    if (this.device == null) throw new Error('WebGpuMap: device not ready');

    this.cameraBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    });

    this.tileBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    });
  }

  private createPipelines() {
    if (
      this.device == null ||
      this.format == null ||
      this.cameraBindGroupLayout == null ||
      this.tileBindGroupLayout == null
    ) {
      throw new Error('WebGpuMap: not ready for pipelines');
    }

    const tileShader = this.device.createShaderModule({
      label: 'tile shader',
      code: TILE_WGSL
    });

    const markerShader = this.device.createShaderModule({
      label: 'marker shader',
      code: MARKER_WGSL
    });

    this.tilePipeline = this.device.createRenderPipeline({
      label: 'tile pipeline',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.cameraBindGroupLayout, this.tileBindGroupLayout]
      }),
      vertex: {
        module: tileShader,
        entryPoint: 'vsMain',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' }
            ]
          }
        ]
      },
      fragment: {
        module: tileShader,
        entryPoint: 'fsMain',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list' }
    });

    this.markerPipeline = this.device.createRenderPipeline({
      label: 'marker pipeline',
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.cameraBindGroupLayout]
      }),
      vertex: {
        module: markerShader,
        entryPoint: 'vsMain',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          {
            arrayStride: 32,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' },
              { shaderLocation: 2, offset: 8, format: 'float32' },
              { shaderLocation: 3, offset: 16, format: 'float32x4' }
            ]
          }
        ]
      },
      fragment: {
        module: markerShader,
        entryPoint: 'fsMain',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
            }
          }
        ]
      },
      primitive: { topology: 'triangle-list' }
    });
  }

  private createBuffers() {
    if (this.device == null) throw new Error('WebGpuMap: device not ready');
    const maxM = this.opts.maxMarkers;
    
    const tileVertices = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 1]);
    const markerQuad = new Float32Array([
      -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5
    ]);

    this.tileVertexBuffer = this.createBuffer(
      tileVertices,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    );

    this.markerVertexBuffer = this.createBuffer(
      markerQuad,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    );

    this.markerInstanceBuffer = this.device.createBuffer({
      label: 'marker instance buffer',
      size: maxM * 32,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    this.cameraBuffer = this.device.createBuffer({
      label: 'camera uniform buffer',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
  }

  private createBindGroups() {
    if (
      this.device == null ||
      this.cameraBindGroupLayout == null ||
      this.cameraBuffer == null
    ) {
      throw new Error('WebGpuMap: not ready for bind groups');
    }
    
    this.cameraBindGroup = this.device.createBindGroup({
      layout: this.cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }]
    });
  }

  private createDemoMarkers() {
    if (this.device == null || this.markerInstanceBuffer == null) return;

    const count = Math.min(this.opts.demoMarkers, this.opts.maxMarkers);
    const data = new Float32Array(count * 8);

    const centerLat = 60.1699;
    const centerLng = 24.9384;

    for (let i = 0; i < count; i++) {
      const lat = centerLat + (Math.random() - 0.5) * 10;
      const lng = centerLng + (Math.random() - 0.5) * 18;
      const o = i * 8;
      data[o + 0] = lngToX01(lng);
      data[o + 1] = latToY01(lat);
      data[o + 2] = 4 + Math.random() * 8;
      data[o + 3] = 0;
      data[o + 4] = 0.2 + Math.random() * 0.8;
      data[o + 5] = 0.4 + Math.random() * 0.6;
      data[o + 6] = 0.9;
      data[o + 7] = 0.75;
    }

    this.markerCount = count;
    
    if (count > 0) {
      this.device.queue.writeBuffer(this.markerInstanceBuffer, 0, data);
    }
  }

  private stopKinetic() {
    if (this.kinetic.raf) {
      cancelAnimationFrame(this.kinetic.raf);
      this.kinetic.raf = 0;
    }
    this.kinetic.vx = 0;
    this.kinetic.vy = 0;
    this.kinetic.lastTime = 0;
  }

  private requestFrame() {
    
    if (this.destroyed) return;
    
    this.needsFrame = true;
    
    if (this.raf) return;
    
    this.raf = requestAnimationFrame(() => {
      this.draw();
    });
  }

  private startKinetic(vx: number, vy: number) {
    
    this.stopKinetic();
    
    const minVelocity = 8;
    
    if (Math.hypot(vx, vy) < minVelocity) return;

    this.kinetic.vx = vx;
    this.kinetic.vy = vy;
    
    this.kinetic.lastTime = performance.now();

    const step = (now: number) => {
      
      if (this.destroyed) {
        this.stopKinetic();
        return;
      }
      
      const dt = Math.min(0.05, Math.max(0.001, (now - this.kinetic.lastTime) / 1000));
      this.kinetic.lastTime = now;

      const size = this.wz(this.camera.zoom);
      
      this.camera.centerX01 -= (this.kinetic.vx * dt) / size;
      this.camera.centerY01 = clamp(
        this.camera.centerY01 - (this.kinetic.vy * dt) / size,
        0,
        1
      );
      
      this.camera.centerX01 -= Math.floor(this.camera.centerX01);

      const decay = 0.9 ** (dt * 60);
      
      this.kinetic.vx *= decay;
      this.kinetic.vy *= decay;

      this.updateVisibleTiles();
      this.requestFrame();

      if (Math.hypot(this.kinetic.vx, this.kinetic.vy) >= minVelocity) {
        this.kinetic.raf = requestAnimationFrame(step);
      } else {
        this.stopKinetic();
      }
    };

    this.kinetic.raf = requestAnimationFrame(step);
  }

  private zoomAt(clientX: number, clientY: number, nextZoom: number) {
    if (this.destroyed) return;
    
    const minZ = this.opts.minZoom;
    const maxZ = this.opts.maxZoom;
    
    const oldZoom = this.camera.zoom;
    const zoom = clamp(nextZoom, minZ, maxZ);
    
    if (zoom === oldZoom) return;

    const oldSize = this.wz(oldZoom);
    const nextSize = this.wz(zoom);
    
    const oldTopLeftX = this.camera.centerX01 * oldSize - this.widthCss / 2;
    const oldTopLeftY = this.camera.centerY01 * oldSize - this.heightCss / 2;

    const pointerWorldX = oldTopLeftX + clientX;
    const pointerWorldY = oldTopLeftY + clientY;
    
    const pointerX01 = pointerWorldX / oldSize;
    const pointerY01 = pointerWorldY / oldSize;
    
    const nextTopLeftX = pointerX01 * nextSize - clientX;
    const nextTopLeftY = pointerY01 * nextSize - clientY;

    this.camera.zoom = zoom;
    this.camera.centerX01 = (nextTopLeftX + this.widthCss / 2) / nextSize;
    this.camera.centerY01 = clamp(
      (nextTopLeftY + this.heightCss / 2) / nextSize,
      0,
      1
    );
    this.camera.centerX01 -= Math.floor(this.camera.centerX01);

    this.updateVisibleTiles();
    this.requestFrame();
  }

  private startPinch() {
    const points = Array.from(this.activePointers.values());
    
    if (points.length < 2) return;

    this.stopKinetic();
    this.drag = null;

    const a = points[0]!;
    const b = points[1]!;
    
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const size = this.wz(this.camera.zoom);
    
    const topLeftX = this.camera.centerX01 * size - this.widthCss / 2;
    const topLeftY = this.camera.centerY01 * size - this.heightCss / 2;

    this.pinch = {
      startZoom: this.camera.zoom,
      startDistance: distance,
      startPointerX01: (topLeftX + mid.x) / size,
      startPointerY01: (topLeftY + mid.y) / size
    };
  }

  private updatePinch() {
    if (!this.pinch || this.activePointers.size < 2) return;

    const points = Array.from(this.activePointers.values());
    
    const a = points[0]!;
    const b = points[1]!;
    
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    
    const zoomDelta = Math.log2(distance / this.pinch.startDistance);

    const minZ = this.opts.minZoom;
    const maxZ = this.opts.maxZoom;
    
    const nextZoom = clamp(this.pinch.startZoom + zoomDelta, minZ, maxZ);
    const nextSize = this.wz(nextZoom);

    const nextTopLeftX = this.pinch.startPointerX01 * nextSize - mid.x;
    const nextTopLeftY = this.pinch.startPointerY01 * nextSize - mid.y;

    this.camera.zoom = nextZoom;
    this.camera.centerX01 = (nextTopLeftX + this.widthCss / 2) / nextSize;
    this.camera.centerY01 = clamp(
      (nextTopLeftY + this.heightCss / 2) / nextSize,
      0,
      1
    );
    this.camera.centerX01 -= Math.floor(this.camera.centerX01);

    this.updateVisibleTiles();
    this.requestFrame();
  }

  private updateCameraUniform() {
    if (this.device == null || this.cameraBuffer == null) return;

    const tileZ = this.tileZ();
    const renderSize = this.wz(this.camera.zoom);
    const tileWorldSize = this.wz(tileZ);
    const scale = renderSize / tileWorldSize;
    
    const cx = this.camera.centerX01 * tileWorldSize;
    const cy = this.camera.centerY01 * tileWorldSize;
    
    const virtualWidth = this.widthCss / scale;
    const virtualHeight = this.heightCss / scale;

    this.cameraUniform[0] = cx - virtualWidth / 2;
    this.cameraUniform[1] = cy - virtualHeight / 2;
    this.cameraUniform[2] = virtualWidth;
    this.cameraUniform[3] = virtualHeight;
    this.cameraUniform[4] = tileWorldSize;
    this.cameraUniform[5] = this.dpr;
    this.cameraUniform[6] = this.camera.zoom;
    this.cameraUniform[7] = scale;

    this.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraUniform);
  }

  private ensureFallbackParents(tiles: VisibleTile[]) {
    const minZ = this.opts.minZoom;
    const requested = new Set<string>();
    
    for (const tile of tiles) {
      for (let parentZ = tile.z - 1; parentZ >= Math.max(minZ, tile.z - 3); parentZ--) {

        const parent = fallbackForTile(tile, parentZ);
        
        if (requested.has(parent.key)) continue;
        
        requested.add(parent.key);
        
        this.ensureTile({
          key: parent.key,
          z: parent.z,
          x: parent.x,
          y: parent.y
        });
      }
    }
  }

  private findFallbackTile(tile: VisibleTile): FallbackTile | null {

    const minZ = this.opts.minZoom;
    
    for (let parentZ = tile.z - 1; parentZ >= minZ; parentZ--) {
      
      const parent = fallbackForTile(tile, parentZ);
      
      const rec = this.tileCache?.get(parent.key);
      
      if (rec && rec.ready && rec.view) return parent;
    }
    
    return null;
  }

  private updateVisibleTiles() {
    if (this.tileCache == null) return;

    const minZ = this.opts.minZoom;
    const maxZ = this.opts.maxZoom;
    
    const margin = this.opts.prefetchMargin;
    
    const tileSize = this.opts.tileSize;
    const tileZ = integerTileZoom(this.camera.zoom, minZ, maxZ);
    
    const renderSize = this.wz(this.camera.zoom);
    const tileWorldSize = this.wz(tileZ);
    
    const scale = renderSize / tileWorldSize;
    const virtualWidth = this.widthCss / scale;
    const virtualHeight = this.heightCss / scale;
    
    const topLeftX = this.camera.centerX01 * tileWorldSize - virtualWidth / 2;
    const topLeftY = this.camera.centerY01 * tileWorldSize - virtualHeight / 2;

    const minTileX = Math.floor(topLeftX / tileSize) - margin;
    const maxTileX = Math.floor((topLeftX + virtualWidth - 1) / tileSize) + margin;
    const minTileY = Math.floor(topLeftY / tileSize) - margin;
    const maxTileY = Math.floor((topLeftY + virtualHeight - 1) / tileSize) + margin;

    const tileCount = 1 << tileZ;
    
    const next: VisibleTile[] = [];

    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        
        if (y < 0 || y >= tileCount) continue;
        
        const wrappedX = positiveModulo(x, tileCount);
        
        const key = String(tileZ) + '/' + String(wrappedX) + '/' + String(y);

        next.push({
          key,
          z: tileZ,
          x: wrappedX,
          worldX: x,
          y,
          originX: x * tileSize,
          originY: y * tileSize,
          u0: 0,
          v0: 0,
          uScale: 1,
          vScale: 1,
          fallback: false
        });
      }
    }

    const signature = next.map((t) => t.key + '@' + t.originX + ',' + t.originY).join('|');

    if (signature === this.visibleSignature) return;

    for (const oldTile of this.visibleTiles) {
      if (oldTile.uniformBuffer) oldTile.uniformBuffer.destroy();
    }

    this.visibleSignature = signature;
    this.visibleTiles = next;
    
    for (const tile of next) this.ensureTile(tile);
    
    this.ensureFallbackParents(next);
  }

  private ensureTile(tile: { key: string; z: number; x: number; y: number }) {
    if (this.tileCache == null || this.device == null) return;
    if (this.tileCache.get(tile.key)) return;
    if (this.inflight.has(tile.key)) return;

    const rec: TileRec = {
      key: tile.key,
      texture: null,
      view: null,
      abort: new AbortController(),
      ready: false
    };
    
    this.inflight.set(tile.key, rec);

    const reqInit: RequestInit = {
      ...this.opts.tileRequestInit,
      signal: rec.abort.signal
    };

    fetch(this.tileUrl(tile.z, tile.x, tile.y), reqInit)
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + String(response.status));
        return response.bytes();
      })
      .then((bytes) => {


        return createImageBitmap(new Blob([bytes], {type: "image/png"}))


      })
      .then((bitmap) => {
        if (this.destroyed || !this.inflight.has(tile.key)) {
          if (bitmap.close) bitmap.close();
          return;
        }
        if (this.device == null) {
          if (bitmap.close) bitmap.close();
          return;
        }

        const texture = this.device.createTexture({
          size: [bitmap.width, bitmap.height],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.device.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture },
          [bitmap.width, bitmap.height]
        );
        if (bitmap.close) bitmap.close();

        rec.texture = texture;
        rec.view = texture.createView();
        rec.ready = true;
        this.inflight.delete(tile.key);
        this.tileCache?.set(tile.key, rec);
        this.requestFrame();
      })
      .catch((err: unknown) => {
        this.inflight.delete(tile.key);
        if (rec.abort.signal.aborted) return;
        console.warn('Tile failed', tile.key, err);
      });
  }

  private draw() {
    this.raf = 0;
    if (this.destroyed) return;
    if (!this.needsFrame) return;
    this.needsFrame = false;

    if (
      this.device == null ||
      this.context == null ||
      this.format == null ||
      this.tilePipeline == null ||
      this.cameraBindGroup == null ||
      this.tileVertexBuffer == null ||
      this.sampler == null ||
      this.tileBindGroupLayout == null
    ) {
      return;
    }

    this.resize();
    this.updateCameraUniform();

    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();
    
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.08, g: 0.08, b: 0.08, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });

    pass.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    pass.setBindGroup(0, this.cameraBindGroup);

    pass.setPipeline(this.tilePipeline);
    pass.setVertexBuffer(0, this.tileVertexBuffer);
    
    let fallbackDraws = 0;

    for (const tile of this.visibleTiles) {
      
      let drawTile: {
        u0: number;
        v0: number;
        uScale: number;
        vScale: number;
        key: string;
        originX: number;
        originY: number;
        fallback: boolean;
      } = tile;
      
      let rec = this.tileCache?.get(tile.key);

      if (rec == null || !rec.ready || rec.view == null) {
        const fallback = this.findFallbackTile(tile);
        
        if (fallback == null) continue;
        
        rec = this.tileCache?.get(fallback.key);
        
        if (rec == null || !rec.ready || rec.view == null) continue;
        
        drawTile = {
          key: tile.key + '->' + fallback.key,
          originX: tile.originX,
          originY: tile.originY,
          u0: fallback.u0,
          v0: fallback.v0,
          uScale: fallback.uScale,
          vScale: fallback.vScale,
          fallback: true
        };
        
        fallbackDraws++;
      }

      if (!rec.view) continue;

      if (!tile.uniformBuffer || tile.boundTextureKey !== rec.key) {
        
        if (tile.uniformBuffer) tile.uniformBuffer.destroy();
        
        tile.uniformBuffer = this.device.createBuffer({
          label: 'tile uniform ' + tile.key,
          size: 32,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        tile.boundTextureKey = rec.key;
        
        tile.bindGroup = this.device.createBindGroup({
          layout: this.tileBindGroupLayout,
          entries: [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: rec.view },
            { binding: 2, resource: { buffer: tile.uniformBuffer } }
          ]
        });
      }

      if (tile.uniformBuffer == null || tile.bindGroup == null) continue;

      const ts = this.opts.tileSize;
      
      this.tileUniform[0] = tile.originX;
      this.tileUniform[1] = tile.originY;
      this.tileUniform[2] = ts;
      this.tileUniform[3] = ts;
      this.tileUniform[4] = drawTile.u0;
      this.tileUniform[5] = drawTile.v0;
      this.tileUniform[6] = drawTile.uScale;
      this.tileUniform[7] = drawTile.vScale;
      
      this.device.queue.writeBuffer(tile.uniformBuffer, 0, this.tileUniform);

      pass.setBindGroup(1, tile.bindGroup);
      pass.draw(6, 1, 0, 0);
    }

    if (this.markerCount > 0 && this.markerPipeline && this.markerVertexBuffer && this.markerInstanceBuffer) {

      pass.setPipeline(this.markerPipeline);
      pass.setVertexBuffer(0, this.markerVertexBuffer);
      pass.setVertexBuffer(1, this.markerInstanceBuffer);
      pass.draw(6, this.markerCount, 0, 0);
      
    }

    pass.end();
    
    this.device.queue.submit([encoder.finish()]);

    const zInt = this.tileZ();
    const scaleToTileZ = 2 ** (this.camera.zoom - zInt);
    
    this.opts.onStats({
      zoom: this.camera.zoom,
      tileZ: zInt,
      scaleToTileZ,
      centerLat: y01ToLat(this.camera.centerY01),
      centerLng: x01ToLng(this.camera.centerX01),
      visibleTileCount: this.visibleTiles.length,
      fallbackDraws,
      cacheSize: this.tileCache?.size ?? 0,
      inflightCount: this.inflight.size,
      markerCount: this.markerCount
    });
  }

  private installEvents() {
    
    window.addEventListener('resize', this.onResize);
    
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.onDblClick);
    
  }

  private handlePointerDown(event: PointerEvent) {
    
    this.stopKinetic();
    this.canvas.setPointerCapture(event.pointerId);
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size >= 2) {
      this.startPinch();
      return;
    }

    this.pinch = null;
    
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
      vx: 0,
      vy: 0,
      startCenterX01: this.camera.centerX01,
      startCenterY01: this.camera.centerY01
    };
    
  }

  private handlePointerMove(event: PointerEvent) {
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (this.pinch && this.activePointers.size >= 2) {
      this.updatePinch();
      return;
    }

    if (this.drag == null || this.drag.pointerId !== event.pointerId) return;

    const now = performance.now();
    const size = this.wz(this.camera.zoom);
    
    const dx = event.clientX - this.drag.x;
    const dy = event.clientY - this.drag.y;
    const dt = Math.max(0.001, (now - this.drag.lastTime) / 1000);
    
    this.drag.vx = (event.clientX - this.drag.lastX) / dt;
    this.drag.vy = (event.clientY - this.drag.lastY) / dt;
    
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
    
    this.drag.lastTime = now;
    
    this.camera.centerX01 = this.drag.startCenterX01 - dx / size;

    this.camera.centerY01 = clamp(
      this.drag.startCenterY01 - dy / size,
      0,
      1
    );
    
    this.camera.centerX01 -= Math.floor(this.camera.centerX01);

    this.updateVisibleTiles();
    this.requestFrame();
  }

  private handlePointerUp(event: PointerEvent) {
    this.activePointers.delete(event.pointerId);

    if (this.pinch) {
      this.pinch = null;
      this.drag = null;
      return;
    }

    if (this.drag && this.drag.pointerId === event.pointerId) {
      const vx = this.drag.vx;
      const vy = this.drag.vy;
      this.drag = null;
      this.startKinetic(vx, vy);
    }
  }

  private handlePointerCancel(event: PointerEvent) {
    
    this.activePointers.delete(event.pointerId);
    this.pinch = null;
    
    if (this.drag && this.drag.pointerId === event.pointerId) this.drag = null;

    this.stopKinetic();
  }

  private handleWheel(event: WheelEvent) {
    event.preventDefault();
    
    this.stopKinetic();
    
    this.zoomAt(
      event.clientX,
      event.clientY,
      this.camera.zoom + -event.deltaY * 0.0025
    );
  }

  private handleDblClick(event: MouseEvent) {
    event.preventDefault();
    
    this.stopKinetic();
    
    this.zoomAt(
      event.clientX,
      event.clientY,
      Math.floor(this.camera.zoom + 1)
    );
  }

  
  // Request adapter/device, build pipelines, start tile streaming and input. 
  async init(): Promise<void> {
    if (this.destroyed) throw new Error('WebGpuMap: cannot init after destroy');
    if (this.device != null) throw new Error('WebGpuMap: init() already called');

    // if (this.opts.runSelfTests) {
    //   runMapLibSelfTests();
    // }

    if (!window.isSecureContext) {
      throw new Error(
        'WebGPU requires a secure context. Open this from https:// or http://localhost, not a plain file:// URL.'
      );
    }

    if (navigator.gpu == null) {
      throw new Error(
        'WebGPU is not available in this browser. Try Chrome or Edge with hardware acceleration enabled.'
      );
    }

    // Chrome on Windows ARM64 shows that the adapter is available 
    // but the requestAdapter call returns null unless unsafe gpu feature flag is enabled
    let adapter =
      (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) ?? null;

    if (adapter == null) {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    }

    if (adapter == null) {
      adapter = await navigator.gpu.requestAdapter();
    }

    if (adapter == null) {
      throw new Error(
        [
          'Could not acquire a WebGPU adapter. Possible causes:',
          '',
          '1. Hardware acceleration is disabled in the browser.',
          '2. The GPU/driver is blocklisted or unavailable.',
          '3. The page is not running from localhost or HTTPS.',
          '4. WebGPU is disabled by browser flags or policy.'
        ].join('\n')
      );
    }

    this.adapter = adapter;
    
    this.device = await this.adapter.requestDevice();
    
    this.context = this.canvas.getContext('webgpu');

    if (this.context == null) {
      throw new Error('Could not acquire WebGPU canvas context.');
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.configureCanvas();
    this.createLayouts();
    this.createPipelines();
    this.createBuffers();
    this.createBindGroups();
    this.createDemoMarkers();
    
    this.installEvents();

    this.tileCache = createLruStore<TileRec>(this.opts.cacheLimit, (rec) => {
      if (rec.abort) rec.abort.abort();
      if (rec.texture) rec.texture.destroy();
    });

    for (const [_, rec] of this.inflight) {
      rec.abort.abort();
    }

    this.inflight.clear();

    this.updateVisibleTiles();
    this.requestFrame();
  }

  
  // Tears down GPU resources, cancels work, and removes DOM listeners. Idempotent.
  destroy() {
    if (this.destroyed) return;
    
    this.destroyed = true;

    this.stopKinetic();
    
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    window.removeEventListener('resize', this.onResize);
    
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('dblclick', this.onDblClick);

    for (const [, rec] of this.inflight) {
      rec.abort.abort();
    }
    this.inflight.clear();

    for (const t of this.visibleTiles) {
      if (t.uniformBuffer) t.uniformBuffer.destroy();
    }
    
    this.visibleTiles = [];
    this.visibleSignature = '';

    this.tileCache?.clear();
    this.tileCache = null;

    if (this.context) {
      this.context.unconfigure();
      this.context = null;
    }

    this.tileVertexBuffer?.destroy();
    this.markerVertexBuffer?.destroy();
    this.markerInstanceBuffer?.destroy();
    this.cameraBuffer?.destroy();
    this.tileVertexBuffer = null;
    this.markerVertexBuffer = null;
    this.markerInstanceBuffer = null;
    this.cameraBuffer = null;

    this.device?.destroy();
    this.device = null;
    this.adapter = null;
    this.format = null;
    this.tilePipeline = null;
    this.markerPipeline = null;
    this.cameraBindGroup = null;
    this.cameraBindGroupLayout = null;
    this.tileBindGroupLayout = null;
    this.sampler = null;
  }
}
