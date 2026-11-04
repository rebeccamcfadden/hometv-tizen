// Builds tizen/HomeTVSpike.wgt: HomeTV as its own Samsung app on AeroTizen's base. Needs Tizen Studio's CLI and a
// Samsung certificate profile made on this PC (README › Emulator); neither goes in git.
// Usage: npm run build && node tools/package-tizen.mjs [--profile <name>]
//
// The package holds dist/ (HomeTV's page plus AeroTizen's ES5 scripts in dist/aero/) and AeroTizen's Home watcher
// (vendor/aerotizen/launcher/service/ and the three js/ files it requires), copied with only its app id and port
// changed so it never meets an installed AeroTizen.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studio = process.env.TIZEN_STUDIO || 'D:\\dev\\tizen-tools\\tizen-studio';
const cli = path.join(studio, 'tools', 'ide', 'bin', process.platform === 'win32' ? 'tizen.bat' : 'tizen');
const i = process.argv.indexOf('--profile');
const profile = i > 0 ? process.argv[i + 1] : process.env.HOMETV_TIZEN_PROFILE || 'hometv-samsung';

const APP_ID = 'HmTvSpike0.HomeTVSpike';
const PORT = '47791';
const aero = path.join(root, 'vendor', 'aerotizen', 'launcher');

/** AeroTizen's watcher with HomeTV's app id and port in place of its own. */
function retarget(text) {
  return text.split('DclHome001.Home').join(APP_ID).split('47790').join(PORT);
}

const build = path.join(root, 'tizen', 'build');
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(path.join(build, 'aero', 'service'), { recursive: true });
fs.mkdirSync(path.join(build, 'aero', 'js'), { recursive: true });
fs.copyFileSync(path.join(root, 'tizen', 'config.xml'), path.join(build, 'config.xml'));
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) throw new Error('Run `npm run build` first.');
fs.cpSync(path.join(root, 'dist'), path.join(build, 'dist'), { recursive: true });
for (const f of fs.readdirSync(path.join(aero, 'service'))) {
  if (f.endsWith('.js')) {
    fs.writeFileSync(path.join(build, 'aero', 'service', f), retarget(fs.readFileSync(path.join(aero, 'service', f), 'utf8')));
  }
}
for (const f of ['diagnostics.js', 'diagnostics-privacy.js', 'build-info.js']) {
  fs.writeFileSync(path.join(build, 'aero', 'js', f), retarget(fs.readFileSync(path.join(aero, 'js', f), 'utf8')));
}
fs.copyFileSync(path.join(root, 'vendor', 'aerotizen', 'LICENSE'), path.join(build, 'aero', 'LICENSE'));

for (const f of fs.readdirSync(path.join(root, 'tizen'))) if (f.endsWith('.wgt')) fs.rmSync(path.join(root, 'tizen', f));
execFileSync(`"${cli}"`, ['package', '-t', 'wgt', '-s', profile, '-o', `"${path.join(root, 'tizen')}"`, '--', `"${build}"`], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' },
});
const wgt = fs.readdirSync(path.join(root, 'tizen')).find((f) => f.endsWith('.wgt'));
console.log(`Built tizen/${wgt}. Install: tizen install -n ${wgt} -t <emulator or TV> -- tizen`);
