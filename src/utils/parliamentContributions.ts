/**
 * Loads an assembly constituency's vote contribution across all parliamentary
 * election years, by fuzzy-matching the AC's name against each year's PC
 * candidate acWiseVotes data. Extracted out of App.tsx's ~360-line
 * loadAllParliamentContributions callback so the matching algorithm is
 * independently testable and doesn't bloat the main component.
 */
import { normalizePcNameCompact } from './helpers';

/** Parliamentary election years with published AC-wise contribution data. */
export const PARLIAMENT_YEARS = [2009, 2014, 2019, 2024];

/** One parliament election's candidate results, restricted to a single AC's votes. */
export interface ACContribution {
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

/** Schema resolver functions needed to locate the right state/PC data files. */
export interface ParliamentContributionResolvers {
  resolveStateName: (name: string) => string | null;
  resolvePCName: (name: string, stateId: string) => string | null;
}

function getRelatedStates(state: string): string[] {
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
}

/**
 * Load AC's contribution to all parliament elections
 */
export async function loadParliamentContributionsForAC(
  acName: string,
  pcName: string,
  stateName: string,
  { resolveStateName, resolvePCName }: ParliamentContributionResolvers
): Promise<Record<number, ACContribution>> {
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

        // Find PC in JSON: schema id (AS-NN) is authoritative; avoid pcKey.includes("") / TEZPUR-in-SONITPUR substring false positives.
        const pcKeyUpper = pcName.toUpperCase().trim();
        let pc: (typeof pcData)[string] | undefined;
        if (stateId) {
          const pcSchemaId = resolvePCName(pcName, stateId);
          if (pcSchemaId && pcData[pcSchemaId]) pc = pcData[pcSchemaId];
        }
        if (!pc) pc = pcData[pcKeyUpper];

        if (!pc) {
          const targetCompact = normalizePcNameCompact(pcName);
          pc = Object.values(pcData).find((p) => {
            const origU = (p.constituencyNameOriginal ?? '').toUpperCase().trim();
            const nameU = (p.constituencyName ?? '').toUpperCase().trim();
            return (
              origU === pcKeyUpper ||
              nameU === pcKeyUpper ||
              normalizePcNameCompact(p.constituencyNameOriginal ?? '') === targetCompact ||
              normalizePcNameCompact(p.constituencyName ?? '') === targetCompact
            );
          });
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

  return contributions;
}
