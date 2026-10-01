import type { ComparisonResult } from '../runtime/session.js';
import type { GameState } from '../game/types.js';
import { SkillSession } from './runtime.js';
export declare function finish(session: SkillSession): Promise<SkillSession>;
/** Same initial world, tool authority and root goal, NOT identical candidate abstraction.
 * Warm row inherits measured skills/experience from cold, so is not independent. */
export declare function compareHierarchy(initial: GameState): Promise<ComparisonResult[]>;
