// Builds tizen/HomeTVSpike.wgt for the Tizen TV emulator (never for a family TV: there TizenBrew loads the module
// from npm). Needs Tizen Studio's CLI and a certificate profile made on this PC (README › Emulator); neither goes in
// git. Usage: npm run build && node tools/package-tizen.mjs [--profile <name>]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studio = process.env.TIZEN_STUDIO || 'D:\\dev\\tizen-tools\\tizen-studio';
const cli = path.join(studio, 'tools', 'ide', 'bin', process.platform === 'win32' ? 'tizen.bat' : 'tizen');
const i = process.argv.indexOf('--profile');
const profile = i > 0 ? process.argv[i + 1] : process.env.HOMETV_TIZEN_PROFILE || 'hometv-emulator';

const build = path.join(root, 'tizen', 'build');
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(build, { recursive: true });
for (const f of ['config.xml', 'boot.html', 'service-host.js']) fs.copyFileSync(path.join(root, 'tizen', f), path.join(build, f));
fs.copyFileSync(path.join(root, 'service', 'service.js'), path.join(build, 'service.js'));
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('Run `npm run build` first.');
fs.cpSync(path.join(root, 'dist'), path.join(build, 'dist'), { recursive: true });

execFileSync(cli, ['package', '-t', 'wgt', '-s', profile, '-o', path.join(root, 'tizen'), '--', build], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' },
});
const wgt = fs.readdirSync(path.join(root, 'tizen')).find((f) => f.endsWith('.wgt'));
console.log(`Built tizen/${wgt}. Install on the emulator: sdb connect, then tizen install -n tizen/${wgt} -t <emulator>`);
