import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, '../../public/data/schema.json');

describe('committed schema.json', () => {
  it('Tamil Nadu assemblySeats matches TN assemblyConstituencies count (234)', () => {
    const raw = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
      states: { TN?: { assemblySeats?: number } };
      assemblyConstituencies: Record<string, { stateId?: string }>;
    };

    const tnInState = raw.states.TN?.assemblySeats;
    const tnAcCount = Object.values(raw.assemblyConstituencies).filter(
      (ac) => ac.stateId === 'TN'
    ).length;

    expect(tnAcCount).toBe(234);
    expect(tnInState).toBe(234);
    expect(tnInState).toBe(tnAcCount);
  });
});
