import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Search, X, Map, Building2, Landmark } from 'lucide-react';
import { normalizeName, toTitleCase } from '../utils/helpers';
import { STATE_FILE_MAP } from '../constants';
import type {
  StatesGeoJSON,
  ConstituenciesGeoJSON,
  AssembliesGeoJSON,
  DistrictsCache,
  StateFeature,
  ConstituencyFeature,
  AssemblyFeature,
  DistrictFeature,
} from '../types';

/** Search result item */
interface SearchResult {
  type: 'state' | 'constituency' | 'assembly' | 'district';
  name: string;
  displayName: string;
  state?: string;
  pc?: string;
  feature: StateFeature | ConstituencyFeature | AssemblyFeature | DistrictFeature;
}

/** SearchBox props */
interface SearchBoxProps {
  statesGeoJSON: StatesGeoJSON | null;
  parliamentGeoJSON: ConstituenciesGeoJSON | null;
  assemblyGeoJSON: AssembliesGeoJSON | null;
  districtsCache: DistrictsCache;
  onStateSelect: (stateName: string, feature: StateFeature) => void;
  onConstituencySelect: (pcName: string, stateName: string, feature: ConstituencyFeature) => void;
  onAssemblySelect: (acName: string, stateName: string, feature: AssemblyFeature) => void;
  onDistrictSelect: (districtName: string, stateName: string, feature: DistrictFeature) => void;
}

/**
 * SearchBox component with typeahead functionality
 * Searches across states, parliamentary constituencies, and assembly constituencies
 */
export function SearchBox({
  statesGeoJSON,
  parliamentGeoJSON,
  assemblyGeoJSON,
  districtsCache,
  onStateSelect,
  onConstituencySelect,
  onAssemblySelect,
  onDistrictSelect,
}: SearchBoxProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Build searchable index
  const searchIndex = useMemo((): SearchResult[] => {
    const results: SearchResult[] = [];

    // Add states
    if (statesGeoJSON?.features) {
      statesGeoJSON.features.forEach((f) => {
        const props = f.properties;
        const name = props.shapeName ?? props.ST_NM ?? '';
        if (name) {
          results.push({
            type: 'state',
            name: name,
            displayName: normalizeName(name),
            feature: f,
          });
        }
      });
    }

    // Add parliamentary constituencies
    if (parliamentGeoJSON?.features) {
      parliamentGeoJSON.features.forEach((f) => {
        const props = f.properties;
        const name = props.ls_seat_name ?? props.PC_NAME ?? '';
        const state = props.state_ut_name ?? props.STATE_NAME ?? '';
        if (name) {
          results.push({
            type: 'constituency',
            name: name,
            displayName: toTitleCase(name),
            state: state,
            feature: f,
          });
        }
      });
    }

    // Add districts from cache
    if (districtsCache && Object.keys(districtsCache).length > 0) {
      // Build reverse map: stateCode -> stateName
      const stateCodeToName: Record<string, string> = {};
      for (const [name, code] of Object.entries(STATE_FILE_MAP)) {
        stateCodeToName[code] = name;
      }

      const seenDistricts = new Set<string>();
      Object.entries(districtsCache).forEach(([stateKey, districtData]) => {
        if (!districtData?.features) return;

        // Get state name from the reverse map
        const stateCode = stateKey.replace('.geojson', '');
        const stateName = stateCodeToName[stateCode] ?? '';

        if (!stateName) return; // Skip if we can't find the state name

        districtData.features.forEach((f) => {
          const props = f.properties;
          const name = props.district ?? props.NAME ?? props.DISTRICT ?? '';
          const distState = normalizeName(props.state ?? stateName);
          const key = `${name}|${distState}`;

          if (name && !seenDistricts.has(key)) {
            seenDistricts.add(key);
            results.push({
              type: 'district',
              name: name,
              displayName: toTitleCase(normalizeName(name)),
              state: distState,
              feature: f,
            });
          }
        });
      });
    }

    // Add assembly constituencies (limit to prevent performance issues)
    if (assemblyGeoJSON?.features) {
      const seen = new Set<string>();
      assemblyGeoJSON.features.forEach((f) => {
        const props = f.properties;
        const name = props.AC_NAME ?? '';
        const state = props.ST_NAME ?? '';
        const pc = props.PC_NAME ?? '';
        const key = `${name}|${state}`;

        if (name && !seen.has(key)) {
          seen.add(key);
          results.push({
            type: 'assembly',
            name: name,
            displayName: toTitleCase(name),
            state: state,
            pc: pc,
            feature: f,
          });
        }
      });
    }

    return results;
  }, [statesGeoJSON, parliamentGeoJSON, assemblyGeoJSON, districtsCache]);

  // Filter results based on query
  const filteredResults = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];

    const normalizedQuery = query.toLowerCase().trim();

    const matches = searchIndex.filter((item) => {
      const normalizedName = item.displayName.toLowerCase();
      const normalizedState = item.state ? item.state.toLowerCase() : '';

      return normalizedName.includes(normalizedQuery) || normalizedState.includes(normalizedQuery);
    });

    // Sort: exact matches first, then by type (state > constituency > district > assembly)
    matches.sort((a, b) => {
      const aExact = a.displayName.toLowerCase().startsWith(normalizedQuery);
      const bExact = b.displayName.toLowerCase().startsWith(normalizedQuery);
      if (aExact !== bExact) return aExact ? -1 : 1;

      const typeOrder = { state: 0, constituency: 1, district: 2, assembly: 3 };
      return typeOrder[a.type] - typeOrder[b.type];
    });

    return matches.slice(0, 20); // Limit results
  }, [query, searchIndex]);

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult): void => {
      setQuery('');
      setIsOpen(false);

      if (result.type === 'state') {
        onStateSelect(result.name, result.feature as StateFeature);
      } else if (result.type === 'constituency') {
        onConstituencySelect(
          result.name,
          result.state ?? '',
          result.feature as ConstituencyFeature
        );
      } else if (result.type === 'district') {
        onDistrictSelect(result.name, result.state ?? '', result.feature as DistrictFeature);
      } else if (result.type === 'assembly') {
        onAssemblySelect(result.name, result.state ?? '', result.feature as AssemblyFeature);
      }
    },
    [onStateSelect, onConstituencySelect, onDistrictSelect, onAssemblySelect]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (!isOpen || filteredResults.length === 0) {
        if (e.key === 'ArrowDown' && filteredResults.length > 0) {
          setIsOpen(true);
          setSelectedIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredResults[selectedIndex]) {
            handleSelect(filteredResults[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, filteredResults, selectedIndex, handleSelect]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && resultsRef.current) {
      const selected = resultsRef.current.querySelector('.search-result-item.selected');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (!target.closest('.search-box')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Get icon for result type (CSS handles colors via data-type)
  const getTypeIcon = (type: SearchResult['type']): JSX.Element => {
    switch (type) {
      case 'state':
        return <Map size={14} />;
      case 'constituency':
        return <Building2 size={14} />;
      case 'district':
        return <Map size={14} />;
      case 'assembly':
        return <Landmark size={12} />;
    }
  };

  // Get badge color for result type
  const getTypeBadge = (type: SearchResult['type']): string => {
    switch (type) {
      case 'state':
        return 'State';
      case 'constituency':
        return 'PC';
      case 'district':
        return 'Dist';
      case 'assembly':
        return 'AC';
    }
  };

  return (
    <div className="search-box">
      <div className="search-input-wrapper">
        <span className="search-icon">
          <Search size={16} />
        </span>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search states, constituencies..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Search regions"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {query && (
          <button
            className="search-clear"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {isOpen && filteredResults.length > 0 && (
        <div className="search-results" ref={resultsRef} role="listbox">
          {filteredResults.map((result, index) => (
            <div
              key={`${result.type}-${result.name}-${result.state ?? ''}`}
              className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
              data-type={result.type}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              aria-selected={index === selectedIndex}
            >
              <span className="result-icon">{getTypeIcon(result.type)}</span>
              <div className="result-info">
                <span className="result-name">{result.displayName}</span>
                {result.state && <span className="result-state">{toTitleCase(result.state)}</span>}
              </div>
              <span className={`result-badge result-badge-${result.type}`}>
                {getTypeBadge(result.type)}
              </span>
            </div>
          ))}
        </div>
      )}

      {isOpen && query.trim() && filteredResults.length === 0 && (
        <div className="search-results">
          <div className="search-no-results">No results found for &ldquo;{query}&rdquo;</div>
        </div>
      )}
    </div>
  );
}
