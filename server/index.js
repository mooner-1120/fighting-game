// 서밋 파이터즈 방 관리 + WebRTC 시그널링 + 중계 서버
// - 방 코드(6자리)로 최대 8명 입장, 계정 없이 닉네임만
// - 대전 순서(이긴 사람 남기) / 토너먼트 대진표
// - P2P 연결 실패 시 WebSocket 중계(relay)로 게임 입력 전달 (TURN 대체)
// - 관전자에게 입력 스트림 전달
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
const MAX_PLAYERS = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHARS = ['seo', 'volkov', 'rex', 'kang', 'thatcher', 'xi', 'mbs', 'macron'];
const STAGE_COUNT = 6;

// 서버가 제공하는 게임 빌드 ID. 브라우저 버전이 다르면 시뮬레이션이 어긋나므로 입장을 막고 새로고침시킨다
let SERVER_BUILD = null;
function loadBuild() {
  try {
    SERVER_BUILD = JSON.parse(fs.readFileSync(path.join(DIST, 'version.json'), 'utf8')).build || null;
  } catch {
    SERVER_BUILD = null; // 개발 모드 (dist 없음)
  }
}

/** @type {Map<string, any>} */
const rooms = new Map();
let nextClientId = 1;
let nextMatchId = 1;

// 빌드된 게임(dist/)도 같은 서버에서 제공 → 링크 하나로 접속
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webm': 'video/webm',
};

loadBuild();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`ok rooms=${rooms.size}`);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) file = path.join(DIST, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('서밋 파이터즈 서버 실행 중 (게임 파일은 npm run build 후 제공됩니다)');
        return;
      }
      const ext = path.extname(file);
      const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
      if (file.includes(`${path.sep}assets${path.sep}`)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      else headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
}

function snapshot(room) {
  return {
    code: room.code,
    host: room.host,
    mode: room.mode,
    settings: room.settings,
    players: [...room.players.values()].map((p) => ({
      id: p.id, nick: p.nick, char: p.char, ready: p.ready, spoke: p.spoke, wins: p.wins, title: p.title,
    })),
    queue: room.queue,
    match: room.match ? { id: room.match.id, p: room.match.p, chars: room.match.chars, stage: room.match.stage } : null,
    bracket: room.tournament ? room.tournament.rounds : null,
    countdown: room.countdownAt ? Math.max(0, room.countdownAt - Date.now()) : 0,
  };
}

function pushRoom(room) {
  broadcast(room, { t: 'room', room: snapshot(room) });
}

function cleanNick(n) {
  const s = String(n || '').replace(/[<>]/g, '').trim().slice(0, 12);
  return s || '익명 정상';
}

// ------------------------------------------------------------ 대전 진행

function eligible(room) {
  return room.queue.filter((id) => {
    const p = room.players.get(id);
    return p && p.ready;
  });
}

function scheduleNext(room) {
  if (room.match || room.countdownTimer) return;
  let pair = null;
  if (room.tournament) {
    pair = nextTournamentPair(room);
    if (!pair) return;
  } else {
    const e = eligible(room);
    if (e.length < 2) return;
    pair = [e[0], e[1]];
  }
  room.countdownAt = Date.now() + 3000;
  room.countdownTimer = setTimeout(() => {
    room.countdownTimer = null;
    room.countdownAt = 0;
    // 그 사이 나간 사람 확인
    if (!pair.every((id) => room.players.has(id))) {
      if (room.tournament) forfeitMissing(room);
      scheduleNext(room);
      pushRoom(room);
      return;
    }
    startMatch(room, pair);
  }, 3000);
  pushRoom(room);
}

function startMatch(room, pair) {
  const [a, b] = pair.map((id) => room.players.get(id));
  room.match = {
    id: nextMatchId++,
    p: [a.id, b.id],
    chars: [a.char, b.char],
    stage: Math.floor(Math.random() * STAGE_COUNT),
    rounds: room.settings.rounds,
    seed: (Math.random() * 0x7fffffff) | 0,
    spokesman: [room.settings.spokesman && a.spoke, room.settings.spokesman && b.spoke],
    guardBack: room.settings.guard === 'back',
    names: [a.nick, b.nick],
    inputs: [[], []],
    results: new Map(),
    startedAt: Date.now(),
  };
  const m = room.match;
  broadcast(room, {
    t: 'match',
    match: { id: m.id, p: m.p, chars: m.chars, stage: m.stage, rounds: m.rounds, seed: m.seed, spokesman: m.spokesman, guardBack: m.guardBack, names: m.names },
  });
  pushRoom(room);
}

function endMatch(room, winnerId, reason) {
  const m = room.match;
  if (!m) return;
  room.match = null;
  const loserId = m.p[0] === winnerId ? m.p[1] : m.p[0];
  const w = room.players.get(winnerId);
  if (w) w.wins++;
  let title = null;
  if (room.tournament) {
    title = recordTournament(room, m, winnerId);
  } else {
    // 이긴 사람은 맨 앞, 진 사람은 맨 뒤
    room.queue = room.queue.filter((id) => id !== winnerId && id !== loserId);
    if (room.players.has(winnerId)) room.queue.unshift(winnerId);
    if (room.players.has(loserId)) room.queue.push(loserId);
  }
  broadcast(room, { t: 'matchEnd', mid: m.id, winner: winnerId, reason: reason || 'ko', title });
  pushRoom(room);
  setTimeout(() => scheduleNext(room), 2500);
}

// ------------------------------------------------------------ 토너먼트

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startTournament(room) {
  const ids = shuffle([...room.players.values()].filter((p) => p.ready).map((p) => p.id));
  if (ids.length < 2) return false;
  let size = 1;
  while (size < ids.length) size *= 2;
  while (ids.length < size) ids.push(null); // 부전승
  const rounds = [];
  let first = [];
  for (let i = 0; i < size; i += 2) first.push({ a: ids[i], b: ids[i + 1], w: null });
  rounds.push(first);
  let n = size / 2;
  while (n > 1) {
    n /= 2;
    rounds.push(Array.from({ length: n }, () => ({ a: null, b: null, w: null })));
  }
  room.tournament = { rounds, names: Object.fromEntries([...room.players.values()].map((p) => [p.id, p.nick])) };
  room.mode = 'tournament';
  resolveByes(room);
  return true;
}

function advance(room, r, i, winner) {
  const t = room.tournament;
  t.rounds[r][i].w = winner;
  if (r + 1 < t.rounds.length) {
    const nm = t.rounds[r + 1][Math.floor(i / 2)];
    if (i % 2 === 0) nm.a = winner;
    else nm.b = winner;
  }
}

function resolveByes(room) {
  const t = room.tournament;
  let changed = true;
  while (changed) {
    changed = false;
    t.rounds.forEach((round, r) => {
      round.forEach((m, i) => {
        if (m.w !== null) return;
        const prevDone = r === 0 || t.rounds[r - 1][i * 2].w !== null && t.rounds[r - 1][i * 2 + 1].w !== null;
        if (!prevDone) return;
        if (m.a !== null && m.b === null) { advance(room, r, i, m.a); changed = true; }
        else if (m.b !== null && m.a === null) { advance(room, r, i, m.b); changed = true; }
        else if (m.a === null && m.b === null && r > 0) { m.w = -1; changed = true; if (r + 1 < t.rounds.length) advance(room, r, i, null); }
      });
    });
  }
}

function nextTournamentPair(room) {
  const t = room.tournament;
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.w === null && m.a !== null && m.b !== null) return [m.a, m.b];
    }
  }
  return null;
}

function forfeitMissing(room) {
  const t = room.tournament;
  t.rounds.forEach((round, r) =>
    round.forEach((m, i) => {
      if (m.w !== null || m.a === null || m.b === null) return;
      const ha = room.players.has(m.a);
      const hb = room.players.has(m.b);
      if (!ha && hb) advance(room, r, i, m.b);
      else if (ha && !hb) advance(room, r, i, m.a);
    }),
  );
  resolveByes(room);
  checkChampion(room);
}

function recordTournament(room, match, winnerId) {
  const t = room.tournament;
  t.rounds.forEach((round, r) =>
    round.forEach((m, i) => {
      if (m.w === null && ((m.a === match.p[0] && m.b === match.p[1]) || (m.a === match.p[1] && m.b === match.p[0]))) advance(room, r, i, winnerId);
    }),
  );
  resolveByes(room);
  return checkChampion(room);
}

function checkChampion(room) {
  const t = room.tournament;
  if (!t) return null;
  const final = t.rounds[t.rounds.length - 1][0];
  if (final.w === null || final.w === -1) return null;
  const champ = room.players.get(final.w);
  for (const p of room.players.values()) if (p.title === '세계의 지배자') p.title = null;
  if (champ) champ.title = '세계의 지배자';
  room.tournament = null;
  room.mode = 'versus';
  const msg = { champion: final.w, nick: champ ? champ.nick : t.names[final.w] };
  broadcast(room, { t: 'champion', ...msg });
  return '세계의 지배자';
}

// ------------------------------------------------------------ 접속

function leave(client) {
  const room = client.room;
  if (!room) return;
  client.room = null;
  room.players.delete(client.id);
  room.queue = room.queue.filter((id) => id !== client.id);
  if (room.match && room.match.p.includes(client.id)) {
    const other = room.match.p[0] === client.id ? room.match.p[1] : room.match.p[0];
    endMatch(room, other, 'disconnect');
  }
  if (room.tournament) forfeitMissing(room);
  if (room.players.size === 0) {
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    rooms.delete(room.code);
    return;
  }
  if (room.host === client.id) room.host = room.players.keys().next().value;
  broadcast(room, { t: 'chat', nick: '시스템', text: `${client.nick} 님이 나갔습니다.` });
  pushRoom(room);
  scheduleNext(room);
}

wss.on('connection', (ws) => {
  const client = { id: nextClientId++, ws, nick: '', char: 'seo', ready: false, spoke: false, wins: 0, title: null, room: null, msgCount: 0 };
  let alive = true;
  ws.on('pong', () => (alive = true));
  const hb = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 20000);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const room = client.room;
    switch (msg.t) {
      case 'ping':
        send(ws, { t: 'pong', ts: msg.ts });
        break;
      case 'hello': {
        const ver = typeof msg.ver === 'string' ? msg.ver : 'unknown';
        if (SERVER_BUILD && ver !== SERVER_BUILD) {
          return send(ws, { t: 'error', code: 'version', msg: '게임이 업데이트되었습니다. 새로고침해 주세요.' });
        }
        if (client.room) leave(client);
        client.nick = cleanNick(msg.nick);
        client.ver = ver;
        let r;
        if (msg.create || !msg.room) {
          const code = makeCode();
          r = { code, host: client.id, players: new Map(), queue: [], mode: 'versus', settings: { rounds: 3, spokesman: true, guard: 'auto' }, match: null, tournament: null, countdownTimer: null, countdownAt: 0 };
          rooms.set(code, r);
        } else {
          r = rooms.get(String(msg.room).toUpperCase().trim());
          if (!r) return send(ws, { t: 'error', msg: '방을 찾을 수 없습니다. 코드를 확인하세요.' });
          if (r.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: '방이 가득 찼습니다 (최대 8명).' });
          // 개발 모드에서도 방 안의 버전은 같아야 한다
          const other = r.players.values().next().value;
          if (other && other.ver !== ver) return send(ws, { t: 'error', code: 'version', msg: '방에 있는 사람과 게임 버전이 다릅니다. 새로고침해 주세요.' });
        }
        if (CHARS.includes(msg.char)) client.char = msg.char;
        client.room = r;
        client.ready = false;
        r.players.set(client.id, client);
        r.queue.push(client.id);
        send(ws, { t: 'welcome', id: client.id, code: r.code });
        broadcast(r, { t: 'chat', nick: '시스템', text: `${client.nick} 님이 입장했습니다.` }, client.id);
        pushRoom(r);
        // 진행 중인 경기 관전
        if (r.match) {
          const m = r.match;
          send(ws, { t: 'match', match: { id: m.id, p: m.p, chars: m.chars, stage: m.stage, rounds: m.rounds, seed: m.seed, spokesman: m.spokesman, guardBack: m.guardBack, names: m.names }, spectate: true });
          send(ws, { t: 'specHistory', mid: m.id, p0: m.inputs[0], p1: m.inputs[1] });
        }
        break;
      }
      case 'spectate': {
        const m = room && room.match;
        if (!m || m.p.includes(client.id)) return;
        send(ws, { t: 'match', match: { id: m.id, p: m.p, chars: m.chars, stage: m.stage, rounds: m.rounds, seed: m.seed, spokesman: m.spokesman, guardBack: m.guardBack, names: m.names }, spectate: true });
        send(ws, { t: 'specHistory', mid: m.id, p0: m.inputs[0], p1: m.inputs[1] });
        break;
      }
      case 'char':
        if (!room || !CHARS.includes(msg.char)) return;
        client.char = msg.char;
        pushRoom(room);
        break;
      case 'ready':
        if (!room) return;
        client.ready = !!msg.ready;
        pushRoom(room);
        scheduleNext(room);
        break;
      case 'spoke':
        if (!room) return;
        client.spoke = !!msg.on;
        pushRoom(room);
        break;
      case 'settings':
        if (!room || room.host !== client.id) return;
        if (Number.isInteger(msg.rounds) && msg.rounds >= 1 && msg.rounds <= 5) room.settings.rounds = msg.rounds;
        if (typeof msg.spokesman === 'boolean') room.settings.spokesman = msg.spokesman;
        if (msg.guard === 'auto' || msg.guard === 'back') room.settings.guard = msg.guard;
        pushRoom(room);
        break;
      case 'tournament':
        if (!room || room.host !== client.id || room.match || room.tournament) return;
        if (!startTournament(room)) return send(ws, { t: 'error', msg: '준비 완료한 사람이 2명 이상이어야 합니다.' });
        broadcast(room, { t: 'chat', nick: '시스템', text: '토너먼트 시작! 우승자는 「세계의 지배자」 칭호를 얻습니다.' });
        pushRoom(room);
        scheduleNext(room);
        break;
      case 'signal':
      case 'relay': {
        if (!room) return;
        const to = room.players.get(msg.to);
        if (to) send(to.ws, { t: msg.t, from: client.id, data: msg.data });
        break;
      }
      case 'inputs': {
        // 선수 본인의 확정 입력 → 관전자에게 전달
        const m = room && room.match;
        if (!m || m.id !== msg.mid) return;
        const p = m.p.indexOf(client.id);
        if (p < 0 || !Array.isArray(msg.i) || !Number.isInteger(msg.s)) return;
        const arr = m.inputs[p];
        for (let k = 0; k < msg.i.length && k < 600; k++) {
          const f = msg.s + k;
          if (f === arr.length) arr.push(msg.i[k] | 0);
        }
        if (arr.length > 60 * 60 * 20) return; // 20분 상한
        for (const pl of room.players.values()) {
          if (!m.p.includes(pl.id)) send(pl.ws, { t: 'spec', mid: m.id, p, s: msg.s, i: msg.i });
        }
        break;
      }
      case 'result': {
        const m = room && room.match;
        if (!m || m.id !== msg.mid || !m.p.includes(client.id) || !m.p.includes(msg.winner)) return;
        m.results.set(client.id, msg.winner);
        // 먼저 보고된 결과를 쓰고, 다른 결과가 오면 동기화 문제로 기록만 한다
        if (m.results.size >= 1) endMatch(room, msg.winner, 'ko');
        break;
      }
      case 'react':
        if (!room) return;
        broadcast(room, { t: 'react', from: client.id, nick: client.nick, e: String(msg.e || '').slice(0, 8) });
        break;
      case 'chat':
        if (!room) return;
        if (++client.msgCount > 200) return;
        broadcast(room, { t: 'chat', nick: client.nick, text: String(msg.text || '').slice(0, 120) });
        break;
      case 'leave':
        leave(client);
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(hb);
    leave(client);
  });
});

server.listen(PORT, () => {
  console.log(`서밋 파이터즈 서버 실행 중: 포트 ${PORT}`);
});
