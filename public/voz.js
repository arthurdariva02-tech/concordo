// Chat de voz e apresentação de tela usando WebRTC.
// Cada pessoa da sala se conecta diretamente com todas as outras ("malha"), então
// funciona bem para grupos pequenos (até uns 5 ou 6). O servidor só repassa os sinais de conexão.

const CONFIG_RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const v = {
  lista: document.getElementById('lista-voz'),
  barra: document.getElementById('barra-voz'),
  nomeBarra: document.getElementById('nome-sala-barra'),
  chat: document.querySelector('.chat'),
  titulo: document.getElementById('titulo-voz'),
  grade: document.getElementById('grade-voz'),
  telas: document.getElementById('grade-telas'),
};

let salasInfo = [];
let estadoVoz = {};
let salaVoz = null; // sala em que estou conectado
let micStream = null;
let telaStream = null;
let mutado = false;
const pares = new Map(); // id -> { pc, nome, polite, fazendoOferta, ignorarOferta, audio, telaSender }
const falando = new Set();
const monitores = new Map();
let ctxAudio = null;

// ---------- interface ----------
function nomeDaSala(id) {
  const s = salasInfo.find((x) => x.id === id);
  return s ? s.nome : '';
}

function desenharLateral() {
  v.lista.innerHTML = '';
  for (const sala of salasInfo) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'canal-voz' + (salaVoz === sala.id ? ' ativo' : '');
    btn.textContent = `🔊 ${sala.nome}`;
    btn.addEventListener('click', () => entrarNaVoz(sala.id));
    ligarMenu(btn, () => menuSala(sala));
    li.append(btn);

    const ul = document.createElement('ul');
    ul.className = 'quem';
    for (const u of estadoVoz[sala.id] || []) {
      const item = document.createElement('li');
      const nome = document.createElement('span');
      nome.textContent = u.nome;
      item.append(criarAvatar(u.nome), nome);
      if (u.id !== socket.id) ligarMenu(item, () => conteudoPessoa(u.nome));
      if (u.mudo) {
        const m = document.createElement('span');
        m.className = 'icone-mudo';
        m.title = 'Microfone silenciado';
        m.textContent = '🔇';
        item.append(m);
      }
      ul.append(item);
    }
    li.append(ul);
    v.lista.append(li);
  }
}

function desenharGrade() {
  v.grade.innerHTML = '';
  if (!salaVoz) return;
  for (const u of estadoVoz[salaVoz] || []) {
    const tile = document.createElement('div');
    tile.className = 'tile-voz' + (falando.has(u.id) ? ' falando' : '');
    tile.dataset.id = u.id;
    const nome = document.createElement('span');
    nome.textContent = u.id === socket.id ? `${u.nome} (você)` : u.nome;
    tile.append(criarAvatar(u.nome), nome);
    if (u.id !== socket.id) ligarMenu(tile, () => conteudoPessoa(u.nome));
    if (u.mudo) {
      const m = document.createElement('span');
      m.className = 'badge-mudo';
      m.title = 'Microfone silenciado';
      m.textContent = '🔇';
      tile.append(m);
    }
    v.grade.append(tile);
  }
}

function mostrarVoz() {
  if (!salaVoz) return;
  fecharDrawer();
  emVoz = true;
  v.chat.classList.add('em-voz');
  v.titulo.textContent = nomeDaSala(salaVoz);
  desenharGrade();
  desenharCanais();
}

function esconderVoz() {
  if (!emVoz) return;
  emVoz = false;
  v.chat.classList.remove('em-voz');
  desenharCanais();
}

function atualizarControles() {
  v.barra.hidden = !salaVoz;
  v.nomeBarra.textContent = salaVoz ? nomeDaSala(salaVoz) : '';
  document.querySelectorAll('.ctl-mic').forEach((b) => {
    b.classList.toggle('off', mutado);
    const texto = mutado ? 'Ativar microfone' : 'Silenciar microfone';
    b.title = texto;
    b.setAttribute('aria-label', texto);
    const rot = b.querySelector('.rot');
    if (rot) rot.textContent = mutado ? 'Microfone desligado' : 'Microfone ligado';
  });
  document.querySelectorAll('.ctl-tela').forEach((b) => {
    b.classList.toggle('on', !!telaStream);
    const texto = telaStream ? 'Parar apresentação' : 'Compartilhar tela';
    b.title = texto;
    b.setAttribute('aria-label', texto);
    const rot = b.querySelector('.rot');
    if (rot) rot.textContent = texto;
  });
}

if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
  document.querySelectorAll('.ctl-tela').forEach((b) => (b.hidden = true));
}
document.querySelectorAll('.ctl-mic').forEach((b) => b.addEventListener('click', alternarMic));
document.querySelectorAll('.ctl-tela').forEach((b) => b.addEventListener('click', alternarTela));
document.querySelectorAll('.ctl-sair').forEach((b) => b.addEventListener('click', () => sairDaVoz()));

// ---------- quem está falando ----------
function monitorar(id, stream) {
  try {
    ctxAudio = ctxAudio || new AudioContext();
    const origem = ctxAudio.createMediaStreamSource(stream);
    const analisador = ctxAudio.createAnalyser();
    analisador.fftSize = 512;
    origem.connect(analisador);
    const dados = new Uint8Array(analisador.fftSize);
    const timer = setInterval(() => {
      analisador.getByteTimeDomainData(dados);
      let max = 0;
      for (const x of dados) max = Math.max(max, Math.abs(x - 128));
      const fala = max > 12 && !(id === socket.id && mutado);
      if (fala !== falando.has(id)) {
        fala ? falando.add(id) : falando.delete(id);
        const tile = v.grade.querySelector(`[data-id="${id}"]`);
        if (tile) tile.classList.toggle('falando', fala);
      }
    }, 150);
    monitores.set(id, { timer, origem });
  } catch (e) {
    console.warn('Não foi possível monitorar o áudio', e);
  }
}

function pararMonitor(id) {
  const m = monitores.get(id);
  if (!m) return;
  clearInterval(m.timer);
  m.origem.disconnect();
  monitores.delete(id);
  falando.delete(id);
}

// ---------- entrar e sair ----------
async function entrarNaVoz(salaId) {
  if (salaVoz === salaId) return mostrarVoz();
  if (salaVoz) sairDaVoz();
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    alert('Não foi possível usar o microfone. Verifique a permissão do navegador e se a página está em localhost ou HTTPS.');
    return;
  }
  salaVoz = salaId;
  mutado = false;
  monitorar(socket.id, micStream);
  socket.emit('voz-entrar', salaId);
  atualizarControles();
  desenharLateral();
  mostrarVoz();
}

function sairDaVoz() {
  if (!salaVoz) return;
  if (socket.connected) socket.emit('voz-sair');
  pararTela();
  for (const id of [...pares.keys()]) fecharPar(id);
  pararMonitor(socket.id);
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  micStream = null;
  salaVoz = null;
  mutado = false;
  esconderVoz();
  atualizarControles();
  desenharLateral();
}

function alternarMic() {
  if (!micStream) return;
  mutado = !mutado;
  micStream.getAudioTracks().forEach((t) => (t.enabled = !mutado));
  socket.emit('voz-mudo', mutado);
  atualizarControles();
}

// ---------- apresentação de tela ----------
function criarTelaVisual(legenda, stream, local) {
  const caixa = document.createElement('div');
  caixa.className = 'tela';
  caixa.title = 'Clique duas vezes para tela cheia';
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // o áudio das pessoas vem pelos elementos de áudio
  video.srcObject = stream;
  const texto = document.createElement('span');
  texto.className = 'legenda';
  texto.textContent = legenda;
  caixa.append(video, texto);
  caixa.addEventListener('dblclick', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (caixa.requestFullscreen) caixa.requestFullscreen();
  });
  if (local) caixa.dataset.local = '1';
  return caixa;
}

async function alternarTela() {
  if (telaStream) return pararTela();
  if (!salaVoz) return;
  if (!navigator.mediaDevices.getDisplayMedia) {
    alert('Seu navegador não permite compartilhar a tela.');
    return;
  }
  try {
    telaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e) {
    return; // a pessoa cancelou
  }
  const track = telaStream.getVideoTracks()[0];
  track.addEventListener('ended', pararTela); // botão "Parar compartilhamento" do navegador
  for (const par of pares.values()) par.telaSender = par.pc.addTrack(track, telaStream);
  v.telas.append(criarTelaVisual('Sua tela', telaStream, true));
  atualizarControles();
}

function pararTela() {
  if (!telaStream) return;
  telaStream.getTracks().forEach((t) => t.stop());
  for (const par of pares.values()) {
    if (par.telaSender) {
      try { par.pc.removeTrack(par.telaSender); } catch {}
      par.telaSender = null;
    }
  }
  telaStream = null;
  v.telas.querySelectorAll('[data-local]').forEach((e) => e.remove());
  atualizarControles();
}

// ---------- conexões WebRTC ----------
function criarPar(id, nome) {
  const pc = new RTCPeerConnection(CONFIG_RTC);
  const par = {
    id, nome, pc,
    polite: socket.id < id, // um lado cede quando os dois tentam negociar ao mesmo tempo
    fazendoOferta: false,
    ignorarOferta: false,
    audio: null,
    telaSender: null,
  };
  pares.set(id, par);

  micStream.getTracks().forEach((t) => pc.addTrack(t, micStream));
  if (telaStream) par.telaSender = pc.addTrack(telaStream.getVideoTracks()[0], telaStream);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('sinal', { para: id, dados: { candidato: candidate } });
  };

  pc.onnegotiationneeded = async () => {
    try {
      par.fazendoOferta = true;
      await pc.setLocalDescription();
      socket.emit('sinal', { para: id, dados: { descricao: pc.localDescription } });
    } catch (e) {
      console.error(e);
    } finally {
      par.fazendoOferta = false;
    }
  };

  pc.ontrack = ({ track, streams }) => {
    const stream = streams[0] || new MediaStream([track]);
    if (track.kind === 'audio') {
      if (!par.audio) {
        par.audio = new Audio();
        par.audio.autoplay = true;
      }
      par.audio.srcObject = stream;
      aplicarPref(par);
      par.audio.play().catch(() => {});
      pararMonitor(id);
      monitorar(id, stream);
    } else {
      const caixa = criarTelaVisual(`Tela de ${par.nome}`, stream, false);
      caixa.dataset.de = id;
      v.telas.append(caixa);
      const remover = () => caixa.remove();
      track.addEventListener('mute', remover);
      track.addEventListener('ended', remover);
      stream.addEventListener('removetrack', remover);
    }
  };

  return par;
}

function fecharPar(id) {
  const par = pares.get(id);
  if (!par) return;
  par.pc.close();
  if (par.audio) par.audio.srcObject = null;
  pararMonitor(id);
  v.telas.querySelectorAll(`[data-de="${id}"]`).forEach((e) => e.remove());
  pares.delete(id);
}

// ---------- mensagens do servidor ----------
socket.on('inicio', (dados) => {
  salasInfo = dados.salas || [];
  desenharLateral();
});

document.getElementById('btn-nova-sala').addEventListener('click', () => {
  const nome = prompt('Nome da nova sala de voz:');
  if (nome) socket.emit('criar-sala', nome);
});

socket.on('salas', (lista) => {
  salasInfo = lista;
  if (salaVoz && !salasInfo.some((x) => x.id === salaVoz)) {
    sairDaVoz(); // a sala em que eu estava foi excluída
  } else if (salaVoz) {
    v.titulo.textContent = nomeDaSala(salaVoz);
    atualizarControles();
  }
  desenharLateral();
});

socket.on('sala-excluida', (id) => {
  if (salaVoz === id) sairDaVoz();
});

socket.on('voz-estado', (estado) => {
  estadoVoz = estado;
  for (const lista of Object.values(estado)) {
    for (const u of lista) {
      const par = pares.get(u.id);
      if (par) {
        par.nome = u.nome;
        aplicarPref(par);
      }
    }
  }
  desenharLateral();
  if (salaVoz) desenharGrade();
});

// Quem acabou de entrar liga para todos que já estavam na sala
socket.on('voz-participantes', (lista) => {
  if (!micStream) return;
  lista.forEach((u) => criarPar(u.id, u.nome));
});

socket.on('voz-saiu', (id) => fecharPar(id));

socket.on('sinal', async ({ de, dados }) => {
  if (!micStream) return;
  let par = pares.get(de);
  if (!par) {
    const info = (estadoVoz[salaVoz] || []).find((u) => u.id === de);
    par = criarPar(de, info ? info.nome : 'Alguém');
  }
  const pc = par.pc;
  try {
    if (dados.descricao) {
      const desc = dados.descricao;
      const colisao = desc.type === 'offer' && (par.fazendoOferta || pc.signalingState !== 'stable');
      par.ignorarOferta = !par.polite && colisao;
      if (par.ignorarOferta) return;
      await pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        await pc.setLocalDescription();
        socket.emit('sinal', { para: de, dados: { descricao: pc.localDescription } });
      }
    } else if (dados.candidato) {
      try {
        await pc.addIceCandidate(dados.candidato);
      } catch (e) {
        if (!par.ignorarOferta) throw e;
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Se a conexão com o servidor cair, a chamada também cai
socket.on('disconnect', () => sairDaVoz());


// ---------- editar e excluir salas ----------
function menuSala(sala) {
  const gente = (estadoVoz[sala.id] || []).length;
  return itensMenu([
    {
      rotulo: 'Renomear sala',
      acao: () => {
        const novo = prompt('Novo nome da sala:', sala.nome);
        if (novo) socket.emit('renomear-sala', { id: sala.id, nome: novo });
      },
    },
    {
      rotulo: 'Excluir sala',
      perigo: true,
      acao: () => {
        const aviso = gente ? ' As pessoas conectadas serão desconectadas.' : '';
        if (confirm(`Excluir a sala "${sala.nome}"?${aviso}`)) socket.emit('excluir-sala', sala.id);
      },
    },
  ]);
}

// ---------- som de cada pessoa (volume e silenciar só para mim) ----------
// As preferências ficam salvas neste navegador, pelo nome da pessoa.
function lerPrefs() {
  try {
    return JSON.parse(localStorage.getItem('prefsSom') || '{}');
  } catch {
    return {};
  }
}

function prefDe(nome) {
  const p = lerPrefs()[nome] || {};
  return { vol: typeof p.vol === 'number' ? p.vol : 100, mudo: !!p.mudo };
}

function salvarPref(nome, pref) {
  const todas = lerPrefs();
  todas[nome] = pref;
  try {
    localStorage.setItem('prefsSom', JSON.stringify(todas));
  } catch {}
}

function aplicarPref(par) {
  if (!par.audio) return;
  const p = prefDe(par.nome);
  par.audio.volume = p.vol / 100;
  par.audio.muted = p.mudo;
}

function aplicarPrefPorNome(nome) {
  for (const par of pares.values()) if (par.nome === nome) aplicarPref(par);
}

function conteudoPessoa(nome) {
  if (nome === meuNome) return null;
  const pref = prefDe(nome);

  const caixa = document.createElement('div');
  caixa.className = 'menu-pessoa';

  const titulo = document.createElement('strong');
  titulo.textContent = nome;

  const rotulo = document.createElement('label');
  rotulo.textContent = `Volume: ${pref.vol}%`;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.value = pref.vol;
  slider.setAttribute('aria-label', `Volume de ${nome}`);
  slider.addEventListener('input', () => {
    pref.vol = Number(slider.value);
    rotulo.textContent = `Volume: ${pref.vol}%`;
    salvarPref(nome, pref);
    aplicarPrefPorNome(nome);
  });

  const btnMudo = document.createElement('button');
  btnMudo.className = 'menu-item';
  const textoMudo = () => (pref.mudo ? 'Reativar o som desta pessoa' : 'Silenciar só para mim');
  btnMudo.textContent = textoMudo();
  btnMudo.addEventListener('click', () => {
    pref.mudo = !pref.mudo;
    salvarPref(nome, pref);
    aplicarPrefPorNome(nome);
    btnMudo.textContent = textoMudo();
  });

  caixa.append(titulo, rotulo, slider, btnMudo);

  const naChamada = [...pares.values()].some((par) => par.nome === nome);
  if (!naChamada) {
    const nota = document.createElement('small');
    nota.textContent = 'Vale quando essa pessoa estiver na sua chamada.';
    caixa.append(nota);
  }
  return caixa;
}
