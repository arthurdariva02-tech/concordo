// Menu flutuante: botão direito no computador, toque longo (segurar o dedo) no celular.

let menuAberto = null;
let ignorarCliqueAte = 0;

function fecharMenu() {
  if (menuAberto) {
    menuAberto.remove();
    menuAberto = null;
  }
}

function abrirMenu(x, y, conteudo) {
  fecharMenu();
  const menu = document.createElement('div');
  menu.className = 'menu-flutuante';
  menu.append(conteudo);
  document.body.append(menu);
  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - height - 8)) + 'px';
  menuAberto = menu;
}

// Cria uma lista de botões: itens = [{ rotulo, acao, perigo }]
function itensMenu(itens) {
  const caixa = document.createElement('div');
  for (const item of itens) {
    const b = document.createElement('button');
    b.className = 'menu-item' + (item.perigo ? ' perigo' : '');
    b.textContent = item.rotulo;
    b.addEventListener('click', () => {
      fecharMenu();
      item.acao();
    });
    caixa.append(b);
  }
  return caixa;
}

// Faz o elemento abrir um menu ao clicar com o botão direito ou segurar o dedo.
// criarConteudo() devolve o conteúdo do menu (ou null para não abrir nada).
function ligarMenu(elemento, criarConteudo) {
  elemento.classList.add('tem-menu');
  const abrir = (x, y) => {
    const conteudo = criarConteudo();
    if (conteudo) abrirMenu(x, y, conteudo);
  };

  let timer = null;
  let disparou = false;
  let px = 0;
  let py = 0;

  elemento.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.pointerType === 'touch') disparou = true;
    abrir(e.clientX, e.clientY);
  });

  elemento.addEventListener('touchstart', (e) => {
    disparou = false;
    px = e.touches[0].clientX;
    py = e.touches[0].clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      disparou = true;
      abrir(px, py);
    }, 500);
  }, { passive: true });

  elemento.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - px) > 10 || Math.abs(t.clientY - py) > 10) clearTimeout(timer);
  }, { passive: true });

  const terminar = () => {
    clearTimeout(timer);
    // Ao soltar o dedo depois do toque longo, o navegador gera um "clique" que não deve ser usado
    if (disparou) {
      ignorarCliqueAte = Date.now() + 500;
      disparou = false;
    }
  };
  elemento.addEventListener('touchend', terminar);
  elemento.addEventListener('touchcancel', terminar);
}

document.addEventListener('click', (e) => {
  if (Date.now() < ignorarCliqueAte) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

document.addEventListener('pointerdown', (e) => {
  if (menuAberto && !menuAberto.contains(e.target)) fecharMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharMenu();
});
window.addEventListener('scroll', fecharMenu, true);
window.addEventListener('resize', fecharMenu);
