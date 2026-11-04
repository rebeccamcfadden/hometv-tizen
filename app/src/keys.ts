// The Samsung remote's keys as a web page sees them (Samsung's TVInputDevice docs). Arrows, OK and Back always
// arrive; the colour keys and Info only after TizenBrew registers them (the module's package.json "keys").
// On a PC the keyboard stands in: arrows, Enter, Esc or Backspace for Back, and C for the Checks screen.

export type Action = 'left' | 'right' | 'up' | 'down' | 'ok' | 'back' | 'checks' | 'red' | 'green' | 'yellow';

const BY_CODE: Record<number, Action> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'ok',
  10009: 'back', // Return on the Samsung remote
  27: 'back',
  8: 'back',
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'checks', // Blue
  457: 'checks', // Info
  67: 'checks', // C on a keyboard
};

export function actionOf(e: KeyboardEvent): Action | null {
  return BY_CODE[e.keyCode] || null;
}
