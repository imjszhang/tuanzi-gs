import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
let tsPath;
try{tsPath=require.resolve('typescript');}
catch{try{const globalRoot=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();tsPath=path.join(globalRoot,'typescript','lib','typescript.js');}
catch{throw new Error('Install TypeScript with npm install before rebuilding. The shipped build can run without it.');}}
const ts=require(tsPath);
execFileSync(process.execPath,[path.join(path.dirname(tsPath),'tsc.js'),'-p',path.join(root,'tsconfig.json')],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[path.join(path.dirname(tsPath),'tsc.js'),'-p',path.join(root,'vendor/gs-engine-ts/tsconfig.json')],{cwd:root,stdio:'inherit'});
const dist=path.join(root,'dist');const modules=new Map();
function visit(file){
  const id=path.relative(dist,file).replaceAll('\\','/');if(modules.has(id))return id;
  const input=fs.readFileSync(file,'utf8');const output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,allowJs:true}}).outputText;
  const deps={};modules.set(id,{output,deps});
  for(const match of output.matchAll(/require\(["']([^"']+)["']\)/g)){
    if(!match[1].startsWith('.'))throw new Error(`Unexpected browser dependency ${match[1]}`);
    deps[match[1]]=visit(path.resolve(path.dirname(file),match[1]));
  }
  return id;
}
const entry=visit(path.join(dist,'src/main.js'));
const registry=[...modules].map(([id,{output,deps}])=>`${JSON.stringify(id)}:{deps:${JSON.stringify(deps)},factory:function(module,exports,require){\n${output}\n}}`).join(',\n');
const bundle=`/* Tuanzi G/S Lab. Bundled from TypeScript; no external browser dependencies. */\n(()=>{\n'use strict';\nconst modules={${registry}};\nconst cache=Object.create(null);\nfunction load(id){if(cache[id])return cache[id].exports;const def=modules[id];if(!def)throw new Error('Module not found: '+id);const module={exports:{}};cache[id]=module;def.factory(module,module.exports,(name)=>load(def.deps[name]));return module.exports;}\nload(${JSON.stringify(entry)});\n})();\n`;
fs.writeFileSync(path.join(root,'public/app.js'),bundle);
const css=fs.readFileSync(path.join(root,'public/app.css'),'utf8');const template=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const standalone=template.replace('<link rel="stylesheet" href="./app.css">',`<style>\n${css}\n</style>`)
  .replace('<script src="./app.js"></script>',`<script>\n${bundle.replaceAll('</script','<\\/script')}\n</script>`);
fs.writeFileSync(path.join(root,'play.html'),standalone);
console.log(`Built ${modules.size} modules. Offline play.html: ${Math.round(Buffer.byteLength(standalone)/1024)} KiB.`);
// Separate observer bundle: no second game session is instantiated in the viewer.
modules.clear();
const labEntry=visit(path.join(dist,'src/lab/viewer.js'));
const labRegistry=[...modules].map(([id,{output,deps}])=>`${JSON.stringify(id)}:{deps:${JSON.stringify(deps)},factory:function(module,exports,require){\n${output}\n}}`).join(',\n');
const labBundle=`/* G/S v0.5.5 shared-run observer. */\n(()=>{'use strict';const modules={${labRegistry}};const cache=Object.create(null);function load(id){if(cache[id])return cache[id].exports;const d=modules[id],m={exports:{}};cache[id]=m;d.factory(m,m.exports,n=>load(d.deps[n]));return m.exports;}load(${JSON.stringify(labEntry)});})();\n`;
fs.writeFileSync(path.join(root,'public/lab.js'),labBundle);
console.log(`Built observer: ${modules.size} modules; browser owns no GSEngine.`);
