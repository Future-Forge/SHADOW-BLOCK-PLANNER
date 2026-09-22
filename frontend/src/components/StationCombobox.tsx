import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MapPin, Check, Sparkles } from 'lucide-react';
import { useSimulation } from '../store/SimulationContext';
import type { StationItem, CorridorLeg } from '../api/types';

interface StationComboboxProps {
  label: string;
  value: string; // Station code (e.g. "ST")
  onChange: (code: string) => void;
  placeholder?: string;
  oppositeStationCode?: string; // If selecting "To", this is "From" (or vice versa)
  className?: string;
}

export const StationCombobox: React.FC<StationComboboxProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Search station identifier...',
  oppositeStationCode,
  className = '',
}) => {
  const { globalStationList, stations: contextStations, flyToStation } = useSimulation();
  const stations = useMemo(() => {
    return globalStationList && globalStationList.length > 0 ? globalStationList : contextStations;
  }, [globalStationList, contextStations]);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Corridor badge colors
  const getCorridorBadgeStyle = (leg: CorridorLeg | string) => {
    switch (leg) {
      case 'WEST':
        return 'bg-blue-900 text-blue-300 border border-blue-700/60 shadow-[0_0_6px_rgba(59,130,246,0.2)]';
      case 'EAST_COAST':
        return 'bg-emerald-900 text-emerald-300 border border-emerald-700/60 shadow-[0_0_6px_rgba(16,185,129,0.2)]';
      case 'SOUTH_WEST':
        return 'bg-purple-900 text-purple-300 border border-purple-700/60 shadow-[0_0_6px_rgba(168,85,247,0.2)]';
      case 'NORTH_EAST':
        return 'bg-amber-900 text-amber-300 border border-amber-700/60 shadow-[0_0_6px_rgba(245,158,11,0.2)]';
      default:
        return 'bg-[#1A2421] text-[#E2EAF4]/70 border border-[#2C3A35]';
    }
  };

  // Find the currently selected station
  const selectedStation = useMemo(() => {
    return stations.find((s) => s.code.toUpperCase() === value.toUpperCase());
  }, [stations, value]);

  // Sync display text when value changes
  useEffect(() => {
    if (selectedStation) {
      setQuery(`${selectedStation.code} - ${selectedStation.name}`);
    } else if (value) {
      setQuery(value);
    } else {
      setQuery('');
    }
  }, [selectedStation, value]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedStation) {
          setQuery(`${selectedStation.code} - ${selectedStation.name}`);
        } else if (value) {
          setQuery(value);
        } else {
          setQuery('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedStation, value]);

  // Information about opposite station (if specified) to prioritize adjacent hops
  const oppositeStation = useMemo(() => {
    if (!oppositeStationCode) return null;
    return stations.find((s) => s.code.toUpperCase() === oppositeStationCode.toUpperCase());
  }, [stations, oppositeStationCode]);

  // Filtered and scored list of stations
  const filteredStations = useMemo(() => {
    const trimmed = query.trim().toUpperCase();
    const isSelectedFormat =
      selectedStation &&
      (trimmed === `${selectedStation.code} - ${selectedStation.name}`.toUpperCase() ||
        trimmed === selectedStation.code.toUpperCase());

    const cleanSearch = isSelectedFormat ? '' : trimmed.includes('-') ? trimmed.split('-')[0].trim() : trimmed;

    let list = stations.slice();

    if (cleanSearch) {
      list = list.filter(
        (s) =>
          s.code.toUpperCase().includes(cleanSearch) ||
          s.name.toUpperCase().includes(cleanSearch) ||
          s.legs.some((l) => l.toUpperCase().includes(cleanSearch))
      );
    }

    return list.sort((a, b) => {
      if (cleanSearch) {
        const aCodeMatch = a.code.toUpperCase() === cleanSearch;
        const bCodeMatch = b.code.toUpperCase() === cleanSearch;
        if (aCodeMatch && !bCodeMatch) return -1;
        if (!aCodeMatch && bCodeMatch) return 1;

        const aStartsCode = a.code.toUpperCase().startsWith(cleanSearch);
        const bStartsCode = b.code.toUpperCase().startsWith(cleanSearch);
        if (aStartsCode && !bStartsCode) return -1;
        if (!aStartsCode && bStartsCode) return 1;

        const aStartsName = a.name.toUpperCase().startsWith(cleanSearch);
        const bStartsName = b.name.toUpperCase().startsWith(cleanSearch);
        if (aStartsName && !bStartsName) return -1;
        if (!aStartsName && bStartsName) return 1;
      }

      if (oppositeStation) {
        const aIsAdjacent = oppositeStation.adjacentCodes.includes(a.code);
        const bIsAdjacent = oppositeStation.adjacentCodes.includes(b.code);
        if (aIsAdjacent && !bIsAdjacent) return -1;
        if (!aIsAdjacent && bIsAdjacent) return 1;

        const aSharesLeg = a.legs.some((leg) => oppositeStation.legs.includes(leg));
        const bSharesLeg = b.legs.some((leg) => oppositeStation.legs.includes(leg));
        if (aSharesLeg && !bSharesLeg) return -1;
        if (!aSharesLeg && bSharesLeg) return 1;

        // Sort by proximity along the corridor if on the same leg
        if (
          aSharesLeg &&
          bSharesLeg &&
          a.cumulative_km !== undefined &&
          b.cumulative_km !== undefined &&
          oppositeStation.cumulative_km !== undefined
        ) {
          const distA = Math.abs(a.cumulative_km - oppositeStation.cumulative_km);
          const distB = Math.abs(b.cumulative_km - oppositeStation.cumulative_km);
          return distA - distB;
        }
      }

      // Group by canonical corridor leg order: WEST -> SOUTH_WEST -> EAST_COAST -> NORTH_EAST
      const legOrder: Record<string, number> = { WEST: 1, SOUTH_WEST: 2, EAST_COAST: 3, NORTH_EAST: 4 };
      const aLegRank = Math.min(...a.legs.map((l) => legOrder[l] || 99));
      const bLegRank = Math.min(...b.legs.map((l) => legOrder[l] || 99));
      if (aLegRank !== bLegRank) return aLegRank - bLegRank;

      if (a.cumulative_km !== undefined && b.cumulative_km !== undefined) {
        return a.cumulative_km - b.cumulative_km;
      }

      return a.code.localeCompare(b.code);
    });
  }, [stations, query, selectedStation, oppositeStation]);

  const handleSelect = (station: StationItem) => {
    onChange(station.code);
    setQuery(`${station.code} - ${station.name}`);
    setIsOpen(false);
    flyToStation(station.code);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    inputRef.current?.focus();
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredStations.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredStations.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredStations[highlightedIndex]) {
        handleSelect(filteredStations[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Keep highlighted item in view during keyboard navigation
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div ref={containerRef} className={`relative flex flex-col ${className}`}>
      <label className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.24em] text-[#E2EAF4]/60">
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-[#A7F3D0]" />
          {label}
        </span>
        {selectedStation && (
          <span className="font-mono text-[9px] text-[#A7F3D0]/80">
            {selectedStation.cumulative_km !== undefined ? `KM ${Math.round(selectedStation.cumulative_km)} · ` : ''}
            {selectedStation.legs.join(' · ')}
          </span>
        )}
      </label>

      <div className="relative">
        {/* Tactical Input Container with Razor #2C3A35 Border */}
        <div className="group flex items-center rounded-xl border border-[#2C3A35] bg-[#0D1311]/90 px-3 py-2 transition-all duration-180 focus-within:border-[#A7F3D0] focus-within:shadow-[0_0_12px_rgba(167,243,208,0.25)] hover:border-[#2C3A35]/80">
          <Search className="mr-2 h-4 w-4 shrink-0 text-[#E2EAF4]/40 group-focus-within:text-[#A7F3D0]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={placeholder}
            onFocus={(e) => {
              setIsOpen(true);
              setHighlightedIndex(0);
              e.target.select();
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent font-mono text-sm uppercase tracking-wide text-[#E2EAF4] placeholder:text-[#E2EAF4]/30 focus:outline-none"
          />

          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-1.5 rounded-md p-0.5 text-[#E2EAF4]/40 transition hover:bg-[#2C3A35] hover:text-[#A7F3D0]"
              title="Clear entry"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-hidden rounded-2xl border border-[#2C3A35] bg-[#0D1311]/95 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
            >
              <div className="border-b border-[#2C3A35] px-3 py-1.5 text-[9px] uppercase tracking-[0.24em] text-[#E2EAF4]/50 flex items-center justify-between">
                <span>{filteredStations.length} Tracked Infrastructure Nodes</span>
                <span className="text-[#E2EAF4]/40 font-mono">↑↓ select</span>
              </div>

              <ul ref={listRef} className="max-h-60 overflow-y-auto p-1.5">
                {filteredStations.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-[#E2EAF4]/50">
                    No node matches &ldquo;{query}&rdquo;
                  </li>
                ) : (
                  filteredStations.map((station, idx) => {
                    const isSelected = station.code.toUpperCase() === value.toUpperCase();
                    const isHighlighted = idx === highlightedIndex;
                    const isAdjacent = oppositeStation?.adjacentCodes.includes(station.code);
                    const sharesLeg = oppositeStation?.legs.some((l) => station.legs.includes(l));

                    // Sequential chainage delta
                    const hasChainage =
                      oppositeStation?.cumulative_km !== undefined &&
                      station.cumulative_km !== undefined &&
                      sharesLeg;
                    const deltaKm = hasChainage
                      ? station.cumulative_km! - oppositeStation!.cumulative_km!
                      : null;

                    return (
                      <li
                        key={station.code}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => handleSelect(station)}
                        className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs transition-all ${
                          isHighlighted
                            ? 'bg-[#2C3A35] text-[#E2EAF4] shadow-[inset_0_0_8px_rgba(167,243,208,0.15)]'
                            : isSelected
                            ? 'bg-[#1A2421] text-[#A7F3D0] border border-[#34D399]/40'
                            : 'text-[#E2EAF4]/80 hover:bg-[#2C3A35]/50'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[#E2EAF4]">
                            [ {station.code} - {station.name} ]
                          </span>

                          {/* Tactical Corridor Leg Badges */}
                          <div className="flex items-center gap-1">
                            {station.legs.map((leg) => (
                              <span
                                key={leg}
                                className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider uppercase ${getCorridorBadgeStyle(
                                  leg
                                )}`}
                              >
                                {leg}
                              </span>
                            ))}
                          </div>

                          {station.cumulative_km !== undefined && (
                            <span className="text-[10px] text-[#A7F3D0]/60 font-mono">
                              KM {Math.round(station.cumulative_km)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {isAdjacent && (
                            <span className="flex items-center gap-1 rounded-full border border-[#34D399]/50 bg-[#34D399]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#34D399] shadow-[0_0_8px_rgba(52,211,153,0.2)]">
                              <Sparkles className="h-2.5 w-2.5" />
                              Adjacent Hop
                            </span>
                          )}

                          {!isAdjacent && deltaKm !== null && (
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider uppercase ${
                                deltaKm > 0
                                  ? 'border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]'
                                  : 'border-[#FCD34D]/40 bg-[#FCD34D]/10 text-[#FCD34D]'
                              }`}
                            >
                              {deltaKm > 0 ? `➔ +${Math.round(Math.abs(deltaKm))} KM` : `➔ -${Math.round(Math.abs(deltaKm))} KM`}
                            </span>
                          )}

                          {isSelected && <Check className="h-4 w-4 text-[#A7F3D0] ml-1" />}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
