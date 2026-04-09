import { queryOne } from './db';

// Excludes visually ambiguous characters: I, O, 0, 1, L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

export function createGameCode(): string {
  // Loop until we find a code not already in use
  for (let attempts = 0; attempts < 100; attempts++) {
    const code = generateCode();
    const existing = queryOne<{ id: number }>(
      'SELECT id FROM games WHERE code = ?',
      code,
    );
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique game code');
}
