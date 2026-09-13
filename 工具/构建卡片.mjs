import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await build({
  absWorkingDir:root,
  entryPoints:['源码/卡片入口.tsx'],
  outfile:'dist/assets/卡片展示.js',
  bundle:true,
  format:'iife',
  target:['es2020'],
  minify:true,
  sourcemap:false,
  legalComments:'linked',
  define:{'process.env.NODE_ENV':'"production"'},
  logLevel:'info'
});
const reactLicense=await fs.readFile(path.join(root,'node_modules/react/LICENSE'),'utf8');
await fs.writeFile(path.join(root,'dist/assets/第三方许可.txt'),`React / React DOM / Scheduler\n\n${reactLicense}\n\nGSAP 3.15.0 / CSSPlugin\nCopyright 2008-2026, GreenSock. All rights reserved.\nSubject to the terms at https://gsap.com/standard-license/\n`,'utf8');
