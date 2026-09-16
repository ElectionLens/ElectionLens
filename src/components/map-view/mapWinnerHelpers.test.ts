import { describe, it, expect } from 'vitest';
import { pickNonNotaAcWinner, assignAcWinnerBySchemaId } from './mapWinnerHelpers';

describe('pickNonNotaAcWinner', () => {
  it('returns undefined for an empty list', () => {
    expect(pickNonNotaAcWinner([])).toBeUndefined();
  });

  it('picks the highest-vote candidate when NOTA is not on top', () => {
    const candidates = [
      { name: 'A', party: 'DMK', votes: 100 },
      { name: 'B', party: 'AIADMK', votes: 300 },
      { name: 'NOTA', party: 'NOTA', votes: 50 },
    ];
    expect(pickNonNotaAcWinner(candidates)?.name).toBe('B');
  });

  it('skips NOTA even when NOTA has the most votes', () => {
    const candidates = [
      { name: 'A', party: 'DMK', votes: 100 },
      { name: 'NOTA', party: 'NOTA', votes: 500 },
      { name: 'B', party: 'AIADMK', votes: 300 },
    ];
    expect(pickNonNotaAcWinner(candidates)?.name).toBe('B');
  });

  it('falls back to NOTA itself if every candidate is NOTA', () => {
    const candidates = [{ name: 'NOTA', party: 'NOTA', votes: 10 }];
    expect(pickNonNotaAcWinner(candidates)?.name).toBe('NOTA');
  });

  it('matches party name case-insensitively', () => {
    const candidates = [
      { name: 'Nota', party: 'nota', votes: 900 },
      { name: 'Real', party: 'DMK', votes: 10 },
    ];
    expect(pickNonNotaAcWinner(candidates)?.name).toBe('Real');
  });

  it('treats a missing votes field as zero rather than throwing', () => {
    const candidates = [
      { name: 'A', party: 'DMK' },
      { name: 'B', party: 'AIADMK', votes: 5 },
    ];
    expect(pickNonNotaAcWinner(candidates)?.name).toBe('B');
  });
});

describe('assignAcWinnerBySchemaId', () => {
  it('does nothing when schema id is missing', () => {
    const winners: Record<string, { party: string; candidate: string }> = {};
    assignAcWinnerBySchemaId(winners, null, 'DMK', 'A');
    assignAcWinnerBySchemaId(winners, undefined, 'DMK', 'A');
    expect(winners).toEqual({});
  });

  it('assigns a fresh winner for a new schema id', () => {
    const winners: Record<string, { party: string; candidate: string }> = {};
    assignAcWinnerBySchemaId(winners, 'TN-001', 'DMK', 'Winner Name');
    expect(winners['TN-001']).toEqual({ party: 'DMK', candidate: 'Winner Name' });
  });

  it('does not overwrite a real winner with a duplicate NOTA row', () => {
    const winners: Record<string, { party: string; candidate: string }> = {
      'TN-001': { party: 'DMK', candidate: 'Real Winner' },
    };
    assignAcWinnerBySchemaId(winners, 'TN-001', 'NOTA', 'NOTA');
    expect(winners['TN-001']).toEqual({ party: 'DMK', candidate: 'Real Winner' });
  });

  it('does overwrite a prior NOTA placeholder with a real winner', () => {
    const winners: Record<string, { party: string; candidate: string }> = {
      'TN-001': { party: 'NOTA', candidate: 'NOTA' },
    };
    assignAcWinnerBySchemaId(winners, 'TN-001', 'DMK', 'Real Winner');
    expect(winners['TN-001']).toEqual({ party: 'DMK', candidate: 'Real Winner' });
  });

  it('matches NOTA case-insensitively on both the incoming and existing party', () => {
    const winners: Record<string, { party: string; candidate: string }> = {
      'TN-001': { party: 'DMK', candidate: 'Real Winner' },
    };
    assignAcWinnerBySchemaId(winners, 'TN-001', 'nota', 'nota');
    expect(winners['TN-001']).toEqual({ party: 'DMK', candidate: 'Real Winner' });
  });
});
