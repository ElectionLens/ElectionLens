import { describe, it, expect } from 'vitest';
import {
  assignWinnerNameKeys,
  normalizeWinnerNameKey,
  type ConstituencyWinnersMap,
} from './mapPolygonWinners';

const entry = (party: string, candidate = 'Someone'): { party: string; candidate: string } => ({
  party,
  candidate,
});

describe('normalizeWinnerNameKey', () => {
  it('assembly style strips any parenthetical and collapses whitespace', () => {
    expect(normalizeWinnerNameKey('Arani (SC)', 'assembly')).toBe('ARANI');
    expect(normalizeWinnerNameKey('Dr.  Radhakrishnan   Nagar', 'assembly')).toBe(
      'DR. RADHAKRISHNAN NAGAR'
    );
    expect(normalizeWinnerNameKey('Sriperumbudur (ex-Old)', 'assembly')).toBe('SRIPERUMBUDUR');
  });

  it('pc style collapses whitespace but preserves parentheticals', () => {
    expect(normalizeWinnerNameKey('Chennai  South', 'pc')).toBe('CHENNAI SOUTH');
    expect(normalizeWinnerNameKey('Tiruvallur (SC)', 'pc')).toBe('TIRUVALLUR (SC)');
  });

  it('pcSeatSuffix style strips only a trailing reservation marker', () => {
    expect(normalizeWinnerNameKey('Tiruvallur (SC)', 'pcSeatSuffix')).toBe('TIRUVALLUR');
    expect(normalizeWinnerNameKey('Nilgiris (ST)', 'pcSeatSuffix')).toBe('NILGIRIS');
    // A non-reservation parenthetical is NOT stripped by this style
    expect(normalizeWinnerNameKey('Vellore (ex-Old)', 'pcSeatSuffix')).toBe('VELLORE (EX-OLD)');
  });

  it('strips diacritics via normalizeName', () => {
    expect(normalizeWinnerNameKey('Puducherry\u0301', 'pc')).toBe('PUDUCHERRY');
  });
});

describe('assignWinnerNameKeys', () => {
  it('registers normalized, fuzzy and raw-uppercase keys', () => {
    const winners: ConstituencyWinnersMap = {};
    const key = assignWinnerNameKeys(winners, 'Dr. Radhakrishnan Nagar', entry('DMK'), {
      style: 'assembly',
    });

    expect(key).toBe('DR. RADHAKRISHNAN NAGAR');
    expect(winners['DR. RADHAKRISHNAN NAGAR']).toEqual(entry('DMK'));
    // fuzzy form: alphanumerics only
    expect(winners['DRRADHAKRISHNANNAGAR']).toEqual(entry('DMK'));
    // raw original uppercased
    expect(winners['DR. RADHAKRISHNAN NAGAR']).toEqual(entry('DMK'));
  });

  it('does not create a redundant fuzzy key when it equals the normalized key', () => {
    const winners: ConstituencyWinnersMap = {};
    assignWinnerNameKeys(winners, 'ARANI', entry('AIADMK'), { style: 'assembly' });
    expect(Object.keys(winners)).toEqual(['ARANI']);
  });

  it('adds the raw uppercase key when it differs from normalized and fuzzy', () => {
    const winners: ConstituencyWinnersMap = {};
    assignWinnerNameKeys(winners, 'Arani (SC)', entry('DMK'), { style: 'assembly' });
    expect(winners['ARANI']).toEqual(entry('DMK'));
    expect(winners['ARANI (SC)']).toEqual(entry('DMK'));
  });

  it('seeds known spelling variants only when applyVariants is set', () => {
    const without: ConstituencyWinnersMap = {};
    assignWinnerNameKeys(without, 'Pappireddipatti', entry('DMK'), { style: 'assembly' });
    expect(without['PAPPIREDDIPPATTI']).toBeUndefined();

    const with_: ConstituencyWinnersMap = {};
    assignWinnerNameKeys(with_, 'Pappireddipatti', entry('DMK'), {
      style: 'assembly',
      applyVariants: true,
    });
    expect(with_['PAPPIREDDIPATTI']).toEqual(entry('DMK'));
    expect(with_['PAPPIREDDIPPATTI']).toEqual(entry('DMK'));
  });

  it('variants never clobber an already-registered winner', () => {
    const winners: ConstituencyWinnersMap = {};
    winners['PAPPIREDDIPPATTI'] = entry('AIADMK', 'Incumbent');
    assignWinnerNameKeys(winners, 'Pappireddipatti', entry('DMK'), {
      style: 'assembly',
      applyVariants: true,
    });
    expect(winners['PAPPIREDDIPATTI']).toEqual(entry('DMK'));
    // pre-existing variant entry left intact
    expect(winners['PAPPIREDDIPPATTI']).toEqual(entry('AIADMK', 'Incumbent'));
  });

  it('later assignments overwrite the primary keys (last write wins)', () => {
    const winners: ConstituencyWinnersMap = {};
    assignWinnerNameKeys(winners, 'Arani', entry('AIADMK'), { style: 'assembly' });
    assignWinnerNameKeys(winners, 'Arani', entry('DMK'), { style: 'assembly' });
    expect(winners['ARANI']).toEqual(entry('DMK'));
  });

  it('keys a PC name under its schema-resolvable normalized form', () => {
    const winners: ConstituencyWinnersMap = {};
    const key = assignWinnerNameKeys(winners, 'Tiruvallur (SC)', entry('DMK'), {
      style: 'pcSeatSuffix',
    });
    expect(key).toBe('TIRUVALLUR');
    expect(winners['TIRUVALLUR']).toEqual(entry('DMK'));
    expect(winners['TIRUVALLUR (SC)']).toEqual(entry('DMK'));
  });
});
