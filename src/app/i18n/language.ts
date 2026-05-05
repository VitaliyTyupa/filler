export type AppLanguage = 'uk' | 'de';

export const DEFAULT_LANGUAGE: AppLanguage = 'uk';
export const LANGUAGE_STORAGE_KEY = 'filler_language';

export function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.startsWith('de')) {
    return 'de';
  }

  if (normalized.startsWith('uk')) {
    return 'uk';
  }

  return null;
}

export function detectBrowserLanguage(): AppLanguage {
  const preferred = globalThis.navigator?.languages?.[0] ?? globalThis.navigator?.language;
  return normalizeLanguage(preferred) ?? DEFAULT_LANGUAGE;
}

export function readStoredLanguage(): AppLanguage | null {
  try {
    return normalizeLanguage(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function resolveInitialLanguage(): AppLanguage {
  return readStoredLanguage() ?? detectBrowserLanguage();
}

export function persistLanguage(language: AppLanguage): void {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore storage failures. The app can still use the current in-memory locale.
  }
}
