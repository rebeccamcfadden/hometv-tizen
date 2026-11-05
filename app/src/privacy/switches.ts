// Settings › Privacy's checklist: Samsung's privacy, start-up and home-bar switches from docs/privacy.md (section 1,
// and 2a, the one network step it recommends), by the TV's year. HomeTV can't set any of them (Samsung gives apps no
// way to, docs/privacy.md "What can be scripted"): the person turns each one in Samsung's menu and ticks it here. Pure,
// so tests run it in Node.

/** The year groups whose menus docs/privacy.md describes. */
export type YearGroup = 'y2017' | 'y2022' | 'y2025';
export const YEAR_GROUPS: YearGroup[] = ['y2017', 'y2022', 'y2025'];
export const YEAR_GROUP_LABELS: Record<YearGroup, string> = { y2017: '2017–2021', y2022: '2022–2024', y2025: '2025 or newer' };

export type SectionId = 'privacy' | 'startup' | 'homebar' | 'network';

export interface ChecklistSection {
  id: SectionId;
  title: string;
  /** Where it is in Samsung's menu, by year (US menus; Samsung renames things between years). */
  where: Record<YearGroup, string>;
}

export interface Switch {
  id: string;
  section: SectionId;
  /** Its name in Samsung's menu; some years call it something else. */
  name: string;
  names?: Partial<Record<YearGroup, string>>;
  /** What to do with it: "Off", "Press once", "Leave agreed"… */
  turn: string;
  stops: string;
  breaks: string;
  undo: string;
  /** Only on these years' TVs (all when absent). */
  years?: YearGroup[];
  /** Only when the menu lists it, or only for some households: said beside its name. */
  when?: string;
  /** Not something to turn off: a warning to leave it as it is (Smart Hub's terms). */
  leave?: boolean;
}

export const SECTIONS: ChecklistSection[] = [
  {
    id: 'privacy',
    title: 'Privacy choices',
    where: {
      y2017: 'Settings › General › Terms & Privacy (older TVs: Settings › Support › Terms & Policy)',
      y2022: 'Settings › All Settings › General & Privacy › Terms & Privacy › Privacy Choices',
      y2025: 'Settings › All Settings › General & Privacy (or Privacy Choices on the main menu)',
    },
  },
  {
    id: 'startup',
    title: 'At power-on',
    where: {
      y2017: 'Settings › General › Smart Features',
      y2022: 'Settings › All Settings › General & Privacy › Start Screen Options',
      y2025: 'Settings › All Settings › Advanced Features › Start Screen Options',
    },
  },
  {
    id: 'homebar',
    title: 'On Samsung’s home bar',
    where: {
      y2017: 'Press Home on the remote: Samsung’s home bar along the bottom',
      y2022: 'Press Home on the remote: Samsung’s home bar along the bottom',
      y2025: 'Press Home on the remote: Samsung’s home bar along the bottom',
    },
  },
  {
    id: 'network',
    title: 'Network (optional)',
    where: {
      y2017: 'Settings › General › Network › Network Status › IP Settings › DNS Setting',
      y2022: 'Settings › Connection › Network › Network Status › IP Settings › DNS Setting',
      y2025: 'Settings › Connection › Network › Network Status › IP Settings › DNS Setting',
    },
  },
];

export const SWITCHES: Switch[] = [
  {
    id: 'acr',
    section: 'privacy',
    name: 'Viewing Information Services',
    turn: 'Off',
    stops: 'The TV recognising what’s on screen (live TV, HDMI, apps) and reporting it for ads (ACR).',
    breaks: 'Nothing that works; “recommended for you” gets less personal.',
    undo: 'Turn it on.',
  },
  {
    id: 'interest-ads',
    section: 'privacy',
    name: 'Interest-Based Advertisement',
    names: { y2025: 'Personalized ads' },
    turn: 'Off',
    stops: 'Ads chosen from your viewing profile.',
    breaks: 'Nothing: ads still show, untargeted.',
    undo: 'Turn it on.',
  },
  {
    id: 'reset-ad-id',
    section: 'privacy',
    name: 'Reset PSID / Reset ad ID',
    when: 'on the same screen',
    turn: 'Press once',
    stops: 'Cuts off the profile built so far.',
    breaks: 'Nothing.',
    undo: 'Nothing to undo.',
  },
  {
    id: 'voice',
    section: 'privacy',
    name: 'Voice Recognition Services',
    when: 'only if nobody uses voice',
    turn: 'Off',
    stops: 'Voice data going to Samsung.',
    breaks: 'Voice search and Bixby or Alexa stop.',
    undo: 'Turn it on.',
  },
  {
    id: 'voice-review',
    section: 'privacy',
    name: 'Bixby › Privacy: audio recording review, voiceprint review',
    turn: 'Off',
    stops: 'People or AI reviewing voice recordings.',
    breaks: 'Nothing: voice still works.',
    undo: 'Turn it on.',
  },
  {
    id: 'personalized',
    section: 'privacy',
    name: 'Personalized Content, Customization Service or Recommendations',
    when: 'if listed',
    turn: 'Off',
    stops: 'Personalised rows.',
    breaks: 'Less personal rows.',
    undo: 'Turn it on.',
  },
  {
    id: 'vision-ai',
    section: 'privacy',
    name: 'Vision AI Companion terms',
    when: 'if listed and nobody uses it',
    years: ['y2025'],
    turn: 'Disagree',
    stops: 'The new AI assistant’s data.',
    breaks: 'The AI assistant.',
    undo: 'Agree again.',
  },
  {
    id: 'smart-hub-terms',
    section: 'privacy',
    name: 'Smart Hub Terms & Conditions / Privacy Notice',
    turn: 'Leave agreed',
    leave: true,
    stops: 'Nothing: leave it as it is.',
    breaks: 'Disagreeing stops every app (Netflix, YouTube…): only TV and HDMI work.',
    undo: 'Agree again.',
  },
  {
    id: 'start-smart-hub',
    section: 'startup',
    name: 'Start with Smart Hub Home',
    names: { y2017: 'Autorun Smart Hub' },
    turn: 'Off',
    stops: 'The TV waking to the ad-filled home bar: it wakes to the last input or app instead.',
    breaks: 'Nothing: Home still opens the home bar.',
    undo: 'Turn it on.',
  },
  {
    id: 'autorun-tv-plus',
    section: 'startup',
    name: 'Autorun Samsung TV Plus',
    when: 'if listed',
    turn: 'Off',
    stops: 'TV Plus playing by itself at power-on.',
    breaks: 'Nothing: TV Plus still opens when chosen.',
    undo: 'Turn it on.',
  },
  {
    id: 'autorun-last-app',
    section: 'startup',
    name: 'Autorun Last App',
    turn: 'The household’s choice',
    stops: 'On reopens the last app at power-on (HomeTV, once it’s on the TV); off doesn’t.',
    breaks: 'Nothing either way.',
    undo: 'Set it back as it was.',
  },
  {
    id: 'tv-plus',
    section: 'homebar',
    name: 'Samsung TV Plus',
    turn: 'Highlight it, press Down (or hold OK), Disable',
    stops: 'Its tile and channels (it can’t be deleted).',
    breaks: 'TV Plus channels, until it’s enabled again.',
    undo: 'Apps › TV Plus › Enable.',
  },
  {
    id: 'suggested-apps',
    section: 'homebar',
    name: 'Suggested apps on the row',
    turn: 'End of the row › Edit List › select › Down › Remove',
    stops: 'Promoted tiles on the home bar.',
    breaks: 'Nothing: the apps stay in Apps.',
    undo: 'Add them back from Apps.',
  },
  {
    id: 'unused-apps',
    section: 'homebar',
    name: 'Apps nobody uses',
    when: 'only store apps the household agrees to',
    turn: 'Apps › gear (Settings) › the app › Delete',
    stops: 'Background updates for it, and frees space.',
    breaks: 'That app, until it’s reinstalled. Leave Samsung’s system apps alone: some have no Delete button for a reason.',
    undo: 'Reinstall it from Apps.',
  },
  {
    id: 'dns',
    section: 'network',
    name: 'DNS Setting: 94.140.14.14 (AdGuard’s free DNS)',
    when: 'optional',
    turn: 'Enter manually',
    stops: 'The TV finding Samsung’s ad and ACR servers, including what the switches miss.',
    breaks: 'Covers only this TV, AdGuard chooses what is blocked, and the TV may fall back to another DNS when it can’t reach it.',
    undo: 'DNS Setting › Obtain automatically.',
  },
];

/** The switches for a year's TVs, in menu order. */
export const switchesFor = (year: YearGroup): Switch[] => SWITCHES.filter((s) => !s.years || s.years.indexOf(year) >= 0);

/** A switch's name on that year's TVs. */
export const nameFor = (s: Switch, year: YearGroup): string => (s.names && s.names[year]) || s.name;

/** The year group a TV of this model year belongs to; older than 2017 gets 2017–2021's menus. */
export const groupForYear = (year: number): YearGroup => (year >= 2025 ? 'y2025' : year >= 2022 ? 'y2022' : 'y2017');

/** docs/privacy.md, "Find the TV's year": the letter in the model code (TU 2020, AU 2021, Q60B 2022, CU 2023, DU 2024, U…F 2025). */
const YEAR_LETTER: Record<string, number> = { T: 2020, A: 2021, B: 2022, C: 2023, D: 2024, F: 2025 };

/**
 * A model code's year ("UN55TU7000" 2020, "QE75Q60BAUXXC" 2022, "UN65U8000F" 2025), or null when the code isn't one
 * HomeTV can read: two letters, the size, then the series with its year letter.
 */
export function yearFromModel(model: string): number | null {
  const m = (model || '').toUpperCase().replace(/\s+/g, '');
  const crystal = /^[A-Z]{2}\d{2,3}([TABCD])U\d{4}/.exec(m);
  if (crystal) return YEAR_LETTER[crystal[1]];
  const series = /^[A-Z]{2}\d{2,3}[A-Z]{1,2}\d{2,4}([TABCDF])/.exec(m);
  return series ? YEAR_LETTER[series[1]] : null;
}

/** The software each year's TVs came with (README's TV table; docs/privacy.md: Tizen 6 is 2021, Tizen 9 is 2025). */
const TIZEN_YEAR: Record<string, number> = { '3.0': 2017, '4.0': 2018, '5.0': 2019, '5.5': 2020, '6.0': 2021, '6.5': 2022, '7.0': 2023, '8.0': 2024, '9.0': 2025 };

/** The year whose TVs came with this software version ("6.5" 2022), or null. Newer than 9 gets 2025's menus. */
export function yearFromSoftware(version: string): number | null {
  const m = /^(\d{1,2})\.(\d)/.exec(version || '');
  if (!m) return null;
  const known = TIZEN_YEAR[`${m[1]}.${m[2]}`];
  if (known) return known;
  return Number(m[1]) > 9 ? 2025 : null;
}

export interface YearGuess {
  group: YearGroup | null;
  /** Where it came from: the software (the menus follow it, even on an older TV that was updated), or the model code. */
  from: 'software' | 'model' | null;
  year: number | null;
}

/** The TV's year group from what it says about itself: its software first (the menus follow it), then its model code. */
export function guessYear(tv: { osVersion: string; model: string }): YearGuess {
  const soft = yearFromSoftware(tv.osVersion);
  if (soft) return { group: groupForYear(soft), from: 'software', year: soft };
  const model = yearFromModel(tv.model);
  if (model) return { group: groupForYear(model), from: 'model', year: model };
  return { group: null, from: null, year: null };
}

/** The group to show: the person's pick, else the guess; null until one of them says. */
export const yearToShow = (picked: YearGroup | null, guess: YearGuess): YearGroup | null => picked || guess.group;
