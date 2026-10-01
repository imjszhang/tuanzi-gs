/** Emits structural schemas only, never a worked task solution. */
import fs from 'node:fs';import {outputContract} from '../dist/src/adaptive/spec.js';import {PUBLIC_RULES} from '../dist/src/adaptive/world-port.js';
fs.mkdirSync('schemas',{recursive:true});for(const kind of ['action','analysis']){const c=outputContract(kind,Object.keys(PUBLIC_RULES));fs.writeFileSync(`schemas/g-${kind}-v054.json`,JSON.stringify(c,null,2));console.log(`schemas/g-${kind}-v054.json`);}
