# WebGPU Map Library

The project includes raster tile loader and basic map utilities to allow rendering the Map and it's utilities on a single Canvas element using WebGPU.

Check the demo to try out fe. postprocessing to select certain range of colors to pop-out on map and how to customize the standard OSM based tiles to fit any website's theme easily.

<img width="1721" height="1023" alt="Näyttökuva 2026-04-29 132532" src="https://github.com/user-attachments/assets/f6e5517f-1601-4256-bc09-2f257bd5baef" />
<img width="1920" height="1065" alt="la" src="https://github.com/user-attachments/assets/6c8a1794-2c65-49c2-a969-722ecd27fa2d" />

Check the live demo here: https://matiashiltunen.github.io/webgpu_map/
- Should work if webgpu is supported by your device


This project is based on the initial idea earlier that I got to work on for while before I got carried away with other stuff: https://github.com/Leaflet/Leaflet/discussions/9207

_This is still currently a prototype at best._

No runtime js-dependencies. The demo app is bundled with Vite 8.

The root package entry is intentionally small and only imports the basic raster
map pipeline:

```ts
import { WebGpuMap } from 'webgpu-map'

const map = new WebGpuMap({ canvas })
await map.init()
```

Optional drawing and basemap postprocess APIs live behind separate ES module
subpaths so consumers that only need the basic map do not import the extra WGSL
shader modules.

Minimal vector drawing is available through the same WebGPU canvas:

```ts
import { WebGpuMapWithFeatures, line, polygon } from 'webgpu-map/features'

const map = new WebGpuMapWithFeatures({ canvas })

map.setDrawGeometries([
  line([[24.9, 60.16], [25.0, 60.18]], { strokeColor: [0, 0.8, 1, 0.9], strokeWidth: 4 }),
  polygon([[[24.91, 60.14], [24.99, 60.14], [24.98, 60.2], [24.91, 60.14]]])
])

map.setGeoJson(featureCollection, {
  fillColor: [0, 0.6, 1, 0.2],
  strokeColor: [0, 0.8, 1, 0.9],
  markerColor: [1, 0.25, 0.1, 0.9]
})

map.setBasemapShaderParams({
  brightness: -0.04,
  contrast: 1.15,
  saturation: 0.65,
  tintColor: [0.82, 0.92, 1],
  tintStrength: 0.25
})

map.setBasemapEffects({
  targetColor: [0.88, 0.86, 0.8],
  tolerance: 0.08,
  softness: 0.04,
  bloomColor: [0.35, 0.85, 1],
  bloomIntensity: 0.8,
  bloomRadius: 12,
  heightStrength: 0.45,
  maskPreview: false
})
```

Development commands:

```sh
npm run dev
npm run build
```

Basemap effects render through an offscreen postprocess path. The current bloom
implementation creates a color mask from the selected basemap pixels and runs
separable blur passes before compositing it back to the map.


