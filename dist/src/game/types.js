export const CAPABILITIES = ['move', 'pickup', 'eat', 'deposit', 'drop', 'wait'];
export const INITIAL_POLICY = {
    id: 'tuanzi-foraging', version: 1,
    body: { mode: 'forage', subgoal: '采集可安全接近的浆果，分批带回小窝。',
        enabled: ['move', 'pickup', 'eat', 'deposit', 'wait'], reserveEnergy: 24 }
};
export const GOAL = {
    id: 'five-berries', description: '在能量耗尽前，把 5 颗浆果带回小窝。使用世界已有能力；采集后必须回家交付。',
    verifierId: 'world:delivered>=5&&energy>0'
};
export const clone = (x) => structuredClone(x);
export const same = (a, b) => a.x === b.x && a.y === b.y;
export const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const key = (p) => `${p.x},${p.y}`;
