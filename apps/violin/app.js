/**
 * Air Violin — Pirates of the Caribbean.
 *
 * Right hand = the bow. Any movement at all steps the melody forward one
 * note; stop moving and the melody waits. The left hand is drawn so you can
 * see it, but it does not affect the sound.
 *
 * This is a demo of building apps with an agent, not an accurate violin: the
 * melody is a simplified take on "He's a Pirate".
 */

import { HandTracker, HandLandmarker, DrawingUtils } from '../../handTracker.js';

const HZ = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  Bb4: 466.16,
  C5: 523.25,
  D5: 587.33,
};

// "He's a Pirate" — the main theme, simplified. dur is in beats.
// Part A is the low opening figure everyone knows; part B is the rising
// answer to it, an octave-ish up.
const BEAT = 0.17; // seconds per beat
const MELODY = [
  // Part A
  ['D4', 1], ['D4', 1], ['D4', 1],
  ['D4', 1], ['E4', 1], ['F4', 1],
  ['F4', 1], ['F4', 1], ['F4', 1],
  ['F4', 1], ['G4', 1], ['E4', 1],
  ['E4', 1], ['E4', 1], ['E4', 1],
  ['E4', 1], ['F4', 1], ['D4', 1],
  ['D4', 1], ['C4', 1], ['D4', 1],
  ['D4', 3],

  // Part B
  ['A4', 1], ['A4', 1], ['A4', 1],
  ['A4', 1], ['Bb4', 1], ['C5', 1],
  ['C5', 1], ['C5', 1], ['C5', 1],
  ['C5', 1], ['D5', 1], ['Bb4', 1],
  ['Bb4', 1], ['Bb4', 1], ['Bb4', 1],
  ['Bb4', 1], ['C5', 1], ['A4', 1],
  ['A4', 1], ['G4', 1], ['A4', 1],
  ['A4', 3],
];

// Movement is measured as net displacement over a short window, in units of
// the player's own hand length. Measuring net travel (not per-frame deltas)
// rejects landmark jitter, which wobbles back and forth but goes nowhere.
// Scaling by hand length keeps it honest whether you sit near or far.
const WINDOW_MS = 160;
const MOVE_THRESHOLD = 0.9; // hand-lengths per second
const RESET_AFTER = 2500; // ms of stillness before the melody starts over
const MAX_GAIN = 0.22;

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
const isBowHand = (label) => (swapped ? label === 'Right' : label === 'Left');

let melodyIndex = 0;
let nextNoteAt = 0;
let lastMovedAt = 0;
let bowSpeed = 0;
let history = []; // recent bow-hand positions, newest last

// --- audio ---------------------------------------------------------------

let audioCtx = null;

function startAudio() {
  audioCtx ??= new AudioContext();
}

function stopAudio() {
  audioCtx?.close();
  audioCtx = null;
  // Drop the note handle with the context it belonged to.
  activeNote = null;
}

let activeNote = null;

/** One bowed note with its own envelope, so notes are distinct. */
function playNote(freq, seconds) {
  const t = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  // A lowpass takes the buzz off the sawtooth so it reads as bowed string.
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.Q.value = 1;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(MAX_GAIN, t + 0.03);
  gain.gain.setTargetAtTime(0, t + seconds * 0.75, 0.09);

  osc.connect(filter).connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + seconds + 0.5);

  stopActiveNote();
  activeNote = { osc, gain };
}

/** Lift the bow: the sounding note stops instead of ringing on. */
function stopActiveNote() {
  if (!activeNote) return;
  const t = audioCtx.currentTime;
  activeNote.gain.gain.cancelScheduledValues(t);
  activeNote.gain.gain.setTargetAtTime(0, t, 0.04);
  activeNote.osc.stop(t + 0.2);
  activeNote = null;
}

// --- detection -----------------------------------------------------------

function handleResults(result) {
  const now = performance.now();

  let bowHand = null;
  let otherHand = null;
  result.landmarks.forEach((landmarks, i) => {
    const label = result.handedness[i][0].categoryName;
    if (isBowHand(label)) bowHand = landmarks;
    else otherHand = landmarks;
  });

  if (bowHand) {
    const wrist = bowHand[0];
    history.push({ x: wrist.x, y: wrist.y, t: now });
    while (history.length > 1 && now - history[0].t > WINDOW_MS) history.shift();

    const oldest = history[0];
    const elapsed = (now - oldest.t) / 1000;
    // Hand length (wrist to middle-finger knuckle) is the yardstick, so the
    // threshold means the same thing near or far from the camera.
    const handLength = Math.hypot(bowHand[9].x - wrist.x, bowHand[9].y - wrist.y);
    bowSpeed =
      elapsed > 0 && handLength > 0
        ? Math.hypot(wrist.x - oldest.x, wrist.y - oldest.y) / handLength / elapsed
        : 0;
  } else {
    history = [];
    bowSpeed = 0;
  }

  const moving = bowSpeed > MOVE_THRESHOLD;
  if (!moving) stopActiveNote();

  // Long pause: start the tune again from the top.
  if (!moving && lastMovedAt && now - lastMovedAt > RESET_AFTER) {
    melodyIndex = 0;
    lastMovedAt = 0;
    noteLabel.textContent = '—';
  }

  if (moving && audioCtx) {
    lastMovedAt = now;
    if (now >= nextNoteAt) {
      const [name, beats] = MELODY[melodyIndex];
      const seconds = beats * BEAT;
      playNote(HZ[name], seconds);
      nextNoteAt = now + seconds * 1000;
      melodyIndex = (melodyIndex + 1) % MELODY.length;
      noteLabel.textContent = name;
    }
  }

  draw(bowHand, otherHand, moving);

  // Full meter at twice the threshold, so you can see how much headroom the
  // movement has over the point where it starts playing.
  bowLevel.style.width = `${Math.round(Math.min(1, bowSpeed / (MOVE_THRESHOLD * 2)) * 100)}%`;
  handsLabel.textContent = `bow ${bowHand ? '✓' : '✗'} other ${otherHand ? '✓' : '✗'}`;
}

function draw(bowHand, otherHand, moving) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // No text on the canvas — it is mirrored, so text reads backwards. The note
  // name goes in the DOM readout instead.
  if (otherHand) {
    drawingUtils.drawConnectors(otherHand, HandLandmarker.HAND_CONNECTIONS, {
      color: '#22c55e',
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(otherHand, { color: '#bbf7d0', lineWidth: 1 });
  }

  if (bowHand) {
    drawingUtils.drawConnectors(bowHand, HandLandmarker.HAND_CONNECTIONS, {
      color: moving ? '#f97316' : '#78716c',
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
    melodyIndex = 0;
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
    status.textContent = 'move your bow hand';
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
  status.textContent = swapped ? 'bow hand swapped' : 'bow hand normal';
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
