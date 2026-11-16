import type { CharDef } from '../chardef';
import type { CharId } from '../types';
import { kang } from './kang';
import { rex } from './rex';
import { seo } from './seo';
import { volkov } from './volkov';

export const CHARS: Record<CharId, CharDef> = { volkov, rex, kang, seo };
export const CHAR_LIST: CharDef[] = [seo, volkov, rex, kang];
