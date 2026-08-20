# MediaPipe Hand Detection Boilerplate

A minimal web starting point for hand-detection apps. No build step, no npm
install — plain HTML + ES modules loading MediaPipe from a CDN.

## Run

Serve the folder over HTTP (the webcam and ES modules need a real origin):

```
python -m http.server 8000
```

Then open http://localhost:8000, pick a project, and click **Start camera**.

## Files

- [index.html](index.html) — the project picker.
- [handTracker.js](handTracker.js) — the reusable part. Loads the model, owns
  the webcam and the detection loop, calls `onResults` per frame.
- [style.css](style.css) — shared styles, including the mirrored video stage.
- [apps/hand-detection/](apps/hand-detection/) — landmark overlay and hand count.
- [apps/violin/](apps/violin/) — air violin: left hand picks the note by
  height, right hand is the bow and only sounds while it moves.

## Building a new app on this

Add `apps/<name>/index.html` and `apps/<name>/app.js`, link them from the root
picker, and reference the shared files as `../../handTracker.js` and
`../../style.css`. In `app.js`, keep `handTracker.js` as-is and write your own
`onResults`:

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
