import { useState, useMemo } from 'react';
import { X, MapPin, Users, Search, ChevronDown, ChevronUp, Award } from 'lucide-react';
import type { BoothList, BoothResults, BoothWithResult, Candidate } from '../hooks/useBoothData';
import { getPartyColor } from '../utils/partyData';

function formatNumber(num: number): string {
  return num.toLocaleString('en-IN');
}

interface BoothResultsPanelProps {
  acName: string;
  boothList: BoothList | null;
  boothResults: BoothResults | null;
  boothsWithResults: BoothWithResult[];
  availableYears: number[];
  loading: boolean;
  error: string | null;
  selectedYear: number | null;
  onYearChange: (year: number) => void;
  onClose: () => void;
  onBoothSelect?: (boothId: string, lat?: number, lng?: number) => void;
}

type SortField = 'boothNo' | 'winner' | 'total' | 'margin';
type SortOrder = 'asc' | 'desc';
type BoothFilter = 'all' | 'women' | 'regular';

export function BoothResultsPanel({
  acName,
  boothList,
  boothResults,
  boothsWithResults,
  availableYears,
  loading,
  error,
  selectedYear,
  onYearChange,
  onClose,
  onBoothSelect,
}: BoothResultsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [boothFilter, setBoothFilter] = useState<BoothFilter>('all');
  const [sortField, setSortField] = useState<SortField>('boothNo');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [expandedBooth, setExpandedBooth] = useState<string | null>(null);

  // Filter and sort booths
  const filteredBooths = useMemo(() => {
    let result = [...boothsWithResults];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (booth) =>
          booth.boothNo.toLowerCase().includes(query) ||
          booth.name.toLowerCase().includes(query) ||
          booth.address.toLowerCase().includes(query) ||
          booth.area.toLowerCase().includes(query)
      );
    }

    // Apply booth type filter
    if (boothFilter !== 'all') {
      result = result.filter((booth) =>
        boothFilter === 'women' ? booth.type === 'women' : booth.type === 'regular'
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'boothNo':
          comparison = a.num - b.num;
          break;
        case 'winner':
          comparison = (a.winner?.party || '').localeCompare(b.winner?.party || '');
          break;
        case 'total':
          comparison = (a.result?.total || 0) - (b.result?.total || 0);
          break;
        case 'margin': {
          const marginA = a.result ? (a.result.votes[0] ?? 0) - (a.result.votes[1] ?? 0) : 0;
          const marginB = b.result ? (b.result.votes[0] ?? 0) - (b.result.votes[1] ?? 0) : 0;
          comparison = marginA - marginB;
          break;
        }
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [boothsWithResults, searchQuery, boothFilter, sortField, sortOrder]);

  // Stats
  const stats = useMemo(() => {
    if (!boothResults) return null;

    const womenBooths = boothsWithResults.filter((b) => b.type === 'women').length;
    const totalVotes = Object.values(boothResults.results).reduce((sum, r) => sum + r.total, 0);

    // Party-wise booth wins
    const partyWins: Record<string, number> = {};
    boothsWithResults.forEach((booth) => {
      if (booth.winner) {
        partyWins[booth.winner.party] = (partyWins[booth.winner.party] || 0) + 1;
      }
    });

    return {
      totalBooths: boothsWithResults.length,
      womenBooths,
      totalVotes,
      partyWins,
    };
  }, [boothResults, boothsWithResults]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleBoothExpand = (boothId: string) => {
    setExpandedBooth(expandedBooth === boothId ? null : boothId);
  };

  if (loading) {
    return (
      <div className="absolute top-0 right-0 w-96 h-full bg-white shadow-xl z-[1000] flex items-center justify-center">
        <div className="text-gray-500">Loading booth data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute top-0 right-0 w-96 h-full bg-white shadow-xl z-[1000] p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Booth Results</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>
        <div className="text-red-500 text-center py-8">
          <p>{error}</p>
          <p className="text-sm text-gray-500 mt-2">
            Booth-wise data is only available for select constituencies.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-0 right-0 w-[450px] h-full bg-white shadow-xl z-[1000] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold">{acName}</h2>
            <p className="text-emerald-100 text-sm">Booth-wise Results</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Year selector */}
        {availableYears.length > 0 && (
          <div className="mt-3 flex gap-2">
            {availableYears.map((year) => (
              <button
                key={year}
                onClick={() => onYearChange(year)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  selectedYear === year
                    ? 'bg-white text-emerald-600'
                    : 'bg-emerald-600/50 text-white hover:bg-emerald-600/70'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="p-3 bg-gray-50 border-b grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <div className="font-semibold text-gray-900">{stats.totalBooths}</div>
            <div className="text-gray-500 text-xs">Total Booths</div>
          </div>
          <div>
            <div className="font-semibold text-pink-600">{stats.womenBooths}</div>
            <div className="text-gray-500 text-xs">Women Booths</div>
          </div>
          <div>
            <div className="font-semibold text-gray-900">{formatNumber(stats.totalVotes)}</div>
            <div className="text-gray-500 text-xs">Total Votes</div>
          </div>
        </div>
      )}

      {/* Party Wins Summary */}
      {stats && Object.keys(stats.partyWins).length > 0 && (
        <div className="p-3 border-b flex flex-wrap gap-2">
          {Object.entries(stats.partyWins)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([party, wins]) => (
              <div
                key={party}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: `${getPartyColor(party)}20`,
                  color: getPartyColor(party),
                }}
              >
                <Award size={12} />
                {party}: {wins}
              </div>
            ))}
        </div>
      )}

      {/* Filters */}
      <div className="p-3 border-b space-y-2">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search booth number, name, or area..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setBoothFilter('all')}
            className={`px-3 py-1 rounded text-sm ${
              boothFilter === 'all'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setBoothFilter('women')}
            className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${
              boothFilter === 'women'
                ? 'bg-pink-100 text-pink-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Users size={14} /> Women
          </button>
          <button
            onClick={() => setBoothFilter('regular')}
            className={`px-3 py-1 rounded text-sm ${
              boothFilter === 'regular'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Regular
          </button>
        </div>
      </div>

      {/* Booth List */}
      <div className="flex-1 overflow-y-auto">
        {/* Table Header */}
        <div className="sticky top-0 bg-gray-100 border-b px-3 py-2 grid grid-cols-12 gap-2 text-xs font-medium text-gray-600">
          <button
            className="col-span-2 flex items-center gap-1 hover:text-gray-900"
            onClick={() => handleSort('boothNo')}
          >
            Booth
            {sortField === 'boothNo' &&
              (sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
          </button>
          <div className="col-span-4">Location</div>
          <button
            className="col-span-3 flex items-center gap-1 hover:text-gray-900"
            onClick={() => handleSort('winner')}
          >
            Winner
            {sortField === 'winner' &&
              (sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
          </button>
          <button
            className="col-span-3 flex items-center gap-1 justify-end hover:text-gray-900"
            onClick={() => handleSort('total')}
          >
            Votes
            {sortField === 'total' &&
              (sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
          </button>
        </div>

        {/* Booth Rows */}
        {filteredBooths.map((booth) => (
          <BoothRow
            key={booth.id}
            booth={booth}
            candidates={boothResults?.candidates || []}
            expanded={expandedBooth === booth.id}
            onToggle={() => toggleBoothExpand(booth.id)}
            onSelect={() => onBoothSelect?.(booth.id, booth.location?.lat, booth.location?.lng)}
          />
        ))}

        {filteredBooths.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No booths found matching your filters.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 text-center">
        Source: {boothList?.source || 'Election Commission'} • {boothResults?.date || ''}
      </div>
    </div>
  );
}

// Booth Row Component
interface BoothRowProps {
  booth: BoothWithResult;
  candidates: Candidate[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

function BoothRow({ booth, candidates, expanded, onToggle, onSelect: _onSelect }: BoothRowProps) {
  const winnerColor = booth.winner ? getPartyColor(booth.winner.party) : '#gray';

  return (
    <div className="border-b hover:bg-gray-50">
      {/* Main Row */}
      <div
        className="px-3 py-2 grid grid-cols-12 gap-2 items-center cursor-pointer"
        onClick={onToggle}
      >
        {/* Booth Number */}
        <div className="col-span-2 flex items-center gap-1">
          <span className="font-medium">{booth.boothNo}</span>
          {booth.type === 'women' && (
            <span className="text-pink-500" title="Women's Booth">
              👩
            </span>
          )}
        </div>

        {/* Location */}
        <div className="col-span-4 text-sm truncate" title={`${booth.name}, ${booth.address}`}>
          <div className="font-medium text-gray-900 truncate">{booth.name}</div>
          <div className="text-xs text-gray-500 truncate">{booth.area}</div>
        </div>

        {/* Winner */}
        <div className="col-span-3">
          {booth.winner ? (
            <div
              className="text-xs font-medium px-2 py-0.5 rounded inline-block"
              style={{ backgroundColor: `${winnerColor}20`, color: winnerColor }}
            >
              {booth.winner.party}
            </div>
          ) : (
            <span className="text-gray-400 text-xs">-</span>
          )}
        </div>

        {/* Votes */}
        <div className="col-span-3 text-right">
          {booth.result ? (
            <div>
              <div className="font-medium">{formatNumber(booth.result.total)}</div>
              {booth.winner && (
                <div className="text-xs text-gray-500">{booth.winner.percent.toFixed(1)}%</div>
              )}
            </div>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && booth.result && (
        <div className="px-3 pb-3 bg-gray-50">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <MapPin size={12} />
            {booth.address}
          </div>

          {/* Candidate-wise votes */}
          <div className="space-y-1">
            {candidates.map((candidate, idx) => {
              const votes = booth.result?.votes[idx] || 0;
              const percent = booth.result ? (votes / booth.result.total) * 100 : 0;
              const isWinner = idx === 0 || (booth.winner && candidate.name === booth.winner.name);
              const partyColor = getPartyColor(candidate.party);

              return (
                <div key={candidate.slNo} className="flex items-center gap-2">
                  <div className="w-16 text-xs font-medium" style={{ color: partyColor }}>
                    {candidate.party}
                  </div>
                  <div className="flex-1 h-4 bg-gray-200 rounded overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: partyColor,
                        opacity: isWinner ? 1 : 0.6,
                      }}
                    />
                  </div>
                  <div className="w-16 text-xs text-right">{formatNumber(votes)}</div>
                  <div className="w-12 text-xs text-right text-gray-500">{percent.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>

          {/* Rejected votes */}
          {(booth.result.rejected ?? 0) > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              Rejected: {formatNumber(booth.result.rejected ?? 0)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BoothResultsPanel;
