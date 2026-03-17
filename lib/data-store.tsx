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
        setIsLoading(true);
        setError(null);

        setLoadingStage("Loading data from database...");
        setLoadingProgress(20);

        const res = await fetch("/api/enriched-fees");
        if (!res.ok) {
          throw new Error(`Failed to load data (HTTP ${res.status})`);
        }
        const enrichedFees = (await res.json()) as EnrichedFee[];

        setLoadingStage("Processing data...");
        setLoadingProgress(80);
        
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
        setLoadingStage("Ready!");
        setLoadingProgress(100);
        setIsLoading(false);
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
