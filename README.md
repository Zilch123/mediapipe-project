# MediaPipe Hand Detection Boilerplate

A minimal web starting point for hand-detection apps. No build step, no npm
install — plain HTML + ES modules loading MediaPipe from a CDN.

## Run

Serve the folder over HTTP (the webcam and ES modules need a real origin):

```
python -m http.server 8000
```

Then open http://localhost:8000 and click **Start camera**.

## Files

- [index.html](index.html) — markup: video, overlay canvas, controls.
- [style.css](style.css) — layout for the mirrored video/canvas stage.
- [handTracker.js](handTracker.js) — the reusable part. Loads the model, owns
  the webcam and the detection loop, calls `onResults` per frame.
- [app.js](app.js) — the demo: draws landmarks and counts hands.

## Building a new app on this

Keep `handTracker.js`, replace `handleResults` in `app.js`:

```js
const tracker = new HandTracker(video, { numHands: 1 });
tracker.onResults = (result) => {
  // result.landmarks      -> [hand][21] normalized {x, y, z}
  // result.worldLandmarks -> [hand][21] metric coords in meters
  // result.handedness     -> [hand][0].categoryName === 'Left' | 'Right'
};
await tracker.initialize();
await tracker.start();
```

Landmark indices: 0 wrist, 4 thumb tip, 8 index tip, 12 middle tip, 16 ring
tip, 20 pinky tip.

Options can be changed at runtime with
`tracker.setOptions({ numHands, minHandDetectionConfidence, minHandPresenceConfidence, minTrackingConfidence })`.
