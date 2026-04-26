# Experimental WebGPU Map renderer

This demo is based on the initial idea earlier that I got to work on a while before I got carried away with other stuff: https://github.com/Leaflet/Leaflet/discussions/9207

_This is still currently a prototype at best._

No runtime js-dependencies.

Minimal vector drawing is available through the same WebGPU canvas:

```ts
import { WebGpuMap, line, polygon } from 'webgpu-map'

const map = new WebGpuMap({ canvas })

map.setDrawGeometries([
  line([[24.9, 60.16], [25.0, 60.18]], { strokeColor: [0, 0.8, 1, 0.9], strokeWidth: 4 }),
  polygon([[[24.91, 60.14], [24.99, 60.14], [24.98, 60.2], [24.91, 60.14]]])
])

map.setGeoJson(featureCollection, {
  fillColor: [0, 0.6, 1, 0.2],
  strokeColor: [0, 0.8, 1, 0.9],
  markerColor: [1, 0.25, 0.1, 0.9]
})

```

Check the live demo here: https://matiashiltunen.github.io/webgpu_map/
- Should work if webgpu is supported by your device
