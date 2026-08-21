/**
 * Hand Painting.
 *
 * Hold up exactly one finger and its tip paints, in a colour belonging to
 * that finger. Two fingers up, an open hand or a fist paints nothing — that
 * is how you lift the brush. If both hands are in frame, only one paints.
 */

import { HandTracker, HandLandmarker, DrawingUtils } from '../../handTracker.js';

const FINGERS = [
  { name: 'Thumb', tip: 4, base: 3, color: '#f97316' },
  { name: 'Index', tip: 8, base: 6, color: '#38bdf8' },
  { name: 'Middle', tip: 12, base: 10, color: '#22c55e' },
  { name: 'Ring', tip: 16, base: 14, color: '#a78bfa' },
  { name: 'Pinky', tip: 20, base: 18, color: '#f472b6' },
];

// A finger counts as extended when its tip is meaningfully farther from the
// wrist than its middle joint. Curling the finger pulls the tip back in.
const EXTENDED_RATIO = 1.18;
// The thumb folds sideways rather than curling, so it is measured against the
// pinky knuckle instead: tucking it across the palm moves it closer.
const THUMB_RATIO = 1.1;

// Fraction of the new point used each frame; lower is smoother but laggier.
const SMOOTHING = 0.45;

const video = document.getElementById('webcam');
const paint = document.getElementById('paint');
const paintCtx = paint.getContext('2d');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const toggleButton = document.getElementById('toggle');
const clearButton = document.getElementById('clear');
const strokeInput = document.getElementById('stroke');
const strokeValue = document.getElementById('stroke-value');
const helpToggle = document.getElementById('help-toggle');
const help = document.getElementById('help');
const status = document.getElementById('status');
const fingerLabel = document.getElementById('finger');
const handsLabel = document.getElementById('hands');

const drawingUtils = new DrawingUtils(ctx);
const tracker = new HandTracker(video, { numHands: 2 });

let strokeWidth = Number(strokeInput.value);
let lastPoint = null; // smoothed brush position, in canvas pixels

// --- finger state --------------------------------------------------------

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function isExtended(landmarks, finger) {
  const wrist = landmarks[0];
  if (finger.name === 'Thumb') {
    const pinkyKnuckle = landmarks[17];
    return (
      distance(landmarks[finger.tip], pinkyKnuckle) >
      distance(landmarks[finger.base], pinkyKnuckle) * THUMB_RATIO
    );
  }
  return (
    distance(landmarks[finger.tip], wrist) >
    distance(landmarks[finger.base], wrist) * EXTENDED_RATIO
  );
}

/** The single extended finger, or null if none or several are up. */
function paintingFinger(landmarks) {
  const up = FINGERS.filter((finger) => isExtended(landmarks, finger));
  return up.length === 1 ? up[0] : null;
}

/**
 * Both hands may be visible, but only one paints. A hand holding up exactly
 * one finger wins; if both do, the nearer (larger) hand does.
 */
function chooseHand(handsInFrame) {
  const candidates = handsInFrame.filter((hand) => hand.finger);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.size > a.size ? b : a));
}

// --- detection -----------------------------------------------------------

function handleResults(result) {
  resizeCanvases();

  const handsInFrame = result.landmarks.map((landmarks) => ({
    landmarks,
    finger: paintingFinger(landmarks),
    size: distance(landmarks[0], landmarks[9]), // hand length: nearer is bigger
  }));

  const active = chooseHand(handsInFrame);

  if (active) {
    const tip = active.landmarks[active.finger.tip];
    const point = { x: tip.x * paint.width, y: tip.y * paint.height };
    // Ease towards the tip so landmark jitter doesn't make the line hairy.
    lastPoint = lastPoint
      ? {
          x: lastPoint.x + (point.x - lastPoint.x) * SMOOTHING,
          y: lastPoint.y + (point.y - lastPoint.y) * SMOOTHING,
        }
      : point;
    strokeTo(lastPoint, active.finger.color);
  } else {
    // Brush lifted: the next stroke starts fresh instead of joining up.
    lastPoint = null;
    paintCtx.beginPath();
  }

  drawOverlay(handsInFrame, active);

  fingerLabel.textContent = active ? active.finger.name : '—';
  handsLabel.textContent = handsInFrame.length
    ? `${handsInFrame.length} in frame`
    : 'none';
}

function strokeTo(point, color) {
  paintCtx.lineTo(point.x, point.y);
  paintCtx.strokeStyle = color;
  paintCtx.lineWidth = strokeWidth;
  paintCtx.lineCap = 'round';
  paintCtx.lineJoin = 'round';
  paintCtx.stroke();
  // Restart the path at the current point, so a colour or width change
  // applies from here rather than repainting the whole stroke.
  paintCtx.beginPath();
  paintCtx.moveTo(point.x, point.y);
}

function drawOverlay(handsInFrame, active) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const hand of handsInFrame) {
    const isActive = hand === active;
    drawingUtils.drawConnectors(hand.landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: isActive ? hand.finger.color : '#57534e',
      lineWidth: isActive ? 3 : 2,
    });
  }

  // Brush cursor: a ring the size of the current stroke.
  if (active && lastPoint) {
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, strokeWidth / 2 + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Sizing a canvas clears it, so the paint layer is only resized on change. */
function resizeCanvases() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (paint.width !== video.videoWidth || paint.height !== video.videoHeight) {
    paint.width = video.videoWidth;
    paint.height = video.videoHeight;
  }
}

tracker.onResults = handleResults;

// --- controls ------------------------------------------------------------

toggleButton.addEventListener('click', async () => {
  if (tracker.running) {
    tracker.stop();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lastPoint = null;
    status.textContent = 'stopped';
    toggleButton.textContent = 'Start camera';
    return;
  }

  toggleButton.disabled = true;
  status.textContent = 'requesting camera…';
  try {
    await tracker.start();
    toggleButton.textContent = 'Stop camera';
    status.textContent = 'hold up one finger';
    help.hidden = true;
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      status.textContent = 'camera blocked — see instructions below';
      help.hidden = false;
    } else {
      status.textContent = `camera error: ${error.message}`;
    }
  } finally {
    toggleButton.disabled = false;
  }
});

strokeInput.addEventListener('input', () => {
  strokeWidth = Number(strokeInput.value);
  strokeValue.textContent = strokeWidth;
});

clearButton.addEventListener('click', () => {
  paintCtx.clearRect(0, 0, paint.width, paint.height);
  paintCtx.beginPath();
  lastPoint = null;
});

helpToggle.addEventListener('click', () => {
  help.hidden = !help.hidden;
});

try {
  await tracker.initialize();
  toggleButton.disabled = false;
  toggleButton.textContent = 'Start camera';
  status.textContent = 'ready';
} catch (error) {
  toggleButton.textContent = 'Model failed to load';
  status.textContent = error.message;
}
