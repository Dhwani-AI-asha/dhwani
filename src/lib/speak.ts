/**
 * Text-to-Speech client for Dhwani voice backend.
 * POSTs to http://localhost:8000/tts and plays the returned WAV audio.
 */

let activeAudio: HTMLAudioElement | null = null;
let activeResolve: ((value: boolean) => void) | null = null;

/**
 * Sends text and language to the backend TTS service and plays the synthesized audio.
 * Returns a Promise that resolves when the audio finishes playing (on the audio 'ended' event),
 * and also resolves on error so caller execution is never blocked.
 *
 * @param text The text to synthesize into speech.
 * @param language The language code (defaults to 'hi-IN').
 * @returns Promise that resolves to true if audio played to completion, or false on error.
 */
export function speak(
  text: string,
  language: string = 'hi-IN'
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      if (activeResolve === finish) {
        activeResolve = null;
      }
      resolve(success);
    };

    // Stop any currently playing audio and resolve its pending promise
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch {
        // Ignore pause errors
      }
      activeAudio = null;
    }
    if (activeResolve) {
      activeResolve(false);
      activeResolve = null;
    }

    activeResolve = finish;

    (async () => {
      let audioUrl = '';
      try {
        const response = await fetch('http://localhost:8000/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, language }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          console.warn(`TTS request failed with status ${response.status}: ${errorText}`);
          finish(false);
          return;
        }

        const blob = await response.blob();
        if (typeof Audio === 'undefined') {
          finish(false);
          return;
        }

        audioUrl = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : '';
        const audio = new Audio(audioUrl);
        activeAudio = audio;

        const cleanup = () => {
          if (audioUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
            try {
              URL.revokeObjectURL(audioUrl);
            } catch {
              // Ignore revoke errors
            }
          }
          if (activeAudio === audio) {
            activeAudio = null;
          }
        };

        audio.onended = () => {
          cleanup();
          finish(true);
        };

        audio.onerror = () => {
          cleanup();
          finish(false);
        };

        try {
          await audio.play();
        } catch (playErr) {
          console.warn('Audio playback was prevented or failed:', playErr);
          cleanup();
          finish(false);
        }
      } catch (err) {
        console.warn('TTS request error:', err);
        if (audioUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
          try {
            URL.revokeObjectURL(audioUrl);
          } catch {
            // Ignore revoke errors
          }
        }
        finish(false);
      }
    })();
  });
}

/**
 * Stops any active TTS audio playback.
 */
export function stopSpeaking(): void {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Ignore pause errors
    }
    activeAudio = null;
  }
  if (activeResolve) {
    activeResolve(false);
    activeResolve = null;
  }
}

export default speak;
