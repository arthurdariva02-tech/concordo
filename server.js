const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ARQUIVO = path.join(__dirname, 'dados.json');
const MAX_MENSAGENS = 100;

// Banco de dados simples: um arquivo JSON
let db = {
  canais: ['geral', 'jogos', 'musica'],
  mensagens: { geral: [], jogos: [], musica: [] },
};
try {
  db = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
} catch {}

function salvar() {
  fs.writeFile(ARQUIVO, JSON.stringify(db), () => {});
}

function nomeCanal(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
}

function nomeSala(nome) {
  return String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

const usuarios = new Map(); // socket.id -> nome

// Salas de voz (a conversa de áudio/vídeo acontece direto entre os navegadores via WebRTC;
// o servidor só ajuda a conectar as pessoas)
if (!db.salas) {
  db.salas = [
    { id: 'sala-1', nome: 'Sala 1' },
    { id: 'sala-2', nome: 'Sala 2' },
  ];
}
const voz = new Map(); // socket.id -> id da sala
const mudos = new Set(); // quem está com o microfone silenciado

function estadoVoz() {
  const estado = {};
  for (const s of db.salas) estado[s.id] = [];
  for (const [sid, sala] of voz) {
    if (estado[sala]) estado[sala].push({ id: sid, nome: usuarios.get(sid), mudo: mudos.has(sid) });
  }
  return estado;
}

function sairDaVoz(socket) {
  const sala = voz.get(socket.id);
  if (!sala) return;
  voz.delete(socket.id);
  mudos.delete(socket.id);
  for (const [sid, s] of voz) if (s === sala) io.to(sid).emit('voz-saiu', socket.id);
  io.emit('voz-estado', estadoVoz());
}

function listaUsuarios() {
  return [...new Set(usuarios.values())].sort((a, b) => a.localeCompare(b));
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.on('entrar', (nome) => {
    nome = String(nome || '').trim().slice(0, 20);
    if (!nome) return;
    usuarios.set(socket.id, nome);
    socket.emit('inicio', { canais: db.canais, salas: db.salas });
    socket.emit('voz-estado', estadoVoz());
    io.emit('usuarios', listaUsuarios());
  });

  socket.on('abrir-canal', (canal) => {
    if (!db.canais.includes(canal)) return;
    socket.emit('historico', { canal, mensagens: db.mensagens[canal] });
  });

  socket.on('mensagem', ({ canal, texto }) => {
    const autor = usuarios.get(socket.id);
    texto = String(texto || '').trim().slice(0, 1000);
    if (!autor || !texto || !db.canais.includes(canal)) return;

    const msg = { autor, texto, canal, hora: Date.now() };
    db.mensagens[canal].push(msg);
    if (db.mensagens[canal].length > MAX_MENSAGENS) db.mensagens[canal].shift();
    salvar();
    io.emit('mensagem', msg);
  });

  socket.on('criar-canal', (nome) => {
    nome = nomeCanal(nome);
    if (!nome || db.canais.includes(nome) || db.canais.length >= 20) return;
    db.canais.push(nome);
    db.mensagens[nome] = [];
    salvar();
    io.emit('canais', db.canais);
  });

  socket.on('digitando', (canal) => {
    const autor = usuarios.get(socket.id);
    if (autor) socket.broadcast.emit('digitando', { autor, canal });
  });

  // ----- voz e tela -----
  socket.on('voz-entrar', (salaId) => {
    if (!usuarios.has(socket.id) || !db.salas.some((s) => s.id === salaId)) return;
    sairDaVoz(socket);
    const outros = [...voz]
      .filter(([, s]) => s === salaId)
      .map(([sid]) => ({ id: sid, nome: usuarios.get(sid) }));
    voz.set(socket.id, salaId);
    socket.emit('voz-participantes', outros);
    io.emit('voz-estado', estadoVoz());
  });

  socket.on('voz-sair', () => sairDaVoz(socket));

  // ----- editar e excluir canais de texto -----
  socket.on('renomear-canal', ({ antigo, novo } = {}) => {
    novo = nomeCanal(novo);
    if (!usuarios.has(socket.id) || !db.canais.includes(antigo)) return;
    if (!novo || novo === antigo || db.canais.includes(novo)) return;
    db.canais[db.canais.indexOf(antigo)] = novo;
    db.mensagens[novo] = (db.mensagens[antigo] || []).map((m) => ({ ...m, canal: novo }));
    delete db.mensagens[antigo];
    salvar();
    io.emit('canal-renomeado', { antigo, novo });
    io.emit('canais', db.canais);
  });

  socket.on('excluir-canal', (canal) => {
    if (!usuarios.has(socket.id) || !db.canais.includes(canal) || db.canais.length <= 1) return;
    db.canais = db.canais.filter((c) => c !== canal);
    delete db.mensagens[canal];
    salvar();
    io.emit('canais', db.canais);
  });

  // ----- editar e excluir salas de voz -----
  socket.on('renomear-sala', ({ id, nome } = {}) => {
    nome = nomeSala(nome);
    const sala = db.salas.find((x) => x.id === id);
    if (!usuarios.has(socket.id) || !sala || !nome) return;
    if (db.salas.some((x) => x !== sala && x.nome.toLowerCase() === nome.toLowerCase())) return;
    sala.nome = nome;
    salvar();
    io.emit('salas', db.salas);
  });

  socket.on('excluir-sala', (id) => {
    if (!usuarios.has(socket.id) || !db.salas.some((x) => x.id === id)) return;
    for (const [sid, sala] of [...voz]) {
      if (sala === id) {
        voz.delete(sid);
        mudos.delete(sid);
        io.to(sid).emit('sala-excluida', id);
      }
    }
    db.salas = db.salas.filter((x) => x.id !== id);
    salvar();
    io.emit('salas', db.salas);
    io.emit('voz-estado', estadoVoz());
  });

  socket.on('voz-mudo', (mudo) => {
    if (!voz.has(socket.id)) return;
    mudo ? mudos.add(socket.id) : mudos.delete(socket.id);
    io.emit('voz-estado', estadoVoz());
  });

  socket.on('criar-sala', (nome) => {
    nome = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!nome || db.salas.length >= 10) return;
    if (db.salas.some((s) => s.nome.toLowerCase() === nome.toLowerCase())) return;
    db.salas.push({ id: 'sala-' + Date.now().toString(36), nome });
    salvar();
    io.emit('salas', db.salas);
    io.emit('voz-estado', estadoVoz());
  });

  // Repassa as mensagens de conexão WebRTC entre duas pessoas da mesma sala
  socket.on('sinal', ({ para, dados }) => {
    const sala = voz.get(socket.id);
    if (sala && voz.get(para) === sala) io.to(para).emit('sinal', { de: socket.id, dados });
  });

  socket.on('disconnect', () => {
    sairDaVoz(socket);
    usuarios.delete(socket.id);
    io.emit('usuarios', listaUsuarios());
  });
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`Servidor rodando em http://localhost:${PORTA}`));
