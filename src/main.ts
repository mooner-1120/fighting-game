import './style.css';
import { audio } from './audio/audio';
import { setTtsEnabled } from './audio/tts';
import { wakeServer } from './net/server';
import { lobbyScreen } from './ui/lobby';
import { type Nav, titleScreen } from './ui/menus';
import { settings } from './ui/storage';

audio.setVolumes(settings.sfx, settings.music);
setTtsEnabled(settings.tts);

const nav: Nav = {
  title: () => titleScreen(nav),
  lobby: (code) => lobbyScreen(nav, code),
};

// 무료 서버는 잠들어 있을 수 있으니 페이지를 여는 즉시 깨워 둔다
wakeServer();

// 첫 사용자 입력에서 오디오 활성화 (브라우저 정책)
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
window.addEventListener('keydown', () => audio.ensure(), { once: true });

const room = new URLSearchParams(location.search).get('room');
if (room) nav.lobby(room.toUpperCase());
else nav.title();
