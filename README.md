# Questões IF

App de quiz com banco de questões de Institutos Federais, cadastro de
novas questões (com imagem) e geração automática de explicações.

Abaixo está o passo a passo completo para publicar este site, sem
precisar instalar nada no computador.

## 1. Criar o projeto no Supabase (banco de dados + imagens)

1. Acesse https://supabase.com e crie uma conta gratuita.
2. Clique em "New project". Escolha um nome (ex: `questoes-if`) e uma
   senha para o banco (guarde essa senha em algum lugar seguro).
3. Quando o projeto terminar de ser criado, vá em **SQL Editor** (menu
   lateral) > **New query**.
4. Abra o arquivo `supabase-schema.sql` (está nesta pasta), copie todo
   o conteúdo, cole no editor e clique em **Run**.
   - Isso cria a tabela `questoes`, o espaço de armazenamento de
     imagens (`imagens-questoes`) e já cadastra as 9 questões de
     exemplo.
5. Vá em **Project Settings > API**. Você vai precisar de dois valores
   nos próximos passos:
   - **Project URL**
   - **anon public key**

## 2. Subir o código para o GitHub

1. Acesse https://github.com e crie uma conta gratuita (se ainda não
   tiver).
2. Clique em **New repository**. Dê um nome (ex: `questoes-if`) e
   marque como **Public** ou **Private** (qualquer um funciona).
3. Não marque para criar README/gitignore (já temos esses arquivos).
4. Depois de criado, na página do repositório, clique em
   **uploading an existing file** (ou "Add file > Upload files").
5. Arraste todos os arquivos e pastas desta pasta `questoes-if-app`
   para dentro da área de upload (mantenha a estrutura de pastas:
   `app`, `lib`, etc.).
6. Clique em **Commit changes** para salvar.

## 3. Publicar na Vercel

1. Acesse https://vercel.com e crie uma conta gratuita usando o login
   do GitHub (assim ela já tem acesso aos seus repositórios).
2. Clique em **Add New > Project**.
3. Escolha o repositório `questoes-if` que você criou no GitHub e
   clique em **Import**.
4. Antes de clicar em "Deploy", abra a seção **Environment Variables**
   e adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` → cole o "Project URL" do Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → cole a "anon public key" do
     Supabase
   - (opcional) `ANTHROPIC_API_KEY` → se quiser explicações geradas
     por IA automaticamente
5. Clique em **Deploy**. Em 1 ou 2 minutos a Vercel mostra o link do
   seu site, algo como `https://questoes-if.vercel.app`.

Pronto — esse link pode ser compartilhado com qualquer aluno. Toda vez
que alguém cadastrar uma questão pela tela "+ Cadastrar questão", ela
fica salva no Supabase e aparece para todo mundo que acessar o link.

## 5. Login de alunos e área de professores

Esse projeto já vem com login de alunos, download de PDF e uma área
exclusiva para professores cadastrarem questões.

1. No Supabase, vá em **SQL Editor > New query**, cole o conteúdo do
   arquivo `supabase-schema-parte2-login.sql` e clique em **Run**.
2. Ainda no Supabase, vá em **Authentication > Providers > Email** e
   desligue a opção **"Confirm email"**. Assim, quando alguém criar
   uma conta no site, ela já pode usar na hora (sem precisar clicar
   em um link enviado por e-mail).
3. Suba/atualize o código no GitHub normalmente — a Vercel publica a
   nova versão automaticamente.

### Como funciona

- Qualquer pessoa pode criar uma conta em **"Criar conta"**.
- Ao criar a conta, a pessoa pode marcar a opção **"Sou professor e
  quero solicitar acesso"**.
- Alunos logados podem clicar em **"Baixar lista em PDF"** na tela de
  filtros (com ou sem gabarito).
- A tela **"+ Cadastrar questão"** (em "Área do professor") só
  aparece/funciona para contas aprovadas como professor.

### Como aprovar um professor

1. No Supabase, vá em **Table Editor > profiles**.
2. Encontre a linha da pessoa pelo e-mail.
3. Mude o valor da coluna **is_professor** de `false` para `true` e
   salve.
4. A partir do próximo login, essa pessoa já pode cadastrar questões.

## 6. Atualizações futuras

Sempre que quiser mudar o código (cores, textos, etc.), edite os
arquivos no GitHub (botão de lápis em cada arquivo) ou suba uma nova
versão pela mesma tela de upload. A Vercel publica automaticamente a
nova versão em cerca de 1 minuto após cada alteração.

## Estrutura do projeto

```
app/
  page.js                  -> tela principal (filtros + quiz + resultado)
  professor/page.js        -> área do professor (cadastro de questões, com imagem)
  login/page.js            -> tela de login
  cadastro-conta/page.js   -> tela de criação de conta (aluno/professor)
  api/explicacao/route.js  -> gera explicação com IA quando necessário
  AuthProvider.js          -> controla o estado de login em todo o site
  layout.js, globals.css
components/
  Header.js                -> barra de login/conta exibida nas páginas
lib/
  supabaseClient.js        -> conexão com o Supabase
  gerarPdf.js              -> gera o PDF da lista de questões
supabase-schema.sql              -> script 1: tabela de questões, bucket e seed
supabase-schema-parte2-login.sql -> script 2: login, perfis e permissões de professor
.env.local.example               -> modelo das variáveis de ambiente
```
