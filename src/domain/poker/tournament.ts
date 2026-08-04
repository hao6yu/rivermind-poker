import type { AiDifficulty } from './aiProfiles';
import type { RandomSource } from './cards';
import {
  createMultiwayHand,
  nextButtonSeat,
  type MultiwayHandState,
  type TablePlayerConfig,
} from './multiway';
import { multiwayAiRoster } from './multiwayAiProfiles';
import { createMultiwayTablePlayers } from './multiwaySession';

export const SIT_AND_GO_PLAYER_COUNT_OPTIONS = [3, 6] as const;
export type SitAndGoPlayerCount = typeof SIT_AND_GO_PLAYER_COUNT_OPTIONS[number];
export const DEFAULT_SIT_AND_GO_PLAYER_COUNT: SitAndGoPlayerCount = 3;
export const SIT_AND_GO_STARTING_STACK_BB = 60;
export const SIT_AND_GO_INITIAL_BIG_BLIND = 20;

export type SitAndGoStructureId = 'standard' | 'masters' | 'final' | 'invitation';

export interface SitAndGoStructure {
  id: SitAndGoStructureId;
  startingStackBb: number;
  handsPerLevel: number;
}

export const SIT_AND_GO_STRUCTURES: Record<SitAndGoStructureId, SitAndGoStructure> = {
  standard: { id: 'standard', startingStackBb: 60, handsPerLevel: 4 },
  masters: { id: 'masters', startingStackBb: 75, handsPerLevel: 5 },
  final: { id: 'final', startingStackBb: 80, handsPerLevel: 6 },
  invitation: { id: 'invitation', startingStackBb: 100, handsPerLevel: 7 },
};

export interface SitAndGoBlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  firstHand: number;
  lastHand: number | null;
}

const blindLevels: ReadonlyArray<Omit<SitAndGoBlindLevel, 'firstHand' | 'lastHand'>> = [
  { level: 1, smallBlind: 10, bigBlind: 20 },
  { level: 2, smallBlind: 15, bigBlind: 30 },
  { level: 3, smallBlind: 20, bigBlind: 40 },
  { level: 4, smallBlind: 30, bigBlind: 60 },
  { level: 5, smallBlind: 40, bigBlind: 80 },
  { level: 6, smallBlind: 60, bigBlind: 120 },
  { level: 7, smallBlind: 80, bigBlind: 160 },
  { level: 8, smallBlind: 100, bigBlind: 200 },
];

export interface SitAndGoCheckpoint {
  version: 1;
  savedAt: string;
  nextHandNumber: number;
  lastButtonSeat: number;
  aiDifficulty: AiDifficulty;
  /** Missing on legacy checkpoints, which always used the standard structure. */
  structureId?: SitAndGoStructureId;
  players: TablePlayerConfig[];
}

export type SitAndGoCompletion = 'hero_eliminated' | 'hero_won' | null;

export function sitAndGoBlindLevel(
  handNumber: number,
  structureId: SitAndGoStructureId = 'standard',
): SitAndGoBlindLevel {
  if (!Number.isInteger(handNumber) || handNumber < 1) throw new Error('Tournament hand number must be positive.');
  const structure = SIT_AND_GO_STRUCTURES[structureId];
  const index = Math.min(blindLevels.length - 1, Math.floor((handNumber - 1) / structure.handsPerLevel));
  const level = blindLevels[index];
  if (!level) throw new Error('Tournament blind level is unavailable.');
  const firstHand = index * structure.handsPerLevel + 1;
  return {
    ...level,
    firstHand,
    lastHand: index === blindLevels.length - 1 ? null : firstHand + structure.handsPerLevel - 1,
  };
}

function tablePlayersFromState(state: MultiwayHandState): TablePlayerConfig[] {
  return state.tablePlayerIds.map((playerId) => {
    const player = state.players[playerId];
    if (!player) throw new Error(`Player ${playerId} is missing from the tournament.`);
    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      stack: player.stack,
      isHero: player.isHero,
    };
  });
}

function dealTournamentHand(
  players: TablePlayerConfig[],
  handNumber: number,
  buttonSeat: number,
  random: RandomSource,
  structureId: SitAndGoStructureId,
): MultiwayHandState {
  const blinds = sitAndGoBlindLevel(handNumber, structureId);
  return createMultiwayHand({
    players,
    handNumber,
    buttonSeat,
    smallBlind: blinds.smallBlind,
    bigBlind: blinds.bigBlind,
    random,
  });
}

export function createSitAndGo(
  random: RandomSource = Math.random,
  playerCount: SitAndGoPlayerCount = DEFAULT_SIT_AND_GO_PLAYER_COUNT,
  structureId: SitAndGoStructureId = 'standard',
  difficulty: AiDifficulty = 'club',
): MultiwayHandState {
  const startingStack = SIT_AND_GO_STRUCTURES[structureId].startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND;
  const tableRoll = random();
  const identityOffset = Math.floor(tableRoll * multiwayAiRoster(difficulty).length);
  const players = createMultiwayTablePlayers(playerCount, startingStack, difficulty, identityOffset);
  const buttonIndex = Math.min(players.length - 1, Math.floor(tableRoll * players.length));
  const buttonSeat = players[buttonIndex]?.seat;
  if (buttonSeat === undefined) throw new Error('A tournament button could not be selected.');
  return dealTournamentHand(players, 1, buttonSeat, random, structureId);
}

export function createNextSitAndGoHand(
  state: MultiwayHandState,
  random: RandomSource = Math.random,
  structureId: SitAndGoStructureId = 'standard',
): MultiwayHandState {
  if (!state.outcome) throw new Error('Finish the current tournament hand before dealing again.');
  if (sitAndGoCompletion(state)) throw new Error('The tournament is already complete.');
  const players = tablePlayersFromState(state);
  return dealTournamentHand(
    players,
    state.handNumber + 1,
    nextButtonSeat(players, state.buttonSeat),
    random,
    structureId,
  );
}

export function sitAndGoLivePlayerIds(state: MultiwayHandState): string[] {
  return state.tablePlayerIds.filter((playerId) => (state.players[playerId]?.stack ?? 0) > 0);
}

export function sitAndGoCompletion(state: MultiwayHandState): SitAndGoCompletion {
  if (!state.outcome) return null;
  const heroStack = state.players.hero?.stack ?? 0;
  if (heroStack <= 0) return 'hero_eliminated';
  const livePlayers = sitAndGoLivePlayerIds(state);
  return livePlayers.length === 1 && livePlayers[0] === 'hero' ? 'hero_won' : null;
}

export function sitAndGoHeroPlace(state: MultiwayHandState): number | null {
  const completion = sitAndGoCompletion(state);
  if (!completion) return null;
  if (completion === 'hero_won') return 1;
  return Math.min(state.tablePlayerIds.length, sitAndGoLivePlayerIds(state).length + 1);
}

export function createSitAndGoCheckpoint(
  state: MultiwayHandState,
  aiDifficulty: AiDifficulty,
  structureId: SitAndGoStructureId = 'standard',
): SitAndGoCheckpoint {
  if (!state.outcome) throw new Error('Only a completed tournament hand can be saved.');
  if (sitAndGoCompletion(state)) throw new Error('A finished tournament does not need a checkpoint.');
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    nextHandNumber: state.handNumber + 1,
    lastButtonSeat: state.buttonSeat,
    aiDifficulty,
    structureId,
    players: tablePlayersFromState(state),
  };
}

export function isSitAndGoCheckpoint(value: unknown): value is SitAndGoCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const checkpoint = value as Record<string, unknown>;
  if (checkpoint.version !== 1 || !Number.isInteger(checkpoint.nextHandNumber) || (checkpoint.nextHandNumber as number) < 2) return false;
  if (!Number.isInteger(checkpoint.lastButtonSeat) || typeof checkpoint.savedAt !== 'string') return false;
  if (!['friendly', 'club', 'sharp', 'elite', 'nemesis'].includes(String(checkpoint.aiDifficulty))) return false;
  if (checkpoint.structureId !== undefined && !Object.hasOwn(SIT_AND_GO_STRUCTURES, String(checkpoint.structureId))) return false;
  if (!Array.isArray(checkpoint.players) || !SIT_AND_GO_PLAYER_COUNT_OPTIONS.includes(checkpoint.players.length as SitAndGoPlayerCount)) return false;
  let livePlayers = 0;
  const ids = new Set<string>();
  const seats = new Set<number>();
  let heroCount = 0;
  for (const candidate of checkpoint.players) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const player = candidate as Record<string, unknown>;
    if (typeof player.id !== 'string' || typeof player.name !== 'string') return false;
    if (!Number.isInteger(player.seat) || (player.seat as number) < 0 || (player.seat as number) >= 6) return false;
    if (!Number.isInteger(player.stack) || (player.stack as number) < 0) return false;
    if (ids.has(player.id) || seats.has(player.seat as number)) return false;
    ids.add(player.id);
    seats.add(player.seat as number);
    if ((player.stack as number) > 0) livePlayers += 1;
    if (player.isHero === true) heroCount += 1;
  }
  return livePlayers >= 2 && heroCount === 1;
}

export function resumeSitAndGo(
  checkpoint: SitAndGoCheckpoint,
  random: RandomSource = Math.random,
  structureId: SitAndGoStructureId = sitAndGoCheckpointStructure(checkpoint),
): MultiwayHandState {
  if (!isSitAndGoCheckpoint(checkpoint)) throw new Error('The saved tournament is invalid.');
  return dealTournamentHand(
    checkpoint.players,
    checkpoint.nextHandNumber,
    nextButtonSeat(checkpoint.players, checkpoint.lastButtonSeat),
    random,
    structureId,
  );
}

export function sitAndGoCheckpointStructure(checkpoint: SitAndGoCheckpoint): SitAndGoStructureId {
  return checkpoint.structureId ?? 'standard';
}
