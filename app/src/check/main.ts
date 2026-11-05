// The check app's page (check mode: `HOMETV_CHECK=1 npm run build`, vite.config.ts puts this in place of main.ts).
// HomeTV's shell and bridge, one screen: the checks (check/screen.ts). Packaged as its own app with its own id
// (tools/check/package-check.mjs), so it never meets HomeTV; the laptop tool installs it, reads the report and
// removes it again (tools/check/hometv_check.py).

import '../styles.css';
import './check.css';
import { bridge } from '../bridge';
import { shell } from '../shell/app';
import { checkScreen, noteStart, report, CHECK_VERSION } from './screen';

const t0 = Date.now();
const stage = document.getElementById('stage') as HTMLElement;

shell.keys = bridge.platform.keys;
bridge.platform.registerButtons(['red', 'green', 'yellow', 'blue', 'info', 'digits']);

/** What the laptop reads through the web inspector (docs/check-tool.md, way 2): the allowlisted report, as JSON text. */
(window as unknown as { HomeTVCheck: unknown }).HomeTVCheck = {
  version: CHECK_VERSION,
  report: () => JSON.stringify(report()),
};

async function start() {
  bridge.setToast((text) => shell.toast(text, /didn’t|refused|failed/i.test(text)));
  await bridge.connect();
  shell.init(stage, { home: checkScreen });
  bridge.platform.started();
  noteStart(Date.now() - t0);
}

start();
