// 브라우저 내장 음성합성(무료)으로 뉴스 앵커 2인 중계와 캐릭터 대사를 읽는다.

let enabled = true;
let voice: SpeechSynthesisVoice | null = null;
let lastSpeak = 0;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => v.lang.startsWith('ko')) ?? null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function setTtsEnabled(on: boolean) {
  enabled = on;
  if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
}

export function ttsAvailable(): boolean {
  return 'speechSynthesis' in window;
}

/**
 * anchor: 0 = 메인 앵커(낮은 톤), 1 = 해설 앵커(높은 톤), 2 = 캐릭터
 * priority가 true면 말하던 것을 끊고 바로 읽는다.
 */
export function say(text: string, anchor = 0, priority = false) {
  if (!enabled || !('speechSynthesis' in window)) return;
  const now = performance.now();
  if (!priority && (speechSynthesis.speaking || now - lastSpeak < 900)) return;
  if (priority) speechSynthesis.cancel();
  lastSpeak = now;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (voice) u.voice = voice;
  u.rate = anchor === 2 ? 1.05 : 1.15;
  u.pitch = anchor === 0 ? 0.85 : anchor === 1 ? 1.25 : 1.0;
  u.volume = 0.9;
  speechSynthesis.speak(u);
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** 상황별 앵커 멘트 */
export const ANCHOR = {
  round: (n: number) => (n >= 5 ? '마지막 라운드!' : `${n}라운드!`),
  fight: () => pick(['회담 시작!', '파이트!', '정상회의, 시작합니다!']),
  ko: () => pick(['케이오! 회담 결렬입니다!', 'K.O.! 이건 외교 참사입니다!', '케이오! 링 위의 정상이 쓰러집니다!']),
  timeout: () => '시간 종료! 판정으로 갑니다!',
  perfect: () => '퍼펙트! 일방적인 정상회담입니다!',
  counter: () => pick(['카운터!', '정확한 반격!']),
  wall: () => pick(['벽에 몰아붙입니다!', '외교적 고립!']),
  emergency: (name: string) => pick([`${name}, 비상사태 선포!`, `${name}, 위기입니다!`]),
  combo: (n: number) => (n >= 6 ? `${n}연타! 이건 내정간섭입니다!` : `${n}연타!`),
  parry: () => '현지 지도로 받아칩니다!',
  breakThrow: () => '잡기를 풀어냅니다!',
  win: (name: string) => `${name}, 승리! 세계의 지배자에 한 걸음 다가섭니다!`,
};
