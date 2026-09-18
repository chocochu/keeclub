import { clickSoftSound } from './click-soft';
import { chipLay1Sound } from './chip-lay-1';
import { chipsCollide3Sound } from './chips-collide-3';
import { dieThrow2Sound } from './die-throw-2';
import { chipLay2Sound } from './chip-lay-2';
import { jump8bitSound } from './jump-8bit';
import { maximize005Sound } from './maximize-005';
import { minimize005Sound } from './minimize-005';
import { successChimeSound } from './success-chime';
import { jinglesPizzi07Sound } from './jingles-pizzi-07';
import { lowDownSound } from './low-down';

// SoundCN registry assets: embedded CC0 audio by Kenney, cached with the app shell.
export const gameSounds = {
  select: { asset: clickSoftSound, volume: 0.45 },
  move: { asset: chipLay1Sound, volume: 0.55 },
  capture: { asset: chipsCollide3Sound, volume: 0.6 },
  roll: { asset: dieThrow2Sound, volume: 0.55 },
  step: { asset: chipLay2Sound, volume: 0.3 },
  jump: { asset: jump8bitSound, volume: 0.35 },
  shortcut: { asset: maximize005Sound, volume: 0.45 },
  return: { asset: minimize005Sound, volume: 0.45 },
  finish: { asset: successChimeSound, volume: 0.45 },
  win: { asset: jinglesPizzi07Sound, volume: 0.5 },
  draw: { asset: lowDownSound, volume: 0.4 },
};
export type Sound = keyof typeof gameSounds;
