// AudioWorklet for the note taker: mixes the microphone to mono and posts 2048-sample frames.
// Served as a static file because the processor must load from its own module URL.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(2048);
    this.filled = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length > 0) {
      const length = channels[0].length;
      for (let i = 0; i < length; i++) {
        let sum = 0;
        for (let c = 0; c < channels.length; c++) sum += channels[c][i];
        this.frame[this.filled++] = sum / channels.length;
        if (this.filled === this.frame.length) {
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(2048);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("cue-pcm-capture", PcmCapture);
