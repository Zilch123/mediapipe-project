/**
 * Demo app: draws the hand landmarks over the webcam feed.
 *
 * Swap the body of `handleResults` for whatever your app needs — the tracker
 * gives you `result.landmarks` (normalized 0..1), `result.worldLandmarks` and
 * `result.handedness` for every detected hand.
 */

import { HandTracker, HandLandmarker, DrawingUtils } from './handTracker.js';

const video = document.getElementById('webcam');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const toggleButton = document.getElementById('toggle');
const numHandsInput = document.getElementById('num-hands');
const numHandsValue = document.getElementById('num-hands-value');
const status = document.getElementById('status');

const drawingUtils = new DrawingUtils(ctx);
const tracker = new HandTracker(video);

function handleResults(result) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const landmarks of result.landmarks) {
    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: '#00FF00',
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(landmarks, { color: '#FF0000', lineWidth: 1 });
  }

  status.textContent = `${result.landmarks.length} hand(s)`;
}

tracker.onResults = handleResults;

toggleButton.addEventListener('click', async () => {
  if (tracker.running) {
    tracker.stop();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    status.textContent = 'stopped';
    toggleButton.textContent = 'Start camera';
    return;
  }

  toggleButton.disabled = true;
  try {
    await tracker.start();
    toggleButton.textContent = 'Stop camera';
  } catch (error) {
    status.textContent = `Camera error: ${error.message}`;
  } finally {
    toggleButton.disabled = false;
  }
});

numHandsInput.addEventListener('input', async () => {
  const numHands = Number(numHandsInput.value);
  numHandsValue.textContent = numHands;
  await tracker.setOptions({ numHands });
});

await tracker.initialize();
toggleButton.disabled = false;
toggleButton.textContent = 'Start camera';
status.textContent = 'ready';
