export declare const FEATURE_IDS: readonly ["resources", "access", "danger", "distances", "stage"];
export type FeatureId = typeof FEATURE_IDS[number];
export declare const RULE_IDS: readonly ["gather", "deliver", "consume", "place-resource", "wait-access"];
export type RuleId = typeof RULE_IDS[number];
export type LocalGoal = 'acquired-one' | 'deposited' | 'energy-restored' | 'access-open';
export type Weights = {
    progress: number;
    cost: number;
    safety: number;
    experience: number;
};
export type SkillSpec = {
    schema: 'gs/skill/v1';
    id: string;
    version: number;
    title: string;
    source: 'authored' | 'grammar-search' | 'llm';
    parameters: 'berry' | 'guard-region' | 'delivery' | 'none';
    initiation: 'can-gather' | 'can-deliver' | 'can-consume' | 'can-create-access';
    success: LocalGoal;
    maxSteps: number;
    capabilities: string[];
    features: FeatureId[];
    weights: Weights;
    phases: {
        id: string;
        rule: RuleId;
        until: 'local-success' | 'resource-placed';
        maxSteps: number;
    }[];
};
export type Binding = {
    targetId: string;
    targetBerryIds: string[];
    amount: number;
};
export declare const DEFAULT_WEIGHTS: Weights;
export declare function parseSkill(raw: unknown): SkillSpec;
export declare function makeSkill(goal: LocalGoal, rules: RuleId[], source?: SkillSpec['source']): SkillSpec;
export declare const BASE_SKILLS: SkillSpec[];
