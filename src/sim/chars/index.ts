import type { CharDef } from '../chardef';
import type { CharId } from '../types';
import { kang } from './kang';
import { rex } from './rex';
import { seo } from './seo';
import { volkov } from './volkov';
import { thatcher } from './thatcher';
import { xi } from './xi';
import { mbs } from './mbs';
import { macron } from './macron';

export const CHARS: Record<CharId, CharDef> = { volkov, rex, kang, seo, thatcher, xi, mbs, macron };
export const CHAR_LIST: CharDef[] = [seo, volkov, rex, kang, thatcher, xi, mbs, macron];
