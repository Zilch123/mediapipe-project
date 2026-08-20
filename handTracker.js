/**
 * Minimal hand-tracking wrapper around MediaPipe HandLandmarker.
 *
 * This is the reusable piece: it owns the model, the webcam and the detection
 * loop, and hands every frame's result to your callback. Apps built on this
 * boilerplate should only need to write that callback.
 */

import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandTracker {
  constructor(video, options = {}) {
    this.video = video;
    this.options = {
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      ...options,
    };
    this.landmarker = null;
    this.running = false;
    this.lastVideoTime = -1;
    this.onResults = () => {};
  }

  async initialize() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      ...this.options,
    });
  }

  /** Update detection options at runtime, e.g. setOptions({ numHands: 1 }). */
  async setOptions(options) {
    this.options = { ...this.options, ...options };
    await this.landmarker?.setOptions({ runningMode: 'VIDEO', ...this.options });
  }

  async start() {
    if (this.running) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    this.video.srcObject = stream;
    await this.video.play();
    this.running = true;
    this.#loop();
  }

  stop() {
    this.running = false;
    this.lastVideoTime = -1;
    const stream = this.video.srcObject;
    stream?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
  }

  #loop = () => {
    if (!this.running) return;

    // Only run detection when the video has advanced to a new frame.
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.landmarker.detectForVideo(
        this.video,
        performance.now(),
      );
      this.onResults(result);
    }

    requestAnimationFrame(this.#loop);
  };
}

export { HandLandmarker };
export { DrawingUtils } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
