# Chat estilo Discord (simplificado)

Chat em tempo real com canais de texto, **salas de voz** e **apresentação de tela**, lista de membros online,
indicador de "digitando…" e contador de mensagens não lidas. Feito com Node.js, Express, Socket.IO e WebRTC.

## Como rodar no VS Code

1. Instale o Node.js (versão 18 ou superior): https://nodejs.org
2. No VS Code: **Arquivo > Abrir Pasta…** e escolha a pasta `chat-estilo-discord`.
3. Abra o terminal integrado (**Ctrl + '**) e rode:

   ```
   npm install
   npm start
   ```

4. Abra http://localhost:3000 no navegador.
   Para testar a conversa, abra a mesma página em duas abas com nomes diferentes.

Durante o desenvolvimento, use `npm run dev` para o servidor reiniciar sozinho quando você salvar o `server.js`.

## Voz e apresentação de tela

- Na barra lateral, em **Canais de voz**, clique em uma sala para entrar (o navegador vai pedir permissão do microfone).
- Você vê quem está em cada sala, um contorno verde aparece em volta de quem está falando e o ícone 🔇 marca quem está com o microfone silenciado.
- Para criar uma sala nova, clique no **+** ao lado de "Canais de voz" (até 10 salas).
- Botões da chamada: **microfone** (silenciar/ativar), **compartilhar tela** (você escolhe a tela, janela ou aba) e **sair**.
  Eles ficam na tela da chamada e também na barra "Voz conectada", então você pode conversar por texto e continuar na chamada.
- Telas compartilhadas aparecem para todos na sala. Clique duas vezes em uma tela para vê-la em tela cheia.
- Para testar sozinho, abra duas abas com nomes diferentes e entre na mesma sala. Use fones para evitar eco.

### Limites importantes

- O navegador só libera microfone e compartilhamento de tela em `http://localhost` ou em **HTTPS**. Acessando pelo IP
  da rede (por exemplo `http://192.168.0.10:3000`) isso será bloqueado. Para uso real, publique com HTTPS (Render, Railway, Fly.io).
- As pessoas se conectam diretamente umas com as outras, o que funciona bem para grupos pequenos (até 5 ou 6).
  Para salas maiores seria necessário um servidor de mídia (como LiveKit ou mediasoup).
- Em algumas redes (empresas, 4G com restrições) a conexão direta falha. Aí é preciso adicionar um servidor TURN
  na lista `CONFIG_RTC` do arquivo `public/voz.js`.

## Ajustes de som, editar e excluir

- **Som de cada pessoa:** clique com o **botão direito** no ícone ou no nome de alguém (na chamada, na lista de
  salas ou na lista de membros) para ajustar o volume dessa pessoa ou silenciá-la só para você.
  A escolha fica salva neste navegador e só você ouve a diferença.
- **Editar ou excluir canais:** clique com o botão direito em um canal de texto ou em uma sala de voz para
  **renomear** ou **excluir**. Excluir um canal apaga as mensagens dele, e excluir uma sala desconecta quem estiver nela.
  O último canal de texto não pode ser excluído. Qualquer pessoa conectada pode editar ou excluir, pois ainda não há permissões.

## No celular

- O layout se adapta: o botão **☰** abre a lista de canais e o botão **👥** mostra quem está online.
- No lugar do botão direito, **segure o dedo** sobre o item (cerca de meio segundo) para abrir o mesmo menu.
- Dá para entrar nas salas de voz, falar, ouvir e **ver** telas compartilhadas por outras pessoas.
  **Compartilhar a tela pelo celular não é possível**, porque os navegadores de celular não oferecem esse recurso,
  então o botão fica escondido por lá.
- Microfone no celular só funciona com **HTTPS** (ou `localhost`), então para testar pelo celular publique o projeto online.

## Estrutura

- `server.js` — servidor, canais e mensagens (salvas em `dados.json`)
- `public/index.html` — estrutura da página
- `public/style.css` — visual (cores no topo do arquivo, em `:root`)
- `public/app.js` — lógica do navegador (texto)
- `public/voz.js` — chamada de voz, compartilhamento de tela (WebRTC) e ajustes de som por pessoa
- `public/menu.js` — menu de botão direito / toque longo

## Ideias para evoluir

- Login com senha (por exemplo, com um banco SQLite)
- Mensagens privadas entre usuários
- Envio de imagens e emojis
- Vários servidores na barra da esquerda
- Permissões (só administradores editam canais) e login com senha

