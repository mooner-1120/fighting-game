// Web Audio로 합성하는 효과음과 배경음악 (외부 음원 없음, 전부 오리지널).

export interface Theme {
  root: number;
  scale: number[];
  tempo: number;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private bgmTimer: number | null = null;
  private nextNote = 0;
  private step = 0;
  private theme: Theme | null = null;
  private melody: number[] = [];
  sfxVol = 0.8;
  musicVol = 0.35;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (this.ctx) {
      this.sfxGain.gain.value = sfx;
      this.musicGain.gain.value = music;
    }
  }

  /** 녹화용 출력 스트림 */
  stream(): MediaStream | null {
    if (!this.ctx) return null;
    const dest = this.ctx.createMediaStreamDestination();
    this.master.connect(dest);
    return dest.stream;
  }

  private noise(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass', when = 0, out?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out ?? this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0, when = 0, out?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: string) {
    if (!this.ctx) return;
    switch (name) {
      case 'hit':
        this.noise(0.12, 1800, 1.2, 0.6);
        this.tone(160, 0.12, 0.5, 'sine', 0.5);
        break;
      case 'heavy':
        this.noise(0.25, 900, 0.8, 0.9);
        this.tone(110, 0.3, 0.8, 'sine', 0.4);
        this.tone(70, 0.35, 0.6, 'triangle', 0.5);
        break;
      case 'counter':
        this.tone(1400, 0.15, 0.25, 'square', 0.6);
        this.noise(0.2, 2500, 1, 0.6);
        break;
      case 'block':
        this.noise(0.07, 4000, 3, 0.5);
        this.tone(900, 0.06, 0.2, 'triangle', 0.8);
        break;
      case 'whoosh':
        this.noise(0.15, 1200, 0.6, 0.25, 'highpass');
        break;
      case 'throw':
        this.noise(0.3, 400, 0.7, 0.8, 'lowpass');
        this.tone(90, 0.35, 0.7, 'sine', 0.4, 0.05);
        break;
      case 'break':
        this.tone(1200, 0.08, 0.3, 'square');
        this.tone(1600, 0.1, 0.25, 'square', 1, 0.06);
        break;
      case 'boom':
        this.noise(0.8, 300, 0.5, 1.0, 'lowpass');
        this.tone(55, 0.8, 0.9, 'sine', 0.3);
        break;
      case 'bell':
        [880, 1320, 1760].forEach((f, i) => this.tone(f, 1.6, 0.25 / (i + 1), 'sine', 0.995));
        break;
      case 'gong':
        [220, 330, 440].forEach((f, i) => this.tone(f, 1.2, 0.3 / (i + 1), 'triangle', 0.98));
        break;
      case 'cheer':
        for (let i = 0; i < 6; i++) this.noise(0.6, 900 + Math.random() * 1500, 2, 0.12, 'bandpass', i * 0.05);
        break;
      case 'money':
        this.tone(1800, 0.08, 0.25, 'square');
        this.tone(2400, 0.2, 0.2, 'square', 1, 0.07);
        break;
      case 'gauge':
        this.tone(660, 0.1, 0.2, 'triangle');
        this.tone(990, 0.15, 0.2, 'triangle', 1, 0.08);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) this.tone(740, 0.12, 0.25, 'sawtooth', 1, i * 0.2);
        break;
      case 'ult':
        this.tone(220, 1.0, 0.4, 'sawtooth', 4);
        this.noise(1.0, 600, 0.5, 0.5, 'lowpass');
        break;
      case 'parry':
        this.tone(2000, 0.3, 0.25, 'sine', 0.5);
        this.noise(0.1, 6000, 2, 0.5);
        break;
      case 'heal':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.2, 0.15, 'triangle', 1, i * 0.07));
        break;
      case 'select':
        this.tone(880, 0.06, 0.15, 'square');
        break;
      case 'confirm':
        this.tone(660, 0.08, 0.2, 'square');
        this.tone(990, 0.12, 0.2, 'square', 1, 0.07);
        break;
      case 'clap':
        for (let i = 0; i < 8; i++) this.noise(0.05, 2000, 1, 0.3, 'bandpass', i * 0.11);
        break;
    }
  }

  // ---------------- 배경음악: 테마별 행진곡풍 오리지널 시퀀스
  startMusic(theme: Theme, seed = 1) {
    if (!this.ctx) return;
    this.stopMusic();
    this.theme = theme;
    let x = seed * 9301 + 49297;
    const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    // 16스텝 × 4마디 멜로디 (음계 인덱스, -1은 쉼표)
    this.melody = [];
    let deg = 0;
    for (let i = 0; i < 64; i++) {
      if (i % 4 === 0 || r() < 0.45) {
        deg += Math.floor(r() * 5) - 2;
        deg = Math.max(-2, Math.min(9, deg));
        this.melody.push(deg);
      } else this.melody.push(-1);
    }
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.bgmTimer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (this.bgmTimer !== null) clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  private midi(n: number) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  private noteOf(deg: number, oct = 0) {
    const sc = this.theme!.scale;
    const o = Math.floor(deg / sc.length);
    const i = ((deg % sc.length) + sc.length) % sc.length;
    return this.theme!.root + 12 + sc[i] + 12 * (o + oct);
  }

  private schedule() {
    const c = this.ctx!;
    const th = this.theme!;
    const stepDur = 60 / th.tempo / 4;
    while (this.nextNote < c.currentTime + 0.12) {
      const t = this.nextNote - c.currentTime;
      const s = this.step % 64;
      const beat = s % 16;
      // 베이스 (행진: 1·3박)
      if (beat % 4 === 0) {
        const chord = [0, 0, 3, 4][Math.floor(s / 16)];
        this.tone(this.midi(this.noteOf(chord, -2)), stepDur * 3, 0.35, 'triangle', 1, t, this.musicGain);
      }
      // 스네어 (2·4박) + 롤
      if (beat === 4 || beat === 12 || (beat === 14 && s >= 48)) this.noise(0.12, 1800, 0.8, 0.25, 'bandpass', t, this.musicGain);
      if (beat % 2 === 0) this.noise(0.03, 8000, 1, 0.06, 'highpass', t, this.musicGain);
      if (beat === 0 || beat === 8) this.tone(60, 0.18, 0.5, 'sine', 0.5, t, this.musicGain);
      // 멜로디 (금관 느낌의 사각파)
      const m = this.melody[s];
      if (m >= 0) {
        this.tone(this.midi(this.noteOf(m)), stepDur * 1.8, 0.12, 'square', 1, t, this.musicGain);
        this.tone(this.midi(this.noteOf(m + 2)), stepDur * 1.8, 0.05, 'sawtooth', 1, t, this.musicGain);
      }
      this.nextNote += stepDur;
      this.step++;
    }
  }
}

export const audio = new AudioEngine();
