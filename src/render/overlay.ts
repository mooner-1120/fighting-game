// 궁극기 컷신 오버레이 (뉴스 속보 포맷). WebM 클립에 함께 찍히도록 2D 캔버스에 그린다.
import { CHARS } from '../sim/chars';
import type { GameState } from '../sim/types';

const CHAT = [
  'ㅋㅋㅋㅋㅋㅋ', '와 실화냐', '지지율 떡상', '떡볶이 맛집 어디예요', '역대급 라이브', '서버 터진다 ㅋㅋ',
  '대박', '국민 소통 그 자체', '1등 댓글', '현장 직캠 갑니다', '이거 생방 맞죠?', '좋아요 꾹',
  '시장 또 와주세요', '눈물 난다', '이게 정치지', '라이브 알림 설정 완료', '와 상대 표정 봐', '🔥🔥🔥',
];

export class NewsOverlay {
  private g: CanvasRenderingContext2D;
  private w = 1280;
  private h = 720;
  private ticker = 0;
  private chat: { text: string; x: number; y: number; sp: number; color: string }[] = [];
  private lastCine = false;

  constructor(public canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.w = w;
    this.h = h;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(s: GameState, dt: number) {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    const c = s.cine;
    if (!c) {
      this.lastCine = false;
      this.chat = [];
      return;
    }
    if (!this.lastCine) {
      this.lastCine = true;
      this.ticker = 0;
    }
    const def = CHARS[c.char];
    const W = this.w;
    const H = this.h;
    const t = c.t / 60;
    this.ticker += dt;

    // 레터박스
    const bar = Math.min(1, t * 4) * H * 0.08;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, bar);
    g.fillRect(0, H - bar, W, bar);

    // 시작 플래시 + 궁극기 이름
    if (t < 1.4) {
      const a = Math.max(0, 1 - t * 3);
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fillRect(0, 0, W, H);
      const slide = Math.min(1, t * 3);
      g.save();
      g.translate(W * (1.2 - slide * 0.7), H * 0.42);
      g.rotate(-0.06);
      g.fillStyle = 'rgba(183,28,28,0.92)';
      g.fillRect(-W * 0.45, -H * 0.07, W * 0.9, H * 0.14);
      g.fillStyle = '#fff';
      g.font = `900 ${Math.floor(H * 0.075)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(def.ultName, 0, 0);
      g.restore();
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H * 0.035)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(`"${def.ultLine}"`, W / 2, H * 0.58);
    }

    // 뉴스 그래픽
    if (t >= 1.0) {
      const fade = Math.min(1, (t - 1) * 3);
      g.globalAlpha = fade;
      // 좌상단 배지
      const live = def.id === 'seo';
      g.fillStyle = live ? '#e53935' : '#c62828';
      g.fillRect(W * 0.03, bar + H * 0.03, W * 0.15, H * 0.06);
      g.fillStyle = '#fff';
      g.font = `900 ${Math.floor(H * 0.035)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(live ? '● LIVE' : '긴급 속보', W * 0.105, bar + H * 0.06);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(W * 0.18, bar + H * 0.03, W * 0.2, H * 0.06);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H * 0.025)}px sans-serif`;
      g.fillText('SFN 서밋파이터뉴스', W * 0.28, bar + H * 0.06);

      // 하단 자막
      const y0 = H - bar - H * 0.2;
      g.fillStyle = '#0d47a1';
      g.fillRect(W * 0.03, y0, W * 0.94, H * 0.1);
      g.fillStyle = '#ffd600';
      g.fillRect(W * 0.03, y0, W * 0.012, H * 0.1);
      g.fillStyle = '#fff';
      g.font = `900 ${Math.floor(H * 0.042)}px sans-serif`;
      g.textAlign = 'left';
      const headline = c.fail ? '[속보] 미사일 불발… 발사대 위에서 폭발' : def.ultHeadline;
      g.fillText(headline, W * 0.06, y0 + H * 0.05);
      // 티커
      const ty = y0 + H * 0.1;
      g.fillStyle = '#b71c1c';
      g.fillRect(W * 0.03, ty, W * 0.94, H * 0.055);
      g.save();
      g.beginPath();
      g.rect(W * 0.03, ty, W * 0.94, H * 0.055);
      g.clip();
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H * 0.03)}px sans-serif`;
      const items = c.fail ? ['담당자 긴급 소환', '원수님 그을린 채 「계획된 시험」 주장', '인민 박수단 박수 중단', ...def.ultTicker] : def.ultTicker;
      const text = items.join('   ◆   ') + '   ◆   ';
      const tw = g.measureText(text).width;
      const off = (this.ticker * W * 0.18) % tw;
      g.fillText(text, W * 0.97 - off, ty + H * 0.0285);
      g.fillText(text, W * 0.97 - off + tw, ty + H * 0.0285);
      g.restore();
      g.globalAlpha = 1;
    }

    // 이재명: 댓글 탄막
    if (def.id === 'seo' && t > 1.3) {
      if (Math.random() < 0.6) {
        const cols = ['#fff', '#ffeb3b', '#80deea', '#ff8a80', '#b9f6ca'];
        this.chat.push({
          text: CHAT[Math.floor(Math.random() * CHAT.length)],
          x: W + 20,
          y: bar + H * 0.12 + Math.random() * H * 0.5,
          sp: W * (0.25 + Math.random() * 0.35),
          color: cols[Math.floor(Math.random() * cols.length)],
        });
      }
      g.font = `bold ${Math.floor(H * 0.04)}px sans-serif`;
      g.textAlign = 'left';
      g.lineWidth = 4;
      for (const m of this.chat) {
        m.x -= m.sp * dt;
        g.strokeStyle = '#000';
        g.strokeText(m.text, m.x, m.y);
        g.fillStyle = m.color;
        g.fillText(m.text, m.x, m.y);
      }
      this.chat = this.chat.filter((m) => m.x > -400);
      // 시청자 수
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(W * 0.78, bar + H * 0.03, W * 0.19, H * 0.06);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H * 0.03)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(`👁 ${(Math.floor(t * 12000000)).toLocaleString()}`, W * 0.875, bar + H * 0.06);
    }

    // 결과 데미지
    if (t > 3.6) {
      g.fillStyle = '#fff';
      g.strokeStyle = '#000';
      g.lineWidth = 6;
      g.font = `900 ${Math.floor(H * 0.09)}px sans-serif`;
      g.textAlign = 'center';
      const txt = c.fail ? '불발!' : '직격!';
      g.strokeText(txt, W / 2, H * 0.4);
      g.fillStyle = c.fail ? '#90a4ae' : '#ff1744';
      g.fillText(txt, W / 2, H * 0.4);
    }
  }
}
