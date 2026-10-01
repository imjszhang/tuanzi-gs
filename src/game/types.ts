import type { BoundedProgram } from '../../vendor/gs-engine-ts/src/program.js';
import type { Context, Candidate, Policy } from '../../vendor/gs-engine-ts/src/types.js';

export type Point = { x: number; y: number };
export type Berry = Point & { id: string };
export type Guard = Point & { id: string; anchor: Point; eating: number };
export type Lure = Point & { id: string; ttl: number };
export type Tile = 'grass' | 'water' | 'rock';
export type GameState = {
  width: number; height: number; revision: number; turn: number; maxTurns: number;
  terrain: Tile[]; walls: Point[]; berries: Berry[]; guards: Guard[]; lures: Lure[];
  home: Point; player: Point; energy: number; maxEnergy: number;
  bag: number; capacity: number; delivered: number; target: number;
  scenario: string; attacks: number; baitUsed: number; eaten: number;
  lastFact: string;
};
export type GameAction =
  | { kind: 'move'; x: number; y: number; objective: 'berry' | 'home' | 'lure' | 'safe'; targetId: string; distance: number }
  | { kind: 'pickup'; berryId: string }
  | { kind: 'eat' }
  | { kind: 'deposit'; amount: number }
  | { kind: 'drop'; x: number; y: number }
  | { kind: 'wait' };
export type GamePolicy = {
  mode: 'forage' | 'lure' | 'return' | 'program';
  program?: BoundedProgram<GameAction>;
  subgoal: string;
  enabled: string[];
  reserveEnergy: number;
};
export type GameContext = Context<GameState, GameAction, GamePolicy>;
export type GameCandidate = Candidate<GameAction>;
export type ScenarioId = 'meadow' | 'guarded' | 'detour' | 'remix';
export type EditTool = 'inspect' | 'berry' | 'wall' | 'guard' | 'erase';
export const CAPABILITIES = ['move', 'pickup', 'eat', 'deposit', 'drop', 'wait'] as const;
export const INITIAL_POLICY: Policy<GamePolicy> = {
  id: 'tuanzi-foraging', version: 1,
  body: { mode: 'forage', subgoal: '采集可安全接近的浆果，分批带回小窝。',
    enabled: ['move', 'pickup', 'eat', 'deposit', 'wait'], reserveEnergy: 24 }
};
export const GOAL = {
  id: 'five-berries', description: '在能量耗尽前，把 5 颗浆果带回小窝。使用世界已有能力；采集后必须回家交付。',
  verifierId: 'world:delivered>=5&&energy>0'
};
export const clone = <T>(x: T): T => structuredClone(x);
export const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
export const dist = (a: Point, b: Point): number => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const key = (p: Point): string => `${p.x},${p.y}`;
