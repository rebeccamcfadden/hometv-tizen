// TEMPORARY copy of the icons Search and the title page use, from hometv-launcher's design_preview/src/ui/icons.ts at
// 2bf3c2d (same paths), until icons are shared. Outline icons on a 24-unit grid; colour comes from `currentColor`.
const svg = (d: string, size: number, fill: boolean) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

const P = {
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  back: 'M15 5l-7 7 7 7',
  chevRight: 'M9 6l6 6-6 6',
  play: 'M8 5.5v13l10-6.5z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  trailer: 'M3.5 6.5h17v11h-17zM10 9.5v5l4-2.5z',
  star: 'M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  backspace: 'M9 6h11v12H9l-6-6zM12 9.5l5 5M17 9.5l-5 5',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  wifiOff: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M3.5 3.5l17 17',
};

export type IconName = keyof typeof P;

export const icon = (name: IconName, size = 26, fill = false) => svg(P[name], size, fill);
