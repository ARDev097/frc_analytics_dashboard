"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { EnrichedFee, FilterState } from "./types";
import { getLatestYear, getUniqueDistricts } from "./data-utils";
import { DEFAULT_FILTERS, ACADEMIC_YEARS } from "./constants";

interface DataStore {
  fees: EnrichedFee[];
  isLoading: boolean;
  loadingProgress: number;
  loadingStage: string;
  error: string | null;
  latestYear: string;
  districts: string[];
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
}

const DataStoreContext = createContext<DataStore | null>(null);

const CACHE_KEY = "frc_enrichedFees_v2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function tryReadCache(): EnrichedFee[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; fees: EnrichedFee[] };
    if (!parsed?.fetchedAt || !Array.isArray(parsed?.fees)) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.fees;
  } catch {
    return null;
  }
}

function tryWriteCache(fees: EnrichedFee[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), fees }));
  } catch {
    // Ignore storage quota / privacy mode.
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [fees, setFees] = useState<EnrichedFee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [latestYear, setLatestYear] = useState("2025-26");
  const [districts, setDistricts] = useState<string[]>([]);
  const [filters, setFiltersState] = useState<FilterState>(DEFAULT_FILTERS);

  const setFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const applyFees = (enrichedFees: EnrichedFee[]) => {
          setFees(enrichedFees);
          const computedLatest = getLatestYear(enrichedFees);
          setLatestYear(computedLatest);
          setFiltersState((prev) => {
            const desired = prev.academicYear;
            const isValid = ACADEMIC_YEARS.includes(desired as (typeof ACADEMIC_YEARS)[number]);
            return {
              ...prev,
              academicYear: isValid ? desired : computedLatest,
            };
          });
          setDistricts(getUniqueDistricts(enrichedFees));
        };

        setError(null);
        setIsLoading(true);
        setLoadingStage("Initializing…");
        setLoadingProgress(5);

        // Fast path: if cached data exists, show it immediately (avoids blank/error screen).
        const cached = tryReadCache();
        if (cached && cached.length) {
          setLoadingStage("Loading cached data…");
          setLoadingProgress(40);
          applyFees(cached);
          setIsLoading(false);
        } else {
          setLoadingStage("Loading data from database…");
          setLoadingProgress(20);
        }

        // Always revalidate (with retry) so data stays fresh.
        const maxAttempts = 3;
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            if (attempt > 1) {
              setLoadingStage(`Retrying download… (${attempt}/${maxAttempts})`);
              setLoadingProgress(20 + attempt * 10);
              await sleep(600 * attempt); // simple backoff
            }

            const res = await fetch("/api/enriched-fees");
            if (!res.ok) {
              throw new Error(`Failed to load data (HTTP ${res.status})`);
            }
            const enrichedFees = (await res.json()) as EnrichedFee[];

            setLoadingStage("Processing data…");
            setLoadingProgress(80);
            applyFees(enrichedFees);
            tryWriteCache(enrichedFees);

            setLoadingStage("Ready!");
            setLoadingProgress(100);
            setIsLoading(false);
            return;
          } catch (e) {
            lastErr = e;
          }
        }

        // If we got here: all retries failed.
        // If we already showed cached data, keep the app usable and avoid the error screen.
        if (cached && cached.length) {
          console.warn("Failed to refresh data; showing cached dataset.", lastErr);
          setIsLoading(false);
          setLoadingStage("Offline (showing cached data)");
          setLoadingProgress(100);
          return;
        }

        throw lastErr instanceof Error ? lastErr : new Error("Failed to load data");
      } catch (err) {
        console.error("Failed to load data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
        setIsLoading(false);
      }
    }
    
    loadData();
  }, []);

  return (
    <DataStoreContext.Provider
      value={{
        fees,
        isLoading,
        loadingProgress,
        loadingStage,
        error,
        latestYear,
        districts,
        filters,
        setFilters,
      }}
    >
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore(): DataStore {
  const context = useContext(DataStoreContext);
  if (!context) {
    throw new Error("useDataStore must be used within a DataStoreProvider");
  }
  return context;
}
