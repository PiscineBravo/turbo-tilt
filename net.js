// Multiplayer a stella: l'host crea la stanza e inoltra i messaggi a tutti.
// PeerJS (server pubblico gratuito) serve solo a mettere in contatto i telefoni,
// poi i dati viaggiano diretti via WebRTC (anche in Wi-Fi locale).
const PREFIX = 'turbotilt-v1-';
export const MAX_PLAYERS = 10;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const randCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

export class Net {
  constructor() {
    this.peer = null; this.conn = null; this.conns = new Map();
    this.isHost = false; this.players = []; this.results = []; this.inRace = false; this.code = ''; this.cfg = null;
    this.handlers = {};
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, ...a) { this.handlers[ev]?.(...a); }
  get myId() { return this.peer?.id; }
  get active() { return !!this.peer; }

  _newPeer(id) {
    return new Promise((res, rej) => {
      const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
      const t = setTimeout(() => { p.destroy(); rej(new Error('Server non raggiungibile')); }, 10000);
      p.on('open', () => { clearTimeout(t); res(p); });
      p.on('error', e => { clearTimeout(t); rej(e); });
    });
  }

  // ----- Host -----
  async host(me, cfg) {
    this.cfg = cfg;
    for (let a = 0; a < 4 && !this.peer; a++) {
      const code = randCode();
      try { this.peer = await this._newPeer(PREFIX + code); this.code = code; }
      catch (e) { if (e.type !== 'unavailable-id') throw new Error('Server non raggiungibile'); }
    }
    if (!this.peer) throw new Error('Riprova');
    this.isHost = true;
    this.players = [{ id: this.myId, ...me }];
    this.peer.on('connection', c => this._accept(c));
    this.peer.on('disconnected', () => this.peer?.reconnect());
    this._lobby();
    return this.code;
  }
  _accept(c) {
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'hello') {
        if (this.players.length >= MAX_PLAYERS) return this._refuse(c, `La stanza è piena (${MAX_PLAYERS} giocatori)`);
        if (this.inRace) return this._refuse(c, 'Gara in corso, riprova tra poco');
        this.conns.set(c.peer, c);
        this.players.push({ id: c.peer, name: String(d.name || 'Pilota').slice(0, 12), color: String(d.color), char: String(d.char || 'rocco'), kart: String(d.kart || 'classico') });
        return this._lobby();
      }
      if (!this.conns.has(c.peer)) return;
      d.id = c.peer;
      if (d.t === 'fin') return this._fin(d);
      if (d.t === 'st' || d.t === 'fx') { this._sendAll(d, c.peer); this.emit('msg', d); }
    });
    c.on('close', () => {
      if (!this.conns.delete(c.peer)) return;
      this.players = this.players.filter(p => p.id !== c.peer);
      this._lobby();
      this._broadcast({ t: 'left', id: c.peer });
    });
  }
  _refuse(c, reason) { c.send({ t: 'refused', reason }); setTimeout(() => c.close(), 500); }
  _sendAll(m, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(m); }
  _broadcast(m) { this._sendAll(m); this.emit('msg', m); }
  _lobby() { this._broadcast({ t: 'lobby', players: this.players, cfg: this.cfg }); }
  setCfg(cfg) { this.cfg = cfg; if (this.isHost) this._lobby(); }
  _fin(d) {
    if (this.results.some(r => r.id === d.id)) return;
    const p = this.players.find(p => p.id === d.id);
    this.results.push({ id: d.id, name: p?.name || String(d.name || '?').slice(0, 14), time: +d.time });
    this.results.sort((a, b) => a.time - b.time);
    this._broadcast({ t: 'res', results: this.results });
  }
  startRace(bots = []) { this.inRace = true; this.results = []; this._broadcast({ t: 'start', grid: [...this.players, ...bots], cfg: this.cfg }); }
  // Solo host: stato e arrivo dei kart guidati dal computer
  sendAs(id, m) { m.id = id; this._sendAll(m); }
  finBot(id, name, time) { this._fin({ id, name, time }); }
  backToLobby() { this.inRace = false; this._broadcast({ t: 'back' }); }

  // ----- Ospite -----
  async join(code, me) {
    code = code.trim().toUpperCase();
    this.peer = await this._newPeer().catch(() => { throw new Error('Server non raggiungibile'); });
    await new Promise((res, rej) => {
      const c = this.peer.connect(PREFIX + code, { reliable: true });
      const t = setTimeout(() => rej(new Error('Stanza non trovata')), 8000);
      this.peer.on('error', e => { clearTimeout(t); rej(new Error(e.type === 'peer-unavailable' ? 'Stanza non trovata' : 'Errore di rete')); });
      c.on('open', () => { clearTimeout(t); this.conn = c; c.send({ t: 'hello', ...me }); res(); });
      c.on('data', d => {
        if (d?.t === 'refused') { this.leave(); this.emit('closed', d.reason); }
        else this.emit('msg', d);
      });
      c.on('close', () => { if (this.conn === c) { this.leave(); this.emit('closed', "Connessione con l'host persa"); } });
    });
    this.code = code;
  }

  send(m) {
    if (!this.peer) return;
    if (!this.isHost) { if (this.conn?.open) this.conn.send(m); return; }
    m.id = this.myId;
    if (m.t === 'st' || m.t === 'fx') this._sendAll(m);
    else if (m.t === 'fin') this._fin(m);
  }
  leave() {
    const p = this.peer;
    this.peer = null; this.conn = null; this.conns.clear();
    this.isHost = false; this.players = []; this.results = []; this.inRace = false;
    try { p?.destroy(); } catch {}
  }
}
