import { describe, it, expect } from 'vitest';
import {
  currentUrlLocation,
  withUrlLocation,
  viewSwitchUrlLocation,
  type UrlLocationInput,
} from './urlLocation';

const base: UrlLocationInput = {
  currentState: 'Tamil Nadu',
  currentView: 'assemblies',
  currentPC: null,
  currentDistrict: null,
  currentAssembly: 'Arani',
  selectedYear: 2021,
  selectedACPCYear: null,
  showACsWithinPC: true,
  blogOpen: false,
};

describe('currentUrlLocation', () => {
  it('passes the plain location fields straight through', () => {
    expect(currentUrlLocation(base)).toMatchObject({
      state: 'Tamil Nadu',
      view: 'assemblies',
      pc: null,
      district: null,
      assembly: 'Arani',
      blog: false,
    });
  });

  describe('the year slot is shared, so only one year may claim it', () => {
    it('uses the assembly year when no PC year is active', () => {
      const out = currentUrlLocation(base);
      expect(out.year).toBe(2021);
      expect(out.pcYear).toBeNull();
    });

    it('lets an active PC year win and clears the assembly year', () => {
      const out = currentUrlLocation({ ...base, selectedACPCYear: 2024 });
      expect(out.pcYear).toBe(2024);
      expect(out.year).toBeNull();
    });

    it('treats PC year 0 as active rather than falsy', () => {
      // guards the `!= null` check against a `!selectedACPCYear` regression
      const out = currentUrlLocation({ ...base, selectedACPCYear: 0 });
      expect(out.pcYear).toBe(0);
      expect(out.year).toBeNull();
    });
  });

  describe('showACs only applies inside a PC', () => {
    it('is null when no PC is selected, whatever the toggle says', () => {
      expect(currentUrlLocation({ ...base, showACsWithinPC: true }).showACs).toBeNull();
      expect(currentUrlLocation({ ...base, showACsWithinPC: false }).showACs).toBeNull();
    });

    it('is carried through when a PC is selected', () => {
      const withPc = { ...base, currentPC: 'Chennai South' };
      expect(currentUrlLocation({ ...withPc, showACsWithinPC: false }).showACs).toBe(false);
      expect(currentUrlLocation({ ...withPc, showACsWithinPC: true }).showACs).toBe(true);
    });

    it('defaults to true inside a PC when the toggle is unset', () => {
      expect(
        currentUrlLocation({ ...base, currentPC: 'Chennai South', showACsWithinPC: null }).showACs
      ).toBe(true);
    });
  });

  it('omits tab and blogPost so callers must decide explicitly', () => {
    const out = currentUrlLocation(base);
    expect('tab' in out).toBe(false);
    expect('blogPost' in out).toBe(false);
  });
});

describe('withUrlLocation', () => {
  it('requires tab/blogPost and merges them in', () => {
    const out = withUrlLocation(base, { tab: 'booths', blogPost: null });
    expect(out.tab).toBe('booths');
    expect(out.blogPost).toBeNull();
    expect(out.state).toBe('Tamil Nadu');
  });

  it('lets overrides win over the derived location', () => {
    const out = withUrlLocation(base, { tab: null, blogPost: null, blog: true });
    expect(out.blog).toBe(true);
  });

  it('can override a derived field such as district', () => {
    const out = withUrlLocation(
      { ...base, currentDistrict: 'Vellore' },
      { tab: null, blogPost: null, district: null }
    );
    expect(out.district).toBeNull();
  });
});

describe('viewSwitchUrlLocation', () => {
  it('resets pc/district/tab/blog, whatever they currently are', () => {
    expect(viewSwitchUrlLocation({ state: 'Kerala', view: 'districts', year: 2021 })).toMatchObject(
      {
        pc: null,
        district: null,
        assembly: null,
        pcYear: null,
        tab: null,
        showACs: null,
        blog: false,
        blogPost: null,
      }
    );
  });

  it('carries the state, view and year through unchanged', () => {
    const out = viewSwitchUrlLocation({ state: 'Kerala', view: 'districts', year: 2021 });
    expect(out.state).toBe('Kerala');
    expect(out.view).toBe('districts');
    expect(out.year).toBe(2021);
  });

  it('keeps the assembly only when explicitly passed (switching into assemblies view)', () => {
    const out = viewSwitchUrlLocation({
      state: 'Kerala',
      view: 'assemblies',
      year: 2021,
      assembly: 'Kollam',
    });
    expect(out.assembly).toBe('Kollam');
  });

  it('defaults assembly to null when not passed', () => {
    const out = viewSwitchUrlLocation({ state: 'Kerala', view: 'constituencies', year: 2024 });
    expect(out.assembly).toBeNull();
  });
});
