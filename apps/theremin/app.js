/**
 * Theremin.
 *
 * Like the real instrument: one continuous tone, played by moving through the
 * air. No melody and no preset notes — the right hand slides the pitch, the
 * left hand rides the volume, and the tone sustains for as long as your hands
 * are in frame.
 */

import { HandTracker, HandLandmarker, DrawingUtils } from '../../handTracker.js';

const LOW_HZ = 130.81; // C3
const OCTAVES = 2; // pitch range: C3 up to C5
const MAX_GAIN = 0.3;

// Glide times. Short enough to feel responsive, long enough that hand jitter
// doesn't sound like a warble.
const PITCH_GLIDE = 0.06;
const GAIN_GLIDE = 0.05;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [0, 2, 4, 5, 7, 9, 11]; // scale degrees used when snapping

const video = document.getElementById('webcam');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const toggleButton = document.getElementById('toggle');
const snapButton = document.getElementById('snap');
const swapButton = document.getElementById('swap');
const helpToggle = document.getElementById('help-toggle');
const help = document.getElementById('help');
const status = document.getElementById('status');
const noteLabel = document.getElementById('note');
const freqLabel = document.getElementById('freq');
const volumeLevel = document.getElementById('bow-level');
const handsLabel = document.getElementById('hands');

const drawingUtils = new DrawingUtils(ctx);
const tracker = new HandTracker(video, { numHands: 2 });

// MediaPipe labels handedness as if the image were mirrored, but the model
// receives the raw (unmirrored) camera frame — so its "Left" is the user's
// right hand. The Swap hands button flips this if it comes out backwards.
let swapped = false;
const isPitchHand = (label) => (swapped ? label === 'Right' : label === 'Left');

let snapToScale = false;
let currentFreq = LOW_HZ;

// --- audio ---------------------------------------------------------------

let audio = null;

function startAudio() {
  if (audio) return;
  const audioCtx = new AudioContext();

  // A theremin is close to a pure tone; a touch of triangle keeps it from
  // sounding like a test signal.
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = currentFreq;

  const gain = audioCtx.createGain();
  gain.gain.value = 0;

  // Gentle vibrato, the way a player's hand naturally shakes.
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 5;
  const lfoDepth = audioCtx.createGain();
  lfoDepth.gain.value = 4; // cents
  lfo.connect(lfoDepth).connect(osc.detune);

  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  lfo.start();

  audio = { ctx: audioCtx, osc, gain };
}

function stopAudio() {
  audio?.ctx.close();
  audio = null;
}

function updateAudio(freq, volume) {
  if (!audio) return;
  const now = audio.ctx.currentTime;
  // setTargetAtTime glides instead of jumping, which is what makes it sound
  // like a theremin rather than a keyboard.
  audio.osc.frequency.setTargetAtTime(freq, now, PITCH_GLIDE);
  audio.gain.gain.setTargetAtTime(volume * MAX_GAIN, now, GAIN_GLIDE);
}

// --- pitch ---------------------------------------------------------------

/** position 0..1 across the frame -> frequency, exponential like real pitch. */
function positionToFreq(position) {
  const semitones = position * OCTAVES * 12;
  const snapped = snapToScale ? snapSemitone(semitones) : semitones;
  return LOW_HZ * 2 ** (snapped / 12);
}

function snapSemitone(semitones) {
  const octave = Math.floor(semitones / 12);
  const within = semitones - octave * 12;
  // Nearest degree of the major scale.
  let best = MAJOR[0];
  for (const degree of MAJOR) {
    if (Math.abs(degree - within) < Math.abs(best - within)) best = degree;
  }
  return octave * 12 + best;
}

function noteName(freq) {
  const semitonesFromC3 = Math.round(12 * Math.log2(freq / LOW_HZ));
  const name = NOTE_NAMES[((semitonesFromC3 % 12) + 12) % 12];
  return `${name}${3 + Math.floor(semitonesFromC3 / 12)}`;
}

// --- detection -----------------------------------------------------------

function handleResults(result) {
  let pitchHand = null;
  let volumeHand = null;
  result.landmarks.forEach((landmarks, i) => {
    const label = result.handedness[i][0].categoryName;
    if (isPitchHand(label)) pitchHand = landmarks;
    else volumeHand = landmarks;
  });

  if (pitchHand) {
    // Landmark x is in raw camera space, but the preview is mirrored, so
    // 1 - x is where the hand appears on screen. Right on screen = higher.
    const position = 1 - pitchHand[0].x;
    currentFreq = positionToFreq(Math.min(1, Math.max(0, position)));
  }

  // Hand height sets the volume; raising it opens up, like the volume loop.
  // With no volume hand, hold a steady mid level so one hand still plays.
  let volume = 0;
  if (pitchHand) volume = volumeHand ? 1 - volumeHand[0].y : 0.5;
  volume = Math.min(1, Math.max(0, volume));

  updateAudio(currentFreq, volume);
  draw(pitchHand, volumeHand, volume);

  noteLabel.textContent = pitchHand ? noteName(currentFreq) : '—';
  freqLabel.textContent = pitchHand ? `${Math.round(currentFreq)} Hz` : '0 Hz';
  volumeLevel.style.width = `${Math.round(volume * 100)}%`;
  handsLabel.textContent = `pitch ${pitchHand ? '✓' : '✗'} volume ${volumeHand ? '✓' : '✗'}`;
}

function draw(pitchHand, volumeHand, volume) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // No text on the canvas — it is mirrored, so text reads backwards. The note
  // name goes in the DOM readout instead.
  if (snapToScale) drawScaleGuides();

  if (pitchHand) {
    drawingUtils.drawConnectors(pitchHand, HandLandmarker.HAND_CONNECTIONS, {
      color: '#38bdf8',
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(pitchHand, { color: '#bae6fd', lineWidth: 1 });
  }

  if (volumeHand) {
    drawingUtils.drawConnectors(volumeHand, HandLandmarker.HAND_CONNECTIONS, {
      color: volume > 0.02 ? '#a78bfa' : '#78716c',
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(volumeHand, { color: '#ddd6fe', lineWidth: 1 });
  }
}

/** Vertical lines where the snapped notes sit, drawn in mirrored space. */
function drawScaleGuides() {
  const total = OCTAVES * 12;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let octave = 0; octave < OCTAVES; octave++) {
    for (const degree of MAJOR) {
      const position = (octave * 12 + degree) / total;
      // Mirror back into canvas space, since the canvas is flipped in CSS.
      ctx.fillRect((1 - position) * canvas.width, 0, 1, canvas.height);
    }
  }
}

tracker.onResults = handleResults;

// --- controls ------------------------------------------------------------

toggleButton.addEventListener('click', async () => {
  if (tracker.running) {
    tracker.stop();
    stopAudio();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    volumeLevel.style.width = '0%';
    noteLabel.textContent = '—';
    freqLabel.textContent = '0 Hz';
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

snapButton.addEventListener('click', () => {
  snapToScale = !snapToScale;
  snapButton.textContent = `Snap to scale: ${snapToScale ? 'on' : 'off'}`;
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
