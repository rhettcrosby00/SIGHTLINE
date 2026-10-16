# MediaPipe Face Landmarker (Eye Check beta)

Served by Sightline itself so the camera frames never go to another server, and
loaded only when an athlete turns Eye Check on (`js/eye/index.js`). The service
worker saves these on first use in their own cache (`sightline-eye-v1`).

| File | From | SHA-256 |
|---|---|---|
| `vision_bundle.mjs` | npm `@mediapipe/tasks-vision@0.10.35` (source-map line removed) | |
| `vision_wasm_internal.js` | the same package, `wasm/` | |
| `vision_wasm_internal.wasm` | the same package, `wasm/` (the SIMD build; phones without WebAssembly SIMD get "Not on this phone") | `6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc` |
| `face_landmarker.task` | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |

License: Apache License 2.0 (Google). To update, replace the four files from a
newer package and model, then run `node tests/run.js` and the Eye Check screen
checks (`node tools/screens/cdp.mjs eye`).
