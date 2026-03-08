import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'VAULT_PIN';

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored === pin;
}

export async function isPinSet(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored !== null && stored !== undefined;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

/**
 * Ensures a valid 6-digit PIN exists.
 * Migrates any old 4-digit PIN (or missing PIN) to the default "000000".
 */
export async function migrateToDefault(): Promise<void> {
  const current = await SecureStore.getItemAsync(PIN_KEY);
  if (!current || current.length !== 6) {
    await SecureStore.setItemAsync(PIN_KEY, '000000');
  }
}
