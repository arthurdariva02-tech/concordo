const socket = io();

const el = {
  entrada: document.getElementById('entrada'),
  formEntrada: document.getElementById('form-entrada'),
  nome: document.getElementById('nome'),
  nomeEu: document.getElementById('nome-eu'),
  avatarEu: document.getElementById('avatar-eu'),
  listaCanais: document.getElementById('lista-canais'),
  btnNovoCanal: document.getElementById('btn-novo-canal'),
  titulo: document.getElementById('titulo-canal'),
  mensagens: document.getElementById('mensagens'),
  digitando: document.getElementById('digitando'),
  formMsg: document.getElementById('form-msg'),
  texto: document.getElementById('texto'),
  contagem: document.getElementById('contagem'),
  membros: document.getElementById('lista-membros'),
};

let meuNome = localStorage.getItem('nome') || '';
let canalAtual = 'geral';
var emVoz = false; // true enquanto a tela de chamada está aberta (controlado em voz.js)
let canais = [];
const naoLidas = {};
let ultima = null; // última mensagem desenhada, para agrupar
let timerDigitando;

// ---------- utilidades ----------
function corDoNome(nome) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

function criarAvatar(nome) {
  const a = document.createElement('div');
  a.className = 'avatar';
  a.style.background = corDoNome(nome);
  a.textContent = nome[0].toUpperCase();
  return a;
}

function formatarHora(ts) {
  const d = new Date(ts);
  const hoje = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString()
    ? `Hoje às ${hora}`
    : `${d.toLocaleDateString('pt-BR')} ${hora}`;
}

// ---------- entrada ----------
function entrar(nome) {
  meuNome = nome;
  localStorage.setItem('nome', nome);
  el.entrada.classList.add('oculta');
  el.nomeEu.textContent = nome;
  el.avatarEu.style.background = corDoNome(nome);
  el.avatarEu.textContent = nome[0].toUpperCase();
  socket.emit('entrar', nome);
}

el.formEntrada.addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = el.nome.value.trim();
  if (nome) entrar(nome);
});

if (meuNome) entrar(meuNome);
else el.nome.focus();

// Reentrar automaticamente se a conexão cair e voltar
socket.on('connect', () => {
  if (meuNome) socket.emit('entrar', meuNome);
});

// ---------- canais ----------
function desenharCanais() {
  el.listaCanais.innerHTML = '';
  for (const c of canais) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = c === canalAtual && !emVoz ? 'ativo' : naoLidas[c] ? 'nova' : '';
    btn.innerHTML = '<span class="hash">#</span>';
    btn.append(c);
    if (naoLidas[c] && c !== canalAtual) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = naoLidas[c];
      btn.append(b);
    }
    btn.addEventListener('click', () => abrirCanal(c));
    ligarMenu(btn, () => menuCanal(c));
    li.append(btn);
    el.listaCanais.append(li);
  }
}

function menuCanal(c) {
  const itens = [
    {
      rotulo: 'Renomear canal',
      acao: () => {
        const novo = prompt('Novo nome do canal:', c);
        if (novo) socket.emit('renomear-canal', { antigo: c, novo });
      },
    },
  ];
  if (canais.length > 1) {
    itens.push({
      rotulo: 'Excluir canal',
      perigo: true,
      acao: () => {
        if (confirm(`Excluir o canal #${c}? As mensagens dele serão apagadas.`)) {
          socket.emit('excluir-canal', c);
        }
      },
    });
  }
  return itensMenu(itens);
}

// ---------- menus laterais no celular ----------
function abrirDrawer(qual) {
  document.body.dataset.drawer = qual;
}
function fecharDrawer() {
  delete document.body.dataset.drawer;
}
document.querySelectorAll('.btn-menu').forEach((b) => b.addEventListener('click', () => abrirDrawer('menu')));
document.querySelectorAll('.btn-membros').forEach((b) => b.addEventListener('click', () => abrirDrawer('membros')));
document.getElementById('fundo-menu').addEventListener('click', fecharDrawer);

function abrirCanal(c) {
  fecharDrawer();
  if (typeof esconderVoz === 'function') esconderVoz();
  canalAtual = c;
  naoLidas[c] = 0;
  el.titulo.textContent = c;
  el.texto.placeholder = `Conversar em #${c}`;
  el.digitando.textContent = '';
  desenharCanais();
  socket.emit('abrir-canal', c);
  el.texto.focus();
}

el.btnNovoCanal.addEventListener('click', () => {
  const nome = prompt('Nome do novo canal:');
  if (nome) socket.emit('criar-canal', nome);
});

// ---------- mensagens ----------
function desenharMensagem(m) {
  const junto =
    ultima && ultima.autor === m.autor && m.hora - ultima.hora < 5 * 60 * 1000;
  const linha = document.createElement('div');
  linha.className = 'msg' + (junto ? ' junto' : ' nova-pessoa');

  const lado = document.createElement('div');
  lado.className = 'lado';
  if (junto) {
    const h = document.createElement('div');
    h.className = 'hora-lado';
    h.textContent = new Date(m.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lado.append(h);
  } else {
    lado.append(criarAvatar(m.autor));
  }

  const conteudo = document.createElement('div');
  if (!junto) {
    const cab = document.createElement('div');
    cab.className = 'cabecalho';
    const autor = document.createElement('span');
    autor.className = 'autor';
    autor.style.color = corDoNome(m.autor);
    autor.textContent = m.autor;
    const hora = document.createElement('span');
    hora.className = 'hora';
    hora.textContent = formatarHora(m.hora);
    cab.append(autor, hora);
    conteudo.append(cab);
  }
  const corpo = document.createElement('div');
  corpo.className = 'corpo';
  corpo.textContent = m.texto; // textContent evita injeção de HTML
  conteudo.append(corpo);

  linha.append(lado, conteudo);
  el.mensagens.append(linha);
  ultima = m;
}

function rolarParaBaixo() {
  el.mensagens.scrollTop = el.mensagens.scrollHeight;
}

socket.on('inicio', (dados) => {
  canais = dados.canais;
  abrirCanal(canais.includes(canalAtual) ? canalAtual : canais[0]);
});

socket.on('canais', (lista) => {
  canais = lista;
  if (!canais.includes(canalAtual)) {
    // o canal que eu estava vendo foi excluído
    canalAtual = canais[0];
    el.titulo.textContent = canalAtual;
    el.texto.placeholder = `Conversar em #${canalAtual}`;
    socket.emit('abrir-canal', canalAtual);
  }
  desenharCanais();
});

socket.on('canal-renomeado', ({ antigo, novo }) => {
  if (canalAtual === antigo) {
    canalAtual = novo;
    el.titulo.textContent = novo;
    el.texto.placeholder = `Conversar em #${novo}`;
  }
  if (naoLidas[antigo]) naoLidas[novo] = naoLidas[antigo];
  delete naoLidas[antigo];
});

socket.on('historico', ({ canal, mensagens }) => {
  if (canal !== canalAtual) return;
  el.mensagens.innerHTML = '';
  ultima = null;
  if (!mensagens.length) {
    el.mensagens.innerHTML = `<p class="vazio">Este é o início do canal #${canal}. Envie a primeira mensagem!</p>`;
  }
  mensagens.forEach(desenharMensagem);
  rolarParaBaixo();
});

socket.on('mensagem', (m) => {
  if (m.canal !== canalAtual) {
    naoLidas[m.canal] = (naoLidas[m.canal] || 0) + 1;
    desenharCanais();
    return;
  }
  const vazio = el.mensagens.querySelector('.vazio');
  if (vazio) vazio.remove();
  const noFim = el.mensagens.scrollHeight - el.mensagens.scrollTop - el.mensagens.clientHeight < 80;
  desenharMensagem(m);
  if (noFim || m.autor === meuNome) rolarParaBaixo();
  if (m.autor !== meuNome) el.digitando.textContent = '';
});

el.formMsg.addEventListener('submit', (e) => {
  e.preventDefault();
  const texto = el.texto.value.trim();
  if (!texto) return;
  socket.emit('mensagem', { canal: canalAtual, texto });
  el.texto.value = '';
});

// ---------- "está digitando..." ----------
let ultimoAviso = 0;
el.texto.addEventListener('input', () => {
  if (Date.now() - ultimoAviso > 2000) {
    socket.emit('digitando', canalAtual);
    ultimoAviso = Date.now();
  }
});

socket.on('digitando', ({ autor, canal }) => {
  if (canal !== canalAtual) return;
  el.digitando.textContent = `${autor} está digitando...`;
  clearTimeout(timerDigitando);
  timerDigitando = setTimeout(() => (el.digitando.textContent = ''), 3000);
});

// ---------- membros online ----------
socket.on('usuarios', (lista) => {
  el.contagem.textContent = `Online — ${lista.length}`;
  el.membros.innerHTML = '';
  for (const nome of lista) {
    const li = document.createElement('li');
    const nomeEl = document.createElement('span');
    nomeEl.textContent = nome;
    li.append(criarAvatar(nome), nomeEl);
    if (nome !== meuNome) ligarMenu(li, () => conteudoPessoa(nome));
    el.membros.append(li);
  }
});
