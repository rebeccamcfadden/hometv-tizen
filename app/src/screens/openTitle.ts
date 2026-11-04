// What OK on a title card opens: the title page (design_preview's screens/preview.ts), which W3 ports in parallel.
// builder-4 wires this to W3's titlePreview after W3 merges: shell.push(titlePreview(t)).

import type { Title } from '@hometv/core/types.ts';
import { shell } from '../shell/app';

export function openTitle(t: Title): void {
  shell.toast(`${t.name}: its title page comes with the Search port.`);
}
