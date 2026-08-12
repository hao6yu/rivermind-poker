import type { AiDifficulty } from '../../domain/poker/aiProfiles';

export type MultiplayerSeatCount = 2 | 3 | 6;
export type MultiplayerStartingStack = 800 | 2_000 | 4_000;
export type MultiplayerSessionLength = 5 | 10 | 'open';
export type MultiplayerTurnSeconds = 30 | 45 | 60;
export type MultiplayerFlowMode = 'create' | 'join';

export interface MultiplayerTableDraft {
  aiDifficulty: AiDifficulty;
  playerName: string;
  seatCount: MultiplayerSeatCount;
  sessionLength: MultiplayerSessionLength;
  startingStackChips: MultiplayerStartingStack;
  turnSeconds: MultiplayerTurnSeconds;
}

export interface MultiplayerLobbySeat {
  displayName: string | null;
  kind: 'human' | 'ai' | 'open';
  ready: boolean;
  seat: number;
  isHost?: boolean;
  isViewer?: boolean;
}

export const multiplayerSeatOptions: readonly MultiplayerSeatCount[] = [2, 3, 6];
export const multiplayerStackOptions: readonly MultiplayerStartingStack[] = [800, 2_000, 4_000];
export const multiplayerSessionOptions: readonly MultiplayerSessionLength[] = [5, 10, 'open'];
export const multiplayerTimerOptions: readonly MultiplayerTurnSeconds[] = [30, 45, 60];

export const defaultMultiplayerDraft: MultiplayerTableDraft = {
  aiDifficulty: 'club',
  playerName: '',
  seatCount: 3,
  sessionLength: 10,
  startingStackChips: 2_000,
  turnSeconds: 45,
};

export function normalizeMultiplayerRoomCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function isValidMultiplayerRoomCode(value: string): boolean {
  return normalizeMultiplayerRoomCode(value).length === 6;
}

export function isValidMultiplayerDisplayName(value: string): boolean {
  const length = value.trim().length;
  return length >= 2 && length <= 18;
}

export function multiplayerSeatAnchor(
  seatCount: MultiplayerSeatCount,
  seat: number,
): { left: `${number}%`; top: `${number}%` } {
  const anchors: Record<MultiplayerSeatCount, Array<{ left: `${number}%`; top: `${number}%` }>> = {
    2: [
      { left: '37%', top: '76%' },
      { left: '37%', top: '4%' },
    ],
    3: [
      { left: '37%', top: '76%' },
      { left: '7%', top: '12%' },
      { left: '67%', top: '12%' },
    ],
    6: [
      { left: '37%', top: '76%' },
      { left: '1%', top: '58%' },
      { left: '4%', top: '12%' },
      { left: '37%', top: '2%' },
      { left: '70%', top: '12%' },
      { left: '73%', top: '58%' },
    ],
  };
  const anchor = anchors[seatCount][seat];
  if (!anchor) throw new Error(`Seat ${seat} is outside a ${seatCount}-seat lobby.`);
  return anchor;
}
