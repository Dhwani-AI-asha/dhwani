// PCM AudioWorklet Processor
// Captures input audio, resamples to 16 kHz mono, and converts to 16-bit signed PCM (little-endian).

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputData = input[0]; // Float32Array channel 0
    const sourceSampleRate = sampleRate; // Global AudioWorklet scope sampleRate

    let resampled;
    if (sourceSampleRate === this.targetSampleRate) {
      resampled = inputData;
    } else {
      // Linear interpolation resampling to 16000 Hz
      const ratio = sourceSampleRate / this.targetSampleRate;
      const targetLength = Math.round(inputData.length / ratio);
      resampled = new Float32Array(targetLength);
      for (let i = 0; i < targetLength; i++) {
        const srcIdx = i * ratio;
        const i0 = Math.floor(srcIdx);
        const i1 = Math.min(i0 + 1, inputData.length - 1);
        const frac = srcIdx - i0;
        resampled[i] = inputData[i0] * (1 - frac) + inputData[i1] * frac;
      }
    }

    // Convert Float32 [-1.0, 1.0] to signed 16-bit PCM [-32768, 32767]
    const pcm16 = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Post raw binary ArrayBuffer back to main thread
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
