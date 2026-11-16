// localStorage 래퍼 (사생활 보호 모드 등에서 실패해도 동작하도록)

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('sf.' + key);
    if (v == null) return structuredClone(fallback);
    return JSON.parse(v) as T;
  } catch {
    return structuredClone(fallback);
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem('sf.' + key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경 */
  }
}

export interface Settings {
  nick: string;
  sfx: number;
  music: number;
  tts: boolean;
  quality: 'low' | 'mid' | 'high';
  server: string;
  inputDelay: number;
  showInputs: boolean;
  clip: boolean;
}

const DEFAULT_SERVER = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

export const settings: Settings = load('settings', {
  nick: '',
  sfx: 0.8,
  music: 0.35,
  tts: true,
  quality: 'mid',
  server: '',
  inputDelay: 2,
  showInputs: false,
  clip: true,
} as Settings);
if (settings.clip === undefined) settings.clip = true;

export function saveSettings() {
  save('settings', settings);
}

/** 서버 주소: ?server= 파라미터 > 설정값 > 빌드 시 지정값 > (개발) 로컬 8787 > 같은 주소 */
export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('server');
  let u = q || settings.server || DEFAULT_SERVER;
  if (!u) {
    const dev = location.port === '5173' || location.port === '4173' || location.protocol === 'file:';
    if (dev) u = `ws://${location.hostname || 'localhost'}:8787`;
    else u = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  }
  if (!/^wss?:\/\//.test(u)) u = (u.startsWith('localhost') || /^\d/.test(u) ? 'ws://' : 'wss://') + u;
  return u.replace(/\/$/, '');
}
