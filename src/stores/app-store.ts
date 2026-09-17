import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Credentials,
  GameKind,
  Mode,
  FlightSettings,
  FlightPlayer,
  JungleSettings,
} from '../../shared/contracts';
import { DEFAULT_JUNGLE_SETTINGS } from '../../shared/game';
import { readCredentials, saveCredentials, storage } from '../lib/storage';
import { roomCodeFromPath, roomPath } from '../lib/room-location';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
interface AppState {
  kind: GameKind;
  mode: Mode;
  flightSettings: FlightSettings;
  flightPlayers: FlightPlayer[];
  setFlightPlayer: (index: number, player: FlightPlayer) => void;
  setFlightSettings: (settings: FlightSettings) => void;
  jungleSettings: JungleSettings;
  setJungleSettings: (settings: JungleSettings) => void;
  name: string;
  joining: boolean;
  code: string;
  credentials: Credentials | null;
  resumeCode: string;
  connection: ConnectionStatus;
  rules: boolean;
  notice: string;
  error: string;
  setKind: (kind: GameKind) => void;
  setMode: (mode: Mode) => void;
  setName: (name: string) => void;
  setJoining: (joining: boolean) => void;
  setCode: (code: string) => void;
  setConnection: (connection: ConnectionStatus) => void;
  setError: (error: string) => void;
  notify: (notice: string) => void;
  toggleRules: () => void;
  closeRules: () => void;
  enterRoom: (credentials: Credentials) => void;
  home: () => void;
  syncLocation: () => void;
  requireRejoin: (code: string) => void;
}
const codeFromPath = () =>
  typeof location === 'undefined' ? '' : roomCodeFromPath(location.pathname);
const initialCode = codeFromPath();

/** Only browser preferences/navigation live here. Authoritative room state lives in Query. */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      kind: 'jungle',
      mode: 'friend',
      flightSettings: { tripleSix: 'all', playerCount: 2 },
      flightPlayers: Array.from({ length: 4 }, () => ({ name: '', ai: false })),
      setFlightPlayer: (index, player) =>
        set((state) => ({
          flightPlayers: state.flightPlayers.map((seat, i) => (i === index ? player : seat)),
        })),
      setFlightSettings: (flightSettings) => set({ flightSettings }),
      jungleSettings: { ...DEFAULT_JUNGLE_SETTINGS },
      setJungleSettings: (jungleSettings) => set({ jungleSettings }),
      name: storage.getItem('kee:name') ?? '',
      joining: !!initialCode,
      code: initialCode,
      credentials: readCredentials(initialCode),
      resumeCode: storage.getItem('kee:last') ?? '',
      connection: 'connecting',
      rules: false,
      notice: '',
      error: '',
      setKind: (kind) => set({ kind }),
      setMode: (mode) => set({ mode }),
      setName: (name) => set({ name }),
      setJoining: (joining) => set({ joining }),
      setCode: (code) => set({ code }),
      setConnection: (connection) => set({ connection }),
      setError: (error) => set({ error }),
      notify: (notice) => set({ notice }),
      toggleRules: () => set((state) => ({ rules: !state.rules })),
      closeRules: () => set({ rules: false }),
      enterRoom: (credentials) => {
        saveCredentials(credentials);
        history.pushState({}, '', roomPath(credentials.code));
        set({
          credentials,
          resumeCode: credentials.code,
          connection: 'connecting',
          rules: false,
          error: '',
        });
        window.scrollTo({ top: 0 });
      },
      home: () => {
        history.pushState({}, '', '/');
        set({
          credentials: null,
          connection: 'disconnected',
          joining: false,
          rules: false,
          error: '',
        });
        window.scrollTo({ top: 0 });
      },
      syncLocation: () => {
        const code = codeFromPath();
        set({
          credentials: readCredentials(code),
          code,
          joining: !!code,
          connection: 'connecting',
          error: '',
          rules: false,
        });
      },
      requireRejoin: (code) =>
        set({ credentials: null, code, joining: true, connection: 'disconnected' }),
    }),
    {
      name: 'kee:preferences',
      storage: createJSONStorage(() => storage),
      partialize: ({ kind, mode, name, flightSettings, flightPlayers, jungleSettings }) => ({
        kind,
        mode,
        name,
        flightSettings,
        flightPlayers,
        jungleSettings,
      }),
    },
  ),
);
