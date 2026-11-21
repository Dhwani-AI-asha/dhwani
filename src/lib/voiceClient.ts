/**
 * Voice Client for Dhwani Realtime STT
 *
 * Connects to the local FastAPI WebSocket STT backend (/ws/stt),
 * captures microphone audio at 16 kHz mono using an AudioWorklet,
 * and streams raw 16-bit PCM binary chunks.
 *
 * Incoming messages from backend:
 * - { "type": "segment", "text": "..." } (live speech piece)
 * - { "type": "turn", "text": "..." } (joined sentence after pause)
 * - { "type": "error", "message": "..." }
 */

import { getVoiceWsUrl } from './apiConfig.ts';

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface VoiceClientCallbacks {
  onSegment?: (text: string) => void;
  onTurn?: (text: string) => void;
  onError?: (message: string) => void;
  onStatus?: (status: VoiceStatus) => void;
}

export class VoiceClient {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private muteNode: GainNode | null = null;
  private isPaused: boolean = false;
  private status: VoiceStatus = 'idle';
  private callbacks: VoiceClientCallbacks;

  constructor(callbacks: VoiceClientCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Update callbacks dynamically
   */
  public setCallbacks(callbacks: VoiceClientCallbacks): void {
    this.callbacks = callbacks;
  }

  private setStatus(status: VoiceStatus): void {
    this.status = status;
    this.callbacks.onStatus?.(status);
  }

  /**
   * Starts microphone capture and WebSocket streaming
   */
  public async start(): Promise<void> {
    // Clean up any existing session
    this.stop();
    this.isPaused = false;
    this.setStatus('connecting');

    return new Promise<void>((resolve, reject) => {
      try {
        const wsUrl = getVoiceWsUrl();
        const socket = new WebSocket(wsUrl);
        this.socket = socket;
        socket.binaryType = 'arraybuffer';

        let hasResolved = false;

        socket.onopen = async () => {
          try {
            // 1. Request microphone stream (16 kHz, mono)
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true,
              },
            });

            // 2. Create AudioContext (16 kHz)
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.audioContext = new AudioCtx({ sampleRate: 16000 });

            if (this.audioContext.state === 'suspended') {
              await this.audioContext.resume();
            }

            // 3. Load AudioWorklet from /pcm-processor.js
            await this.audioContext.audioWorklet.addModule('/pcm-processor.js');

            // 4. Create Audio Nodes
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

            // 5. Send raw PCM chunks over WebSocket when not paused
            this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
              if (!this.isPaused && this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(event.data);
              }
            };

            // Route through 0-gain node to destination to prevent feedback while keeping pipeline active
            this.muteNode = this.audioContext.createGain();
            this.muteNode.gain.value = 0;
            this.sourceNode.connect(this.workletNode);
            this.workletNode.connect(this.muteNode);
            this.muteNode.connect(this.audioContext.destination);

            this.setStatus('live');
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          } catch (audioErr: unknown) {
            const message = audioErr instanceof Error ? audioErr.message : 'Microphone access failed';
            this.callbacks.onError?.(message);
            this.setStatus('error');
            this.stop();
            if (!hasResolved) {
              hasResolved = true;
              reject(audioErr);
            }
          }
        };

        socket.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'segment' && typeof data.text === 'string') {
              this.callbacks.onSegment?.(data.text);
            } else if (data.type === 'turn' && typeof data.text === 'string') {
              this.callbacks.onTurn?.(data.text);
            } else if (data.type === 'error') {
              const msg = data.message || 'Voice backend error';
              this.callbacks.onError?.(msg);
              this.setStatus('error');
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        socket.onerror = () => {
          const errorMsg = 'Failed to connect to voice backend WebSocket';
          this.callbacks.onError?.(errorMsg);
          this.setStatus('error');
          if (!hasResolved) {
            hasResolved = true;
            reject(new Error(errorMsg));
          }
        };

        socket.onclose = () => {
          // If closed without an error, return to idle
          if (this.status !== 'error') {
            this.setStatus('idle');
          }
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to start voice client';
        this.callbacks.onError?.(message);
        this.setStatus('error');
        reject(err);
      }
    });
  }

  /**
   * Pauses sending PCM audio chunks to backend
   */
  public pause(): void {
    this.isPaused = true;
  }

  /**
   * Resumes sending PCM audio chunks to backend
   */
  public resume(): void {
    this.isPaused = false;
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  /**
   * Stops mic recording, AudioContext, and WebSocket connection
   */
  public stop(): void {
    // 1. Stop mic tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // 2. Disconnect and release audio nodes
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.muteNode) {
      this.muteNode.disconnect();
      this.muteNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // 3. Close WebSocket
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close();
      }
      this.socket = null;
    }

    this.isPaused = false;
    this.setStatus('idle');
  }

  public getStatus(): VoiceStatus {
    return this.status;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }
}

// Export default singleton instance as well
export const voiceClient = new VoiceClient();
