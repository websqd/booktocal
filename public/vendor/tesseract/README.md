# Vendored OCR engine

Loaded only when someone adds an image (or a scanned PDF); see `ocrImage` in
`../intake.js`. Everything runs in a same-origin Web Worker — images are never
uploaded.

| File | Source | License |
| --- | --- | --- |
| `tesseract.min.js`, `worker.min.js` | npm `tesseract.js` 7.0.0, `dist/` | Apache-2.0 |
| `tesseract-core-simd-lstm.wasm.js` | npm `tesseract.js-core` 7.0.0 | Apache-2.0 |
| `lang/eng.traineddata.gz` | npm `@tesseract.js-data/eng` 1.0.0, `4.0.0_best_int/` | Apache-2.0 |

Refresh: `npm i --no-save tesseract.js @tesseract.js-data/eng` and copy the
files above. Only the SIMD LSTM core is shipped (every current browser has
WebAssembly SIMD); `corePath` in `intake.js` points at that one file.
