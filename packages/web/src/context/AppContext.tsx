import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type {
  AppState,
  ConnectionSettings,
  RatioConfig,
  ProviderPriceResult,
  ComparisonRow,
  PriceHistoryEntry,
  UpdateLogEntry,
  Channel,
  ChannelPriceComparison,
  UpdateResult,
} from '@newapi-sync/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCAL_STORAGE_KEY = 'newapi-sync-connection';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: 'SET_CONNECTION'; payload: ConnectionSettings | null }
  | { type: 'SET_CONNECTION_STATUS'; payload: { status: AppState['connection']['status']; error?: string } }
  | { type: 'SET_RATIOS'; payload: { data: RatioConfig | null; loading: boolean; error?: string } }
  | { type: 'SET_PRICES'; payload: { results: ProviderPriceResult[]; loading: boolean; lastFetchedAt?: string; fromCache: boolean } }
  | { type: 'SET_COMPARISON'; payload: { rows: ComparisonRow[] } }
  | { type: 'SET_CHANNELS'; payload: { list: Channel[]; comparisons: ChannelPriceComparison[]; loading: boolean; error?: string; selectedChannelId?: number; selectedModelId?: string } }
  | { type: 'SET_PRICE_HISTORY'; payload: { entries: PriceHistoryEntry[]; loading: boolean; error?: string } }
  | { type: 'SET_UPDATE_LOGS'; payload: { logs: UpdateLogEntry[]; loading: boolean; error?: string } }
  | { type: 'SET_UPDATE_STATUS'; payload: { selectedModelIds?: Set<string>; status: AppState['update']['status']; results?: UpdateResult[] } }
  | { type: 'SET_SELECTED_MODELS'; payload: Set<string> }
  | { type: 'SET_FILTERS'; payload: AppState['comparison']['filters'] }
  | { type: 'SET_SORT'; payload: { sortBy: string; sortOrder: 'asc' | 'desc' } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConnectionFromStorage(): ConnectionSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.baseUrl === 'string' && typeof parsed.apiKey === 'string') {
      return parsed as ConnectionSettings;
    }
    return null;
  } catch {
    return null;
  }
}

function saveConnectionToStorage(settings: ConnectionSettings | null): void {
  if (settings) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
  } else {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
}

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

const savedConnection = loadConnectionFromStorage();

const initialState: AppState = {
  connection: {
    settings: savedConnection,
    status: savedConnection ? 'connected' : 'disconnected',
  },
  currentRatios: {
    data: null,
    loading: false,
  },
  upstreamPrices: {
    results: [],
    loading: false,
    fromCache: false,
  },
  comparison: {
    rows: [],
    filters: {},
    sortBy: 'modelId',
    sortOrder: 'asc',
  },
  update: {
    selectedModelIds: new Set<string>(),
    status: 'idle',
  },
  priceHistory: {
    entries: [],
    loading: false,
  },
  updateLogs: {
    logs: [],
    loading: false,
  },
  channels: {
    list: [],
    comparisons: [],
    loading: false,
  },
  channelSources: {
    sources: [],
    loading: false,
  },
  checkin: {
    targets: [],
    records: new Map(),
    loading: false,
  },
  liveness: {
    configs: [],
    latestResults: new Map(),
    loading: false,
  },
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONNECTION':
      saveConnectionToStorage(action.payload);
      return {
        ...state,
        connection: {
          ...state.connection,
          settings: action.payload,
          status: action.payload ? 'connected' : 'disconnected',
          error: undefined,
        },
      };

    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connection: {
          ...state.connection,
          status: action.payload.status,
          error: action.payload.error,
        },
      };

    case 'SET_RATIOS':
      return {
        ...state,
        currentRatios: {
          data: action.payload.data ?? state.currentRatios.data,
          loading: action.payload.loading,
          error: action.payload.error,
        },
      };

    case 'SET_PRICES':
      return {
        ...state,
        upstreamPrices: {
          results: action.payload.results,
          loading: action.payload.loading,
          lastFetchedAt: action.payload.lastFetchedAt,
          fromCache: action.payload.fromCache,
        },
      };

    case 'SET_COMPARISON':
      return {
        ...state,
        comparison: {
          ...state.comparison,
          rows: action.payload.rows,
        },
      };

    case 'SET_CHANNELS':
      return {
        ...state,
        channels: {
          list: action.payload.list,
          comparisons: action.payload.comparisons,
          loading: action.payload.loading,
          error: action.payload.error,
          selectedChannelId: action.payload.selectedChannelId,
          selectedModelId: action.payload.selectedModelId,
        },
      };

    case 'SET_PRICE_HISTORY':
      return {
        ...state,
        priceHistory: {
          entries: action.payload.entries,
          loading: action.payload.loading,
          error: action.payload.error,
        },
      };

    case 'SET_UPDATE_LOGS':
      return {
        ...state,
        updateLogs: {
          logs: action.payload.logs,
          loading: action.payload.loading,
          error: action.payload.error,
        },
      };

    case 'SET_UPDATE_STATUS':
      return {
        ...state,
        update: {
          selectedModelIds: action.payload.selectedModelIds ?? state.update.selectedModelIds,
          status: action.payload.status,
          results: action.payload.results,
        },
      };

    case 'SET_SELECTED_MODELS':
      return {
        ...state,
        update: {
          ...state.update,
          selectedModelIds: action.payload,
        },
      };

    case 'SET_FILTERS':
      return {
        ...state,
        comparison: {
          ...state.comparison,
          filters: action.payload,
        },
      };

    case 'SET_SORT':
      return {
        ...state,
        comparison: {
          ...state.comparison,
          sortBy: action.payload.sortBy,
          sortOrder: action.payload.sortOrder,
        },
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Sync connection settings to localStorage whenever they change
  useEffect(() => {
    saveConnectionToStorage(state.connection.settings);
  }, [state.connection.settings]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return ctx;
}
