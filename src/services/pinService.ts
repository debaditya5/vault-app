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
 * Ensures the stored PIN is a valid 6-digit value.
 * Default PIN is 000000.
 * Resets to 000000 if: no PIN exists, it's a legacy 4-digit PIN,
 * or it's the old wrong default (123456).
 */
export async function migrateToDefault(): Promise<void> {
  const current = await SecureStore.getItemAsync(PIN_KEY);
  if (!current || current.length === 4 || current === '123456') {
    await SecureStore.setItemAsync(PIN_KEY, '000000');
  }
}
