/** Safely connect Level4Mars through the existing Level2Journey -> Level3Landing route.
 * Run at PROJECT ROOT: node scripts/connect-level4.mjs
 * Backs up the old Level2Journey.tsx; never overwrites it if already patched.
 * Aborts without modification if the expected structure is not present.
 */
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const level2=path.join(root,'src','app','Level2Journey.tsx');
const level3=path.join(root,'src','app','Level3Landing.tsx');
const bridge=path.join(root,'src','app','Level3With4.tsx');
const level4=path.join(root,'src','app','Level4Mars.tsx');

for(const file of [level2,level3,bridge,level4]) {
  if(!fs.existsSync(file)) { console.error('MISSING FILE:',file); process.exit(1); }
}
const l3=fs.readFileSync(level3,'utf8');
if(!/\bonLevel4\b/.test(l3)) {
  console.error('STOP: Your Level3Landing.tsx does not expose onLevel4. No existing file changed. Send your current Level3Landing.tsx for a safe integration update.');
  process.exit(1);
}
const l2=fs.readFileSync(level2,'utf8');
if(l2.includes('from "./Level3With4"')||l2.includes("from './Level3With4'")) {
  console.log('ALREADY CONNECTED: Level2Journey uses Level3With4. Nothing changed.');
  process.exit(0);
}
const pattern=/import\s*\{\s*Level3Landing\s*\}\s*from\s*(["'])\.\/Level3Landing\1\s*;?/;
if(!pattern.test(l2)) {
  console.error('STOP: No known Level3Landing import found in Level2Journey.tsx. No existing files changed. Please share your current source for integration.');
  process.exit(1);
}
const copy=l2.replace(pattern,'import { Level3With4 as Level3Landing } from "./Level3With4";');
const backup=level2+'.before-level4.bak';
if(fs.existsSync(backup)) {
  console.error('STOP: Existing backup found:',backup,'— do not overwrite it. Nothing changed.');
  process.exit(1);
}
fs.copyFileSync(level2,backup,fs.constants.COPYFILE_EXCL);
fs.writeFileSync(level2,copy,'utf8');
console.log('CONNECTED: Level 2 -> existing Level 3 -> new Level 4.');
console.log('Backup preserved at:',backup);
console.log('Next: npm run build');
