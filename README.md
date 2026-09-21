# Rende · Combustível

App 100% mobile (PWA) para carro e moto: calcula **autonomia**, **custo por km**, compara **gasolina x etanol** e guarda o histórico de abastecimentos.

- Front-end puro (HTML + CSS + JS), sem build. Abre direto no VS Code.
- Hospedagem: **GitHub Pages**
- Banco: **Supabase** (funciona sem ele, salvando só no aparelho)
- Instalável na tela inicial, com ícone próprio, como um app

## Estrutura

```
index.html              tela do app
css/style.css           visual
js/config.js            chaves do Supabase/VAPID + valores pré-definidos
js/app.js               lógica
sw.js                   funciona offline / instalável
manifest.webmanifest    nome e ícone do app
icons/                  ícones (gerados por make_icons.py)
supabase/schema.sql     tabelas e segurança do banco
supabase/functions/     Edge Function que envia o push
.github/workflows/      agendador diário do push
```

## 1. Rodar no VS Code

1. Abra a pasta no VS Code (`File > Open Folder`).
2. Instale a extensão **Live Server** e clique em **Go Live** (o service worker exige `localhost` ou HTTPS).
3. No Chrome, aperte `F12` e ative o modo celular para ver como fica.

## 2. Configurar o Supabase

1. Crie um projeto em <https://supabase.com>.
2. **Authentication > Sign In / Providers**: ative **Allow anonymous sign-ins**.
3. **SQL Editor**: cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
4. **Project Settings > API**: copie a **Project URL** e a chave **anon public** para `js/config.js`.

> Use somente a chave `anon`. Nunca coloque a `service_role` no código.

## 3. Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Rende: primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/rende.git
git push -u origin main
```

No GitHub: **Settings > Pages > Build and deployment > Deploy from a branch > main / (root)**.
Em alguns minutos o app fica em `https://SEU-USUARIO.github.io/rende/`.

**Ao publicar mudanças**, aumente a versão em `sw.js` (`rende-v1` → `rende-v2`) para os celulares receberem a atualização.

## 4. Instalar no celular

- **Android (Chrome):** menu ⋮ > *Instalar app* / *Adicionar à tela inicial*.
- **iPhone (Safari):** botão Compartilhar > *Adicionar à Tela de Início*.

## Sino de notificações

O sino no topo abre o painel de avisos, com contador de não lidos:

- **Lembrar de abastecer:** avisa depois de X dias (padrão 7) sem registrar abastecimento do carro ou da moto.
- **Combustível que compensa:** avisa quando gasolina ou etanol passa a ser o mais barato por km.
- **Avisos do celular:** o botão pede permissão para mostrar também como notificação do sistema.

Sem o passo abaixo, os avisos são conferidos só quando o app é aberto. Com o push configurado, o lembrete chega **com o app fechado**.

## Push com o app fechado (gratuito)

Funciona assim: o app guarda a inscrição do seu aparelho no Supabase; todo dia de manhã o GitHub Actions chama uma Edge Function, que envia o lembrete se você está há X dias sem abastecer. Isso também impede que o projeto gratuito do Supabase seja pausado por inatividade.

1. **Rodar o SQL de novo:** cole o `supabase/schema.sql` atualizado no SQL Editor (cria a tabela `push_subscriptions`; o resto não muda).
2. **Gerar as chaves VAPID:** `npx web-push generate-vapid-keys`. Coloque a **Public Key** em `js/config.js` (`VAPID_PUBLIC_KEY`). Guarde a Private Key.
3. **Instalar o Supabase CLI** (<https://supabase.com/docs/guides/cli>), entrar na pasta do projeto e rodar:
   ```bash
   supabase login
   supabase init            # só se ainda não existir supabase/config.toml
   supabase link --project-ref SEU_PROJECT_REF
   supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:seu@email.com" CRON_SECRET="uma-senha-longa-qualquer"
   supabase functions deploy enviar-lembretes --no-verify-jwt
   ```
   O `project ref` é o trecho antes de `.supabase.co` na sua URL.
4. **Secrets do GitHub** (repositório > Settings > Secrets and variables > Actions):
   - `FUNCTION_URL` = `https://SEU_PROJECT_REF.supabase.co/functions/v1/enviar-lembretes`
   - `CRON_SECRET` = a mesma senha do passo 3
5. **Testar:** aba **Actions** > *Lembretes de abastecimento* > **Run workflow**. Deve terminar em verde.
6. **No celular:** abra o app instalado, toque no sino e em **Ativar avisos no celular**.

Observações:
- O GitHub desativa workflows agendados em repositório público após cerca de 60 dias sem nenhuma atividade. Se isso acontecer, faça qualquer commit ou reative na aba Actions.
- O horário não é exato (o agendador do GitHub pode atrasar alguns minutos) e o lembrete é enviado no máximo uma vez a cada X dias.
- No iPhone, precisa do app adicionado à Tela de Início (iOS 16.4 ou mais novo).
- O aviso "outro combustível passou a compensar" continua funcionando só com o app aberto.

## Personalizar

Em `js/config.js`:

- `PRECOS_PREDEFINIDOS`: os 3 valores de cada combustível (etanol já vem com 3,49 / 3,59 / 3,69).
- `VALORES_RAPIDOS`: atalhos de "Quanto abastecer".

Os valores de km/l e tanque de cada veículo são editados dentro do app e ficam salvos.

## Como o app calcula

- Litros = valor ÷ preço do litro
- Autonomia = litros × km/l
- Custo por km = preço do litro ÷ km/l
- O etanol compensa quando `preço etanol ÷ preço gasolina` é menor que `km/l etanol ÷ km/l gasolina`
- Consumo real: diferença de km do painel entre abastecimentos ÷ litros do abastecimento (considera tanque cheio)

## Sobre os dados na nuvem

O app usa login anônimo do Supabase: não há tela de login e os dados ficam ligados ao navegador/aparelho. Se limpar os dados do navegador ou trocar de celular, o acesso a esse histórico se perde. Quando quiser sincronizar entre aparelhos, o próximo passo é trocar por login com e-mail (o schema já está pronto para isso).
