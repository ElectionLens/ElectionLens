import { useState, useCallback, useEffect, useMemo } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MapView } from './components/MapView';
import { BlogSection } from './components/BlogSection';
import { useElectionData } from './hooks/useElectionData';
import { useElectionResults } from './hooks/useElectionResults';
import { useParliamentResults } from './hooks/useParliamentResults';
import { useUrlState, type UrlState } from './hooks/useUrlState';
import { useSchema } from './hooks/useSchema';
import { normalizeName, toTitleCase } from './utils/helpers';
import { trackPageView, trackConstituencySelect } from './utils/firebase';
import type {
  GeoJSONData,
  StateFeature,
  DistrictFeature,
  ConstituencyFeature,
  AssemblyFeature,
  ViewMode,
} from './types';

/**
 * All available parliament election years (post-delimitation)
 */
const PARLIAMENT_YEARS = [2009, 2014, 2019, 2024];

/**
 * Main application component
 * Orchestrates data loading, navigation, and UI state
 */
function App(): JSX.Element {
  const {
    statesGeoJSON,
    parliamentGeoJSON,
    assemblyGeoJSON,
    districtsCache,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    loading,
    cacheStats,
    navigateToState,
    navigateToPC,
    navigateToDistrict,
    navigateToAssemblies,
    loadDistrictsForState,
    switchView,
    resetView,
    goBackToState,
    selectAssembly,
  } = useElectionData();

  // Assembly election results hook
  const {
    currentResult: electionResult,
    availableYears,
    selectedYear,
    getACResult,
    setSelectedYear,
    clearResult: clearElectionResult,
    loadStateIndex,
  } = useElectionResults();

  // Parliamentary election results hook
  const {
    currentResult: pcElectionResult,
    availableYears: pcAvailableYears,
    selectedYear: pcSelectedYear,
    getPCResult,
    setSelectedYear: setPCSelectedYear,
    clearResult: clearPCElectionResult,
  } = useParliamentResults();

  // Schema for canonical name resolution
  const { getAC, getPC, resolveACName, resolveStateName } = useSchema();

  // State for AC's parliament contributions (all years)
  const [parliamentContributions, setParliamentContributions] = useState<
    Record<
      number,
      {
        pcName: string;
        year: number;
        candidates: Array<{
          name: string;
          party: string;
          votes: number;
          voteShare: number;
          position: number;
        }>;
        validVotes: number;
      }
    >
  >({});

  // Selected parliament year in AC panel (for URL state)
  const [selectedACPCYear, setSelectedACPCYear] = useState<number | null>(null);

  // Available parliament years for the current AC
  const availablePCYears = Object.keys(parliamentContributions)
    .map(Number)
    .sort((a, b) => a - b);

  /**
   * Handle URL-based navigation (deep linking)
   */
  const handleUrlNavigate = useCallback(
    async (urlState: UrlState): Promise<void> => {
      if (!urlState.state) {
        resetView();
        setCurrentData(null);
        return;
      }

      // Find matching state name (case insensitive)
      let matchedState = urlState.state;
      if (statesGeoJSON?.features) {
        const found = statesGeoJSON.features.find((f) => {
          const name = normalizeName(f.properties.shapeName ?? f.properties.ST_NM ?? '');
          return name.toLowerCase() === urlState.state?.toLowerCase().replace(/-/g, ' ');
        });
        if (found) {
          matchedState = found.properties.shapeName ?? found.properties.ST_NM ?? urlState.state;
        }
      }
      console.log(
        '[handleUrlNavigate] urlState.state:',
        urlState.state,
        '→ matchedState:',
        matchedState
      );

      if (urlState.pc) {
        // First navigate to state, then to PC
        await navigateToState(matchedState);
        const pcName = toTitleCase(urlState.pc.replace(/-/g, ' ')).toUpperCase();
        const data = await navigateToPC(pcName, matchedState);
        setCurrentData(data);
        if (urlState.assembly) {
          // Convert assembly name to match GeoJSON format (Title Case, uppercase for comparison)
          const acName = toTitleCase(urlState.assembly).toUpperCase();
          selectAssembly(acName);
          await getACResult(acName, matchedState, urlState.year ?? undefined);
          // Parliament contributions loaded by useEffect when currentAssembly changes
          // Set PC year if provided in URL (year=pc-YYYY format)
          if (urlState.pcYear) {
            setSelectedACPCYear(urlState.pcYear);
          }
        } else {
          // No assembly selected - load PC election results for the PC view
          await getPCResult(pcName, matchedState, urlState.year ?? undefined);
        }
      } else if (urlState.district) {
        // First navigate to state districts, then to specific district
        await loadDistrictsForState(matchedState);
        const districtName = toTitleCase(urlState.district);
        const data = await navigateToDistrict(districtName, matchedState);
        setCurrentData(data);
        if (urlState.assembly) {
          // Convert assembly name to match GeoJSON format (Title Case, uppercase for comparison)
          const acName = toTitleCase(urlState.assembly).toUpperCase();
          selectAssembly(acName);
          await getACResult(acName, matchedState, urlState.year ?? undefined);
          // Parliament contributions loaded by useEffect when currentAssembly changes
          // Set PC year if provided in URL (year=pc-YYYY format)
          if (urlState.pcYear) {
            setSelectedACPCYear(urlState.pcYear);
          }
        }
      } else if (urlState.view === 'assemblies') {
        // All assemblies view for a state
        const data = await navigateToAssemblies(matchedState);
        setCurrentData(data);
        if (urlState.assembly) {
          // Specific assembly selected
          const acName = toTitleCase(urlState.assembly).toUpperCase();
          selectAssembly(acName);
          await getACResult(acName, matchedState, urlState.year ?? undefined);
          // Set PC year if provided in URL (year=pc-YYYY format)
          if (urlState.pcYear) {
            setSelectedACPCYear(urlState.pcYear);
          }
        }
      } else if (urlState.view === 'districts') {
        const data = await loadDistrictsForState(matchedState);
        setCurrentData(data);
      } else {
        const data = await navigateToState(matchedState);
        setCurrentData(data);
      }
    },
    [
      statesGeoJSON,
      navigateToState,
      navigateToPC,
      navigateToDistrict,
      navigateToAssemblies,
      loadDistrictsForState,
      resetView,
      selectAssembly,
      getACResult,
      getPCResult,
    ]
  );

  // URL state management for deep linking
  // Wait for statesGeoJSON to be loaded before processing URL
  const isDataReady = Boolean(statesGeoJSON);
  // Use the appropriate year based on context:
  // - For AC view: use assembly year (selectedYear)
  // - For PC view (no assembly): use parliament year (pcSelectedYear)
  const urlYear = currentAssembly ? selectedYear : pcSelectedYear;
  const { getShareableUrl } = useUrlState(
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    urlYear,
    selectedACPCYear,
    handleUrlNavigate,
    isDataReady
  );

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Desktop sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Blog section state
  const [blogOpen, setBlogOpen] = useState<boolean>(false);

  // Current displayed data
  const [currentData, setCurrentData] = useState<GeoJSONData | null>(null);

  /**
   * Update document title dynamically for SEO and browser tabs
   * Also track page views for analytics
   */
  useEffect(() => {
    let title = 'Election Lens - India Electoral Map';

    if (electionResult) {
      // Constituency selected with election result
      title = `${(electionResult.constituencyNameOriginal ?? electionResult.name ?? electionResult.constituencyName ?? 'Constituency').toUpperCase()} ${electionResult.year ?? ''} Results | Election Lens`;
    } else if (currentAssembly) {
      title = `${currentAssembly} | Election Lens`;
    } else if (currentPC) {
      title = `${currentPC} PC, ${currentState} | Election Lens`;
    } else if (currentDistrict) {
      title = `${currentDistrict} District, ${currentState} | Election Lens`;
    } else if (currentState) {
      title = `${currentState} Elections | Election Lens`;
    }

    document.title = title;

    // Track page view in Firebase Analytics
    trackPageView(window.location.pathname, title);
  }, [currentState, currentPC, currentDistrict, currentAssembly, electionResult]);

  /**
   * Toggle mobile sidebar visibility
   */
  const toggleSidebar = useCallback((): void => {
    setSidebarOpen((prev) => !prev);
  }, []);

  /**
   * Close mobile sidebar
   */
  const closeSidebar = useCallback((): void => {
    setSidebarOpen(false);
  }, []);

  /**
   * Toggle desktop sidebar collapsed state
   */
  const toggleSidebarCollapsed = useCallback((): void => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  /**
   * Auto-collapse sidebar on desktop when election panel opens
   */
  useEffect(() => {
    const hasPanelOpen = !!electionResult || !!pcElectionResult || blogOpen;
    if (hasPanelOpen && window.innerWidth > 768) {
      setSidebarCollapsed(true);
    }
  }, [electionResult, pcElectionResult, blogOpen]);

  /**
   * Close sidebar on mobile after action
   */
  const closeSidebarOnMobile = useCallback((): void => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }, [closeSidebar]);

  // Load initial data and update on state changes
  useEffect(() => {
    async function updateData(): Promise<void> {
      console.log(
        '[useEffect updateData] currentState:',
        currentState,
        'currentView:',
        currentView,
        'currentPC:',
        currentPC,
        'currentDistrict:',
        currentDistrict
      );
      if (currentPC && currentState) {
        const data = await navigateToPC(currentPC, currentState);
        console.log(
          '[useEffect updateData] navigateToPC result:',
          data?.features?.length,
          'features'
        );
        setCurrentData(data);
      } else if (currentDistrict && currentState) {
        const data = await navigateToDistrict(currentDistrict, currentState);
        console.log(
          '[useEffect updateData] navigateToDistrict result:',
          data?.features?.length,
          'features'
        );
        setCurrentData(data);
      } else if (currentState) {
        if (currentView === 'constituencies') {
          const data = await navigateToState(currentState);
          console.log(
            '[useEffect updateData] navigateToState result:',
            data?.features?.length,
            'features'
          );
          setCurrentData(data);
        } else if (currentView === 'assemblies') {
          const data = await navigateToAssemblies(currentState);
          console.log(
            '[useEffect updateData] navigateToAssemblies result:',
            data?.features?.length,
            'features'
          );
          setCurrentData(data);
        } else if (currentView === 'districts') {
          const data = await loadDistrictsForState(currentState);
          console.log(
            '[useEffect updateData] loadDistrictsForState result:',
            data?.features?.length,
            'features'
          );
          setCurrentData(data);
        }
      } else {
        setCurrentData(null);
      }
    }
    void updateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState, currentView, currentPC, currentDistrict]);

  /**
   * Handle state click from map or sidebar
   */
  const handleStateClick = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarOnMobile();
      clearElectionResult();
      clearPCElectionResult();
      const data = await navigateToState(stateName);
      setCurrentData(data);
      // Pre-load election index for the state
      void loadStateIndex(stateName);
      // Track analytics
      trackConstituencySelect('state', stateName);
    },
    [
      navigateToState,
      closeSidebarOnMobile,
      loadStateIndex,
      clearElectionResult,
      clearPCElectionResult,
    ]
  );

  /**
   * Handle district click from map or sidebar
   */
  const handleDistrictClick = useCallback(
    async (districtName: string, _feature: DistrictFeature): Promise<void> => {
      closeSidebarOnMobile();
      if (!currentState) return;
      selectAssembly(null); // Clear assembly when navigating to new district
      clearElectionResult();
      clearPCElectionResult();
      const data = await navigateToDistrict(districtName, currentState);
      setCurrentData(data);
      // Track analytics
      trackConstituencySelect('district', districtName, currentState);
    },
    [
      navigateToDistrict,
      currentState,
      closeSidebarOnMobile,
      selectAssembly,
      clearElectionResult,
      clearPCElectionResult,
    ]
  );

  /**
   * Handle constituency click from map or sidebar
   */
  const handleConstituencyClick = useCallback(
    async (pcName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarOnMobile();
      if (!currentState) return;
      selectAssembly(null); // Clear assembly when navigating to new PC
      clearElectionResult();
      const data = await navigateToPC(pcName, currentState);
      setCurrentData(data);
      // Load PC election results
      await getPCResult(pcName, currentState);
      // Track analytics
      trackConstituencySelect('pc', pcName, currentState);
    },
    [
      navigateToPC,
      currentState,
      closeSidebarOnMobile,
      selectAssembly,
      clearElectionResult,
      getPCResult,
    ]
  );

  /**
   * Get related states to search (for boundary changes like AP-Telangana)
   */
  const getRelatedStates = (state: string): string[] => {
    const normalizedState = state.toUpperCase();
    const related: Record<string, string[]> = {
      'ANDHRA PRADESH': ['telangana'],
      TELANGANA: ['andhra-pradesh'],
      'MADHYA PRADESH': ['chhattisgarh'],
      CHHATTISGARH: ['madhya-pradesh'],
      BIHAR: ['jharkhand'],
      JHARKHAND: ['bihar'],
      'UTTAR PRADESH': ['uttarakhand'],
      UTTARAKHAND: ['uttar-pradesh'],
    };
    return related[normalizedState] || [];
  };

  /**
   * Load AC's contribution to all parliament elections
   */
  const loadAllParliamentContributions = useCallback(
    async (acName: string, pcName: string, stateName: string) => {
      // Use state ID for folder path (e.g., "RJ" instead of "rajasthan")
      const stateId = resolveStateName(stateName);
      const stateSlug =
        stateId ||
        stateName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(
            /[āīūṭḍṇṃ]/g,
            (c) => ({ ā: 'a', ī: 'i', ū: 'u', ṭ: 't', ḍ: 'd', ṇ: 'n', ṃ: 'm' })[c] || c
          );
      const relatedStates = getRelatedStates(stateName);

      const contributions: Record<
        number,
        {
          pcName: string;
          year: number;
          candidates: Array<{
            name: string;
            party: string;
            votes: number;
            voteShare: number;
            position: number;
          }>;
          validVotes: number;
        }
      > = {};

      // Load all parliament years in parallel
      await Promise.all(
        PARLIAMENT_YEARS.map(async (parliamentYear) => {
          try {
            const response = await fetch(`/data/elections/pc/${stateSlug}/${parliamentYear}.json`);

            if (!response.ok) return;

            const pcData = (await response.json()) as Record<
              string,
              {
                constituencyName?: string;
                constituencyNameOriginal?: string;
                candidates: Array<{
                  name: string;
                  party: string;
                  votes: number;
                  voteShare: number;
                  position: number;
                  acWiseVotes?: Array<{
                    acName: string;
                    votes: number;
                    voteShare: number;
                  }>;
                }>;
              }
            >;

            // Helper to find AC in a PC's candidates
            const findAcInPC = (
              pcCandidates: (typeof pcData)[string]['candidates'],
              acName: string,
              normalizeAcName: (n: string) => string,
              stripSpaces: (n: string) => string,
              createFuzzyKey: (n: string) => string,
              _similarityScore: (a: string, b: string) => number // Prefixed with _ to indicate intentionally unused
            ) => {
              const acKeyNormalized = normalizeAcName(acName);
              const acKeyStripped = stripSpaces(acName);
              const acKeyFuzzy = createFuzzyKey(acName);

              for (const candidate of pcCandidates) {
                if (!candidate.acWiseVotes) continue;

                let acVotes = candidate.acWiseVotes.find((av) => {
                  const avNameNormalized = normalizeAcName(av.acName);
                  const avNameStripped = stripSpaces(av.acName);
                  const avNameFuzzy = createFuzzyKey(av.acName);
                  return (
                    avNameNormalized === acKeyNormalized ||
                    avNameStripped === acKeyStripped ||
                    avNameFuzzy === acKeyFuzzy ||
                    avNameNormalized.includes(acKeyNormalized) ||
                    acKeyNormalized.includes(avNameNormalized)
                  );
                });

                if (!acVotes && acKeyStripped.length >= 5) {
                  let bestMatch: (typeof candidate.acWiseVotes)[0] | undefined;
                  let bestScore = 0.8;
                  for (const av of candidate.acWiseVotes) {
                    const avStripped = stripSpaces(av.acName);
                    const aChars = new Set(acKeyStripped.split(''));
                    const bChars = new Set(avStripped.split(''));
                    let common = 0;
                    for (const c of aChars) {
                      if (bChars.has(c)) common++;
                    }
                    const score = common / new Set([...aChars, ...bChars]).size;
                    if (score > bestScore) {
                      bestScore = score;
                      bestMatch = av;
                    }
                  }
                  acVotes = bestMatch;
                }

                if (acVotes) return { candidate, acVotes };
              }
              return null;
            };

            // Find the PC in the data - try multiple matching strategies
            const pcKey = pcName.toUpperCase();
            let pc = pcData[pcKey];

            if (!pc) {
              // Try finding by name fields
              pc = Object.values(pcData).find(
                (p) =>
                  p.constituencyName?.toUpperCase() === pcKey ||
                  p.constituencyNameOriginal?.toUpperCase() === pcKey ||
                  p.constituencyName?.toUpperCase().includes(pcKey) ||
                  pcKey.includes(p.constituencyName?.toUpperCase() || '')
              ) as typeof pc;
            }

            // Extract AC-wise results from each candidate's acWiseVotes
            // Normalize AC name for matching - handle spelling variations and format differences
            const normalizeAcName = (name: string): string => {
              return (
                name
                  .toUpperCase()
                  .trim()
                  // Remove reservation type suffixes like (BL), (SC), (ST), (GEN)
                  .replace(/\s*\((BL|SC|ST|GEN)\)\s*/gi, ' ')
                  .replace(/[()]/g, ' ') // Replace remaining parentheses with spaces
                  .replace(/-/g, ' ') // Replace hyphens with spaces (Hubli-Dharwad -> Hubli Dharwad)
                  .replace(/\s+/g, ' ') // Normalize multiple spaces
                  .replace(/TIRUCHIRAPALLI(?!P)/g, 'TIRUCHIRAPPALLI') // Normalize single P to double P
                  .replace(/VIJAYWADA/g, 'VIJAYAWADA') // Fix Vijayawada spelling
                  .trim()
              );
            };

            // Create a stripped version with no spaces for matching "Seelam Pur" vs "Seelampur"
            const stripSpaces = (name: string): string => {
              return normalizeAcName(name).replace(/\s+/g, '');
            };

            // Create a fuzzy key by removing vowels and normalizing consonants
            const createFuzzyKey = (name: string): string => {
              return stripSpaces(name)
                .replace(/[?-]/g, '') // Remove special chars
                .replace(/RURAL/g, 'GRAMIN') // Rural = Gramin
                .replace(/GANJ$/g, 'GUNGE') // Tollyganj -> Tollygunge
                .replace(/GUNGE$/g, 'GUNGE') // Standardize
                .replace(/PURBA$/g, 'EAST') // Purba = East
                .replace(/PASCHIM$/g, 'WEST') // Paschim = West
                .replace(/DAKSHIN$/g, 'SOUTH') // Dakshin = South
                .replace(/UTTAR$/g, 'NORTH') // Uttar = North
                .replace(/SH/g, 'S') // Normalize SH to S (Sikaripara vs Shikaripara)
                .replace(/PH/g, 'F') // Normalize PH to F
                .replace(/TH/g, 'T') // Normalize TH to T
                .replace(/Y/g, 'I') // Normalize Y to I
                .replace(/W/g, 'V') // Normalize W to V (Sumawali vs Sumaoli)
                .replace(/EE/g, 'I') // Normalize EE to I
                .replace(/OO/g, 'U') // Normalize OO to U
                .replace(/AA/g, 'A') // Normalize AA to A
                .replace(/[AEIOU]/g, '') // Remove vowels
                .substring(0, 12); // First 12 consonants for comparison
            };

            // Calculate similarity score between two strings using Levenshtein distance
            const similarityScore = (a: string, b: string): number => {
              if (a === b) return 1;
              if (a.length === 0 || b.length === 0) return 0;

              // Simple character-based similarity for speed
              const aChars = new Set(a.split(''));
              const bChars = new Set(b.split(''));
              let common = 0;
              for (const c of aChars) {
                if (bChars.has(c)) common++;
              }
              const unionSize = new Set([...aChars, ...bChars]).size;
              return unionSize > 0 ? common / unionSize : 0;
            };

            const acCandidates: Array<{
              name: string;
              party: string;
              votes: number;
              voteShare: number;
              position: number;
            }> = [];

            // Determine which PC to search - first try specified PC, then search all PCs
            const searchPCs: Array<{ pc: typeof pc; pcName: string }> = [];

            if (pc && pc.candidates) {
              searchPCs.push({ pc, pcName: pc.constituencyNameOriginal || pcName });
            }

            // If no match in specified PC, search ALL PCs in the state
            let foundInPC: string | null = null;

            for (const { pc: searchPC, pcName: searchPCName } of searchPCs) {
              if (!searchPC?.candidates) continue;
              searchPC.candidates.forEach((candidate) => {
                if (candidate.acWiseVotes) {
                  const result = findAcInPC(
                    [candidate],
                    acName,
                    normalizeAcName,
                    stripSpaces,
                    createFuzzyKey,
                    similarityScore
                  );
                  if (result) {
                    acCandidates.push({
                      name: result.candidate.name,
                      party: result.candidate.party,
                      votes: result.acVotes.votes,
                      voteShare: result.acVotes.voteShare,
                      position: 0,
                    });
                    foundInPC = searchPCName;
                  }
                }
              });
            }

            // If still not found, search ALL PCs in state data
            if (acCandidates.length === 0) {
              for (const [, otherPC] of Object.entries(pcData)) {
                if (!otherPC.candidates) continue;
                for (const candidate of otherPC.candidates) {
                  if (!candidate.acWiseVotes) continue;
                  const result = findAcInPC(
                    [candidate],
                    acName,
                    normalizeAcName,
                    stripSpaces,
                    createFuzzyKey,
                    similarityScore
                  );
                  if (result) {
                    acCandidates.push({
                      name: result.candidate.name,
                      party: result.candidate.party,
                      votes: result.acVotes.votes,
                      voteShare: result.acVotes.voteShare,
                      position: 0,
                    });
                    foundInPC = otherPC.constituencyNameOriginal || 'Unknown PC';
                  }
                }
                if (acCandidates.length > 0) break; // Found in another PC
              }
            }

            // If still not found, try related states (for boundary changes like AP-Telangana)
            if (acCandidates.length === 0 && relatedStates.length > 0) {
              for (const relatedState of relatedStates) {
                try {
                  const relatedResponse = await fetch(
                    `/data/elections/pc/${relatedState}/${parliamentYear}.json`
                  );
                  if (!relatedResponse.ok) continue;

                  const relatedPcData = (await relatedResponse.json()) as Record<
                    string,
                    {
                      constituencyName?: string;
                      constituencyNameOriginal?: string;
                      candidates: Array<{
                        name: string;
                        party: string;
                        votes: number;
                        voteShare: number;
                        position: number;
                        acWiseVotes?: Array<{
                          acName: string;
                          votes: number;
                          voteShare: number;
                        }>;
                      }>;
                    }
                  >;

                  for (const [, relatedPC] of Object.entries(relatedPcData)) {
                    if (!relatedPC.candidates) continue;
                    for (const candidate of relatedPC.candidates) {
                      if (!candidate.acWiseVotes) continue;
                      const result = findAcInPC(
                        [candidate],
                        acName,
                        normalizeAcName,
                        stripSpaces,
                        createFuzzyKey,
                        similarityScore
                      );
                      if (result) {
                        acCandidates.push({
                          name: result.candidate.name,
                          party: result.candidate.party,
                          votes: result.acVotes.votes,
                          voteShare: result.acVotes.voteShare,
                          position: 0,
                        });
                        foundInPC = relatedPC.constituencyNameOriginal || 'Unknown PC';
                      }
                    }
                    if (acCandidates.length > 0) break;
                  }
                  if (acCandidates.length > 0) break;
                } catch {
                  // Silently fail for related state
                }
              }
            }

            if (acCandidates.length === 0) return;

            // Sort by votes to get correct positions
            acCandidates.sort((a, b) => b.votes - a.votes);
            acCandidates.forEach((c, idx) => {
              c.position = idx + 1;
            });

            contributions[parliamentYear] = {
              pcName: foundInPC || pcName,
              year: parliamentYear,
              candidates: acCandidates,
              validVotes: acCandidates.reduce((sum, c) => sum + c.votes, 0),
            };
          } catch (err) {
            // Silently fail for individual years
          }
        })
      );

      setParliamentContributions(contributions);
    },
    [resolveStateName]
  );

  /**
   * Load parliament contributions when assembly is selected via deep link
   * This effect runs when there's a selected assembly but no parliament contributions yet
   * Uses assemblyGeoJSON or schema to find the PC name
   */
  useEffect(() => {
    if (currentAssembly && currentState && Object.keys(parliamentContributions).length === 0) {
      // Try to find the PC name from assemblyGeoJSON first
      let pcName: string | null = null;

      if (assemblyGeoJSON) {
        const acFeature = assemblyGeoJSON.features.find(
          (f) => f.properties.AC_NAME?.toUpperCase() === currentAssembly.toUpperCase()
        );
        pcName = acFeature?.properties.PC_NAME ?? null;
      }

      // Fallback to schema if assemblyGeoJSON doesn't have the feature
      if (!pcName) {
        const stateId = resolveStateName(currentState);
        if (stateId) {
          const acId = resolveACName(currentAssembly, stateId);
          if (acId) {
            const acEntity = getAC(acId);
            if (acEntity?.pcId) {
              const pcEntity = getPC(acEntity.pcId);
              if (pcEntity) {
                pcName = pcEntity.name.toUpperCase();
              }
            }
          }
        }
      }

      if (pcName) {
        void loadAllParliamentContributions(currentAssembly, pcName, currentState);
      }
    }
  }, [
    currentAssembly,
    currentState,
    assemblyGeoJSON,
    parliamentContributions,
    loadAllParliamentContributions,
    resolveStateName,
    resolveACName,
    getAC,
    getPC,
  ]);

  /**
   * Handle assembly click - select, zoom, and show election results
   */
  const handleAssemblyClick = useCallback(
    async (acName: string, feature: AssemblyFeature): Promise<void> => {
      closeSidebarOnMobile(); // Close sidebar on mobile to show map + panel
      selectAssembly(acName);
      clearPCElectionResult(); // Close PC panel to show AC panel
      setParliamentContributions({}); // Clear previous contributions
      setSelectedACPCYear(null); // Reset PC year selection

      // Load election results for this AC - always show latest year
      if (currentState) {
        // Try to use schema for direct lookup (avoids fuzzy matching)
        const schemaId = feature.properties.schemaId;
        const schemaAC = schemaId ? getAC(schemaId) : null;

        await getACResult(acName, currentState, undefined, {
          schemaId,
          canonicalName: schemaAC?.name,
        });

        // Load all parliament contributions if we have PC info
        const pcName = feature.properties.PC_NAME;
        if (pcName) {
          await loadAllParliamentContributions(acName, pcName, currentState);
        }

        // Track analytics
        trackConstituencySelect('assembly', acName, currentState);
      }
    },
    [
      closeSidebarOnMobile,
      selectAssembly,
      currentState,
      getACResult,
      getAC,
      clearPCElectionResult,
      loadAllParliamentContributions,
    ]
  );

  /**
   * Handle closing the election panel
   */
  const handleCloseElectionPanel = useCallback((): void => {
    selectAssembly(null);
    clearElectionResult();
    setSelectedACPCYear(null); // Reset PC year selection
    // Note: Don't clear PC result when closing AC panel in PC view
    // The PC panel should remain visible
  }, [selectAssembly, clearElectionResult]);

  /**
   * Handle closing the PC election panel
   */
  const handleClosePCElectionPanel = useCallback((): void => {
    clearPCElectionResult();
  }, [clearPCElectionResult]);

  /**
   * Handle search selection - state
   */
  const handleSearchStateSelect = useCallback(
    async (stateName: string, _feature: StateFeature): Promise<void> => {
      closeSidebarOnMobile();
      const data = await navigateToState(stateName);
      setCurrentData(data);
    },
    [navigateToState, closeSidebarOnMobile]
  );

  /**
   * Handle search selection - constituency
   */
  const handleSearchConstituencySelect = useCallback(
    async (pcName: string, stateName: string, _feature: ConstituencyFeature): Promise<void> => {
      closeSidebarOnMobile();
      // First navigate to the state
      await navigateToState(stateName);
      // Then navigate to the PC
      const data = await navigateToPC(pcName, stateName);
      setCurrentData(data);
    },
    [navigateToState, navigateToPC, closeSidebarOnMobile]
  );

  /**
   * Handle search selection - assembly
   * Navigate to the assemblies view and select the assembly
   * URL: /state/ac/ac-name?year=YYYY
   */
  const handleSearchAssemblySelect = useCallback(
    async (acName: string, stateName: string, _feature: AssemblyFeature): Promise<void> => {
      closeSidebarOnMobile();

      // Navigate to assemblies view for the state
      const data = await navigateToAssemblies(stateName);
      setCurrentData(data);

      // Select the assembly and get its election result
      selectAssembly(acName);
      await getACResult(acName, stateName);
    },
    [navigateToAssemblies, selectAssembly, getACResult, closeSidebarOnMobile]
  );

  /**
   * Handle search selection - district
   * Navigate to the district view
   * URL: /state/district/district-name
   */
  const handleSearchDistrictSelect = useCallback(
    async (districtName: string, stateName: string, _feature: DistrictFeature): Promise<void> => {
      closeSidebarOnMobile();
      clearElectionResult();
      clearPCElectionResult();

      // Navigate to the district
      const data = await navigateToDistrict(districtName, stateName);
      setCurrentData(data);

      // Track analytics
      trackConstituencySelect('district', districtName, stateName);
    },
    [navigateToDistrict, closeSidebarOnMobile, clearElectionResult, clearPCElectionResult]
  );

  /**
   * Copy shareable URL to clipboard
   */
  const handleShare = useCallback(async (): Promise<void> => {
    const url = getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: selectedYear,
      pcYear: null,
      tab: null, // Tab is managed in ElectionResultPanel component
    });

    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
  ]);

  /**
   * Handle year change in assembly election results
   */
  const handleYearChange = useCallback(
    async (year: number): Promise<void> => {
      setSelectedYear(year);
      if (currentAssembly && currentState) {
        await getACResult(currentAssembly, currentState, year);
      }
    },
    [setSelectedYear, currentAssembly, currentState, getACResult]
  );

  /**
   * Handle year change in parliamentary election results
   */
  const handlePCYearChange = useCallback(
    async (year: number): Promise<void> => {
      setPCSelectedYear(year);
      if (currentPC && currentState) {
        await getPCResult(currentPC, currentState, year);
      }
    },
    [setPCSelectedYear, currentPC, currentState, getPCResult]
  );

  /**
   * Get current share URL for AC election results
   */
  const currentShareUrl = useMemo(() => {
    if (!currentAssembly) return undefined;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: selectedYear,
      pcYear: null,
      tab: null, // Tab is managed in ElectionResultPanel component
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedYear,
  ]);

  /**
   * Get share URL for PC contribution in AC panel (year=pc-YYYY format)
   */
  const pcContributionShareUrl = useMemo(() => {
    if (!currentAssembly || !selectedACPCYear) return undefined;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: currentDistrict,
      assembly: currentAssembly,
      year: null, // Don't include assembly year
      pcYear: selectedACPCYear, // This will generate year=pc-YYYY
      tab: null, // Tab is managed in ElectionResultPanel component
    });
  }, [
    getShareableUrl,
    currentState,
    currentView,
    currentPC,
    currentDistrict,
    currentAssembly,
    selectedACPCYear,
  ]);

  /**
   * Get current share URL for PC election results
   */
  const currentPCShareUrl = useMemo(() => {
    if (!currentPC) return undefined;
    return getShareableUrl({
      state: currentState,
      view: currentView,
      pc: currentPC,
      district: null,
      assembly: null,
      year: pcSelectedYear,
      pcYear: null,
      tab: null, // Tab is only for AC election panels
    });
  }, [getShareableUrl, currentState, currentView, currentPC, pcSelectedYear]);

  /**
   * Handle view switch between constituencies and districts
   */
  const handleSwitchView = useCallback(
    async (view: ViewMode): Promise<void> => {
      if (!currentState) {
        switchView(view);
        return;
      }

      // Each navigation function sets the view internally
      if (view === 'constituencies') {
        const data = await navigateToState(currentState);
        setCurrentData(data);
      } else if (view === 'assemblies') {
        const data = await navigateToAssemblies(currentState);
        setCurrentData(data);
      } else if (view === 'districts') {
        const data = await loadDistrictsForState(currentState);
        setCurrentData(data);
      }
    },
    [switchView, currentState, navigateToState, navigateToAssemblies, loadDistrictsForState]
  );

  /**
   * Handle reset to India view
   */
  const handleReset = useCallback((): void => {
    resetView();
    selectAssembly(null);
    clearElectionResult();
    clearPCElectionResult();
    setSelectedACPCYear(null);
    setCurrentData(null);
    setBlogOpen(false);
  }, [resetView, selectAssembly, clearElectionResult, clearPCElectionResult]);

  /**
   * Handle blog toggle
   */
  const handleBlogToggle = useCallback((): void => {
    setBlogOpen((prev) => !prev);
    if (!blogOpen) {
      // Close election panels when opening blog
      clearElectionResult();
      clearPCElectionResult();
    }
  }, [blogOpen, clearElectionResult, clearPCElectionResult]);

  /**
   * Handle blog close
   */
  const handleBlogClose = useCallback((): void => {
    setBlogOpen(false);
  }, []);

  /**
   * Handle go back to state from PC/district
   */
  const handleGoBackToState = useCallback(async (): Promise<void> => {
    goBackToState();
    clearElectionResult();
    clearPCElectionResult();
    if (currentState) {
      if (currentView === 'constituencies') {
        const data = await navigateToState(currentState);
        setCurrentData(data);
      } else if (currentView === 'assemblies') {
        const data = await navigateToAssemblies(currentState);
        setCurrentData(data);
      } else if (currentView === 'districts') {
        const data = await loadDistrictsForState(currentState);
        setCurrentData(data);
      }
    }
  }, [
    goBackToState,
    currentState,
    currentView,
    navigateToState,
    navigateToAssemblies,
    loadDistrictsForState,
    clearElectionResult,
    clearPCElectionResult,
  ]);

  /**
   * Handle go back one navigation level
   * Assembly selected -> PC/District view -> State view -> India view
   */
  const handleGoBack = useCallback(async (): Promise<void> => {
    if (currentAssembly) {
      // If assembly is selected, deselect it and stay in current view
      selectAssembly(null);
      clearElectionResult();
      setParliamentContributions({});
      setSelectedACPCYear(null); // Reset PC year selection

      // If we're in PC view, reload the PC election result to show the parliament panel
      if (currentPC && currentState) {
        await getPCResult(currentPC, currentState);
      }
    } else if (currentPC || currentDistrict) {
      // In PC or district view (no assembly selected), go back to state
      await handleGoBackToState();
    } else if (currentState) {
      // In state view, go back to India
      handleReset();
    }
  }, [
    currentAssembly,
    currentPC,
    currentDistrict,
    currentState,
    handleGoBackToState,
    handleReset,
    selectAssembly,
    clearElectionResult,
    getPCResult,
  ]);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className={`mobile-toggle ${sidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <div className="container">
        <Sidebar
          statesGeoJSON={statesGeoJSON}
          parliamentGeoJSON={parliamentGeoJSON}
          assemblyGeoJSON={assemblyGeoJSON}
          districtsCache={districtsCache}
          currentState={currentState}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          cacheStats={cacheStats}
          currentData={currentData}
          onStateClick={handleStateClick}
          onDistrictClick={handleDistrictClick}
          onConstituencyClick={handleConstituencyClick}
          onAssemblyClick={handleAssemblyClick}
          onSwitchView={handleSwitchView}
          onReset={handleReset}
          onGoBackToState={handleGoBackToState}
          onSearchStateSelect={handleSearchStateSelect}
          onSearchConstituencySelect={handleSearchConstituencySelect}
          onSearchAssemblySelect={handleSearchAssemblySelect}
          onSearchDistrictSelect={handleSearchDistrictSelect}
          onShare={handleShare}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
          onBlogClick={handleBlogToggle}
        />

        <MapView
          statesGeoJSON={statesGeoJSON}
          parliamentGeoJSON={parliamentGeoJSON}
          districtsCache={districtsCache}
          currentData={currentData}
          currentState={currentState}
          currentView={currentView}
          currentPC={currentPC}
          currentDistrict={currentDistrict}
          selectedAssembly={currentAssembly}
          electionResult={electionResult}
          shareUrl={currentShareUrl}
          availableYears={availableYears}
          selectedYear={selectedYear}
          parliamentContributions={parliamentContributions}
          availablePCYears={availablePCYears}
          selectedACPCYear={selectedACPCYear}
          pcContributionShareUrl={pcContributionShareUrl}
          pcElectionResult={pcElectionResult}
          pcShareUrl={currentPCShareUrl}
          pcAvailableYears={pcAvailableYears}
          pcSelectedYear={pcSelectedYear}
          onStateClick={handleStateClick}
          onDistrictClick={handleDistrictClick}
          onConstituencyClick={handleConstituencyClick}
          onAssemblyClick={handleAssemblyClick}
          onSwitchView={handleSwitchView}
          onReset={handleReset}
          onGoBack={handleGoBack}
          onCloseElectionPanel={handleCloseElectionPanel}
          onYearChange={handleYearChange}
          onACPCYearChange={setSelectedACPCYear}
          onClosePCElectionPanel={handleClosePCElectionPanel}
          onPCYearChange={handlePCYearChange}
        />
      </div>

      {/* Blog Section */}
      <BlogSection
        isOpen={blogOpen}
        onClose={handleBlogClose}
        onAssemblyClick={handleAssemblyClick}
        onNavigateToState={async (stateName: string) => {
          const data = await navigateToState(stateName);
          setCurrentData(data);
          // Switch to assemblies view for Tamil Nadu
          if (stateName === 'Tamil Nadu') {
            const assembliesData = await navigateToAssemblies(stateName);
            setCurrentData(assembliesData);
          }
        }}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay active">
          <div className="spinner"></div>
        </div>
      )}
    </>
  );
}

export default App;
