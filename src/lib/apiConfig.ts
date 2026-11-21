/**
 * Shared frontend URL configuration helpers.
 * Supports VITE_PATIENT_API_URL, VITE_VOICE_HTTP_URL, and VITE_VOICE_WS_URL
 * with trailing-slash normalization and HTTPS -> WSS upgrade for Vercel deployments.
 */

interface ViteMetaEnv {
  VITE_PATIENT_API_URL?: string;
  VITE_VOICE_HTTP_URL?: string;
  VITE_VOICE_WS_URL?: string;
}

function readEnv(): ViteMetaEnv {
  try {
    if (typeof import.meta !== 'undefined') {
      return ((import.meta as unknown as { env?: ViteMetaEnv }).env) || {};
    }
  } catch {
    // Ignore when imported outside Vite/ESM module env checks
  }
  return {};
}

function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function normalizeHttpBaseUrl(rawUrl: string | undefined, fallback: string): string {
  const cleaned = trimTrailingSlash(rawUrl || '');
  return cleaned || fallback;
}

export function normalizeWsUrl(rawWsUrl: string | undefined, httpFallbackUrl?: string): string {
  const explicit = trimTrailingSlash(rawWsUrl || '');
  if (explicit) {
    const wsProto = explicit
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://');
    if (/\/ws\/stt$/i.test(wsProto)) {
      return wsProto;
    }
    return `${wsProto}/ws/stt`;
  }

  const httpBase = trimTrailingSlash(httpFallbackUrl || '');
  if (httpBase) {
    const wsBase = httpBase
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://');
    return `${wsBase}/ws/stt`;
  }

  return 'ws://localhost:8000/ws/stt';
}

export function getPatientApiBaseUrl(): string {
  const env = readEnv();
  return normalizeHttpBaseUrl(env.VITE_PATIENT_API_URL || env.VITE_VOICE_HTTP_URL, 'http://localhost:8001');
}

export function getVoiceHttpBaseUrl(): string {
  const env = readEnv();
  return normalizeHttpBaseUrl(env.VITE_VOICE_HTTP_URL || env.VITE_PATIENT_API_URL, 'http://localhost:8000');
}

export function getVoiceWsUrl(): string {
  const env = readEnv();
  return normalizeWsUrl(env.VITE_VOICE_WS_URL, env.VITE_VOICE_HTTP_URL || env.VITE_PATIENT_API_URL);
}
