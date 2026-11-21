/**
 * Text-to-Speech client for Dhwani voice backend.
 * POSTs to http://localhost:8000/tts and plays the returned WAV audio.
 */

let activeAudio: HTMLAudioElement | null = null;

/**
 * Sends text and language to the backend TTS service and plays the synthesized audio.
 *
 * @param text The text to synthesize into speech.
 * @param language The language code (defaults to 'hi-IN').
 * @returns Promise that resolves to the HTMLAudioElement being played.
 */
export async function speak(
  text: string,
  language: string = 'hi-IN'
): Promise<HTMLAudioElement> {
  // Interrupt any existing audio playback
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Ignore pause errors
    }
    activeAudio = null;
  }

  const response = await fetch('http://localhost:8000/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, language }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`TTS request failed with status ${response.status}: ${errorText}`);
  }

  const blob = await response.blob();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  activeAudio = audio;

  const cleanup = () => {
    URL.revokeObjectURL(audioUrl);
    if (activeAudio === audio) {
      activeAudio = null;
    }
  };

  audio.onended = cleanup;
  audio.onerror = cleanup;

  try {
    await audio.play();
  } catch (err) {
    console.warn('Audio playback was interrupted or blocked by autoplay policy:', err);
  }

  return audio;
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
}

export default speak;
