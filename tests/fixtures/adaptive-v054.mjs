// Explicit synthetic test data. Never imported by production / G requests.
export const subproblem=(question='比较这个局部问题的解释',extra={})=>({proposals:[{kind:'subproblem',task:{question,hypothesis:'测试用未验证假设',expectedResult:'返回一个带不确定性标记的候选解释，或未解决原因',groups:['self'],ruleIds:['goal','inventory'],maxRevisions:2,maxGenerations:3,...extra}}]});
export const analysis=(question='比较已声明的解释',extra={})=>({proposals:[{kind:'analysis',question,hypothesis:'测试候选，不代表实际正确',groups:['self'],ruleIds:['goal'],candidates:[{id:'bounded',description:'有限解释',claim:'这是测试返回值，不是事实或动作指令。'}],...extra}]});
