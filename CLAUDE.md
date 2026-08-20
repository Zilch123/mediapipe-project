
# What is this project? 
this project is a sample project to learn how to vibe code. 

# Rules: 
1. Keep it simple 
2. Use only html, css, js 
3. Use only web mediapipe 
4. Reuse handTracker.js code, per-app logic goes app.js 

# New apps
Each app lives in its own folder under apps/, with its own index.html and app.js.
Shared code stays at the root: handTracker.js and style.css. Apps reference them as ../../handTracker.js and ../../style.css.
The root index.html is the project picker — add a button there for every new app.

# Mirroring
style.css flips both #webcam and #output with `transform: scaleX(-1)`.
Drawing landmarks works as-is, since the canvas is mirrored along with the video.
But anything else drawn on that canvas comes out backwards — text especially.
Landmark x values are NOT mirrored: to compare them against screen or DOM positions, use `1 - x`.

# Running
Serve over HTTP: `python -m http.server 8000`
Opening index.html as a file:// URL will not work — ES modules and the webcam both need a real origin.

# Verifying
Webcam behavior can't be checked headlessly. Detection and drawing changes are reviewed, not tested — report them as unverified rather than claiming they work.

# Version pinning
`@mediapipe/tasks-vision` is pinned in three places in handTracker.js (the import, WASM_PATH, and the DrawingUtils re-export). Bump all three together, and confirm the CDN URLs return 200 first — plausible-looking versions don't always exist on npm.

