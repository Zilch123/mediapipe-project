/**
 * Air Violin.
 *
 * Left hand = the string hand: its height picks the note.
 * Right hand = the bow: sound is produced only while it is moving, and how
 * fast it moves sets the volume. Hold the bow hand still and the note stops.
 */

import { HandTracker, HandLandmarker, DrawingUtils } from '../../handTracker.js';

// G major, low to high — the note the left hand picks by height.
const NOTES = [
  { name: 'G3', freq: 196.0 },
  { name: 'A3', freq: 220.0 },
  { name: 'B3', freq: 246.94 },
  { name: 'C4', freq: 261.63 },
  { name: 'D4', freq: 293.66 },
  { name: 'E4', freq: 329.63 },
  { name: 'F#4', freq: 369.99 },
  { name: 'G4', freq: 392.0 },
];

// Bow speed is in normalized screen widths per second.
const BOW_THRESHOLD = 0.12; // below this the bow counts as still
const BOW_FULL = 1.4; // speed that reaches full volume
const MAX_GAIN = 0.25;

const video = document.getElementById('webcam');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const toggleButton = document.getElementById('toggle');
const swapButton = document.getElementById('swap');
const helpToggle = document.getElementById('help-toggle');
const help = document.getElementById('help');
const status = document.getElementById('status');
const noteLabel = document.getElementById('note');
const bowLevel = document.getElementById('bow-level');
const handsLabel = document.getElementById('hands');

const drawingUtils = new DrawingUtils(ctx);
const tracker = new HandTracker(video, { numHands: 2 });

// MediaPipe labels handedness as if the image were mirrored, but the model
// receives the raw (unmirrored) camera frame — so its "Right" is the user's
// left hand. The Swap hands button flips this if it comes out backwards.
let swapped = false;
const isStringHand = (label) => (swapped ? label === 'Left' : label === 'Right');

let noteIndex = 3;
let bowSpeed = 0;
let lastBow = null;
let lastBowTime = 0;

// --- audio ---------------------------------------------------------------

let audio = null;

function startAudio() {
  if (audio) return;
  const ctxAudio = new AudioContext();

  const osc = ctxAudio.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = NOTES[noteIndex].freq;

  // A lowpass takes the buzz off the sawtooth so it reads as bowed string.
  const filter = ctxAudio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2200;
  filter.Q.value = 1;

  const gain = ctxAudio.createGain();
  gain.gain.value = 0;

  // Slight vibrato.
  const lfo = ctxAudio.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoDepth = ctxAudio.createGain();
  lfoDepth.gain.value = 1.5;
  lfo.connect(lfoDepth).connect(osc.detune);

  osc.connect(filter).connect(gain).connect(ctxAudio.destination);
  osc.start();
  lfo.start();

  audio = { ctx: ctxAudio, osc, gain };
}

function updateAudio(volume) {
  if (!audio) return;
  const now = audio.ctx.currentTime;
  // setTargetAtTime ramps instead of jumping, which avoids clicks.
  audio.gain.gain.setTargetAtTime(volume * MAX_GAIN, now, 0.05);
  audio.osc.frequency.setTargetAtTime(NOTES[noteIndex].freq, now, 0.04);
}

function stopAudio() {
  if (!audio) return;
  audio.ctx.close();
  audio = null;
}

// --- detection -----------------------------------------------------------

function handleResults(result) {
  const now = performance.now();

  let stringHand = null;
  let bowHand = null;
  result.landmarks.forEach((landmarks, i) => {
    const label = result.handedness[i][0].categoryName;
    if (isStringHand(label)) stringHand = landmarks;
    else bowHand = landmarks;
  });

  // Left hand height picks the note: top of frame is the highest note.
  if (stringHand) {
    const y = stringHand[0].y;
    const index = Math.floor((1 - y) * NOTES.length);
    noteIndex = Math.min(NOTES.length - 1, Math.max(0, index));
  }

  // Right hand movement drives the volume.
  if (bowHand) {
    const wrist = bowHand[0];
    if (lastBow) {
      const dt = (now - lastBowTime) / 1000;
      if (dt > 0) {
        const moved = Math.hypot(wrist.x - lastBow.x, wrist.y - lastBow.y);
        // Smooth so a single jittery frame doesn't spike the volume.
        bowSpeed = bowSpeed * 0.6 + (moved / dt) * 0.4;
      }
    }
    lastBow = { x: wrist.x, y: wrist.y };
    lastBowTime = now;
  } else {
    lastBow = null;
    bowSpeed = 0;
  }

  const volume = stringHand
    ? Math.min(1, Math.max(0, (bowSpeed - BOW_THRESHOLD) / BOW_FULL))
    : 0;

  updateAudio(volume);
  draw(stringHand, bowHand, volume);

  noteLabel.textContent = volume > 0 ? NOTES[noteIndex].name : '—';
  bowLevel.style.width = `${Math.round(volume * 100)}%`;
  handsLabel.textContent = `left ${stringHand ? '✓' : '✗'} right ${bowHand ? '✓' : '✗'}`;
}

function draw(stringHand, bowHand, volume) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Note bands. No text on the canvas — it is mirrored, so text reads
  // backwards; the note name goes in the DOM readout instead.
  const band = canvas.height / NOTES.length;
  for (let i = 0; i < NOTES.length; i++) {
    const y = canvas.height - (i + 1) * band;
    ctx.fillStyle =
      i === noteIndex ? `rgba(59,130,246,${0.15 + volume * 0.35})` : 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, y, canvas.width, band - 2);
  }

  if (stringHand) {
    drawingUtils.drawConnectors(stringHand, HandLandmarker.HAND_CONNECTIONS, {
      color: '#22c55e',
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(stringHand, { color: '#bbf7d0', lineWidth: 1 });
  }

  if (bowHand) {
    drawingUtils.drawConnectors(bowHand, HandLandmarker.HAND_CONNECTIONS, {
      color: volume > 0 ? '#f97316' : '#78716c',
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(bowHand, { color: '#fed7aa', lineWidth: 1 });
  }
}

tracker.onResults = handleResults;

// --- controls ------------------------------------------------------------

toggleButton.addEventListener('click', async () => {
  if (tracker.running) {
    tracker.stop();
    stopAudio();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bowLevel.style.width = '0%';
    noteLabel.textContent = '—';
    status.textContent = 'stopped';
    toggleButton.textContent = 'Start camera';
    return;
  }

  toggleButton.disabled = true;
  status.textContent = 'requesting camera…';
  try {
    await tracker.start();
    // The AudioContext has to be created from a user gesture, so it starts
    // here rather than on page load.
    startAudio();
    toggleButton.textContent = 'Stop camera';
    status.textContent = 'playing';
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

swapButton.addEventListener('click', () => {
  swapped = !swapped;
  status.textContent = swapped ? 'hands swapped' : 'hands normal';
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
