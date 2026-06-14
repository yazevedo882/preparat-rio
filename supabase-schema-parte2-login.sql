-- ============================================================
-- PARTE 2 — Login de alunos e área de professores
-- Execute este script no Supabase: SQL Editor > New query > Run
-- (Esse script é separado do primeiro porque o primeiro já foi
-- executado e criou a tabela "questoes")
-- ============================================================

-- 1) Tabela de perfis (um perfil para cada conta criada)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  quer_ser_professor boolean default false,
  is_professor boolean default false,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Usuário pode ver o próprio perfil"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Usuário pode atualizar o próprio perfil"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2) Trigger: sempre que alguém cria uma conta, cria automaticamente
-- a linha correspondente em "profiles" (com is_professor = false)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome, quer_ser_professor, is_professor)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', ''),
    coalesce((new.raw_user_meta_data->>'quer_ser_professor')::boolean, false),
    false
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Trava de segurança: ninguém consegue se promover a "professor"
-- sozinho. Só uma edição feita pelo painel do Supabase (que usa a
-- "service role") consegue mudar is_professor para true.
create or replace function public.protect_is_professor()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    if TG_OP = 'INSERT' then
      NEW.is_professor := false;
    elsif TG_OP = 'UPDATE' then
      NEW.is_professor := OLD.is_professor;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_protect_is_professor on profiles;
create trigger trg_protect_is_professor
  before insert or update on profiles
  for each row execute function public.protect_is_professor();

-- 4) Atualiza as permissões da tabela "questoes": agora só
-- professores aprovados podem cadastrar novas questões.
drop policy if exists "Qualquer pessoa pode cadastrar questões" on questoes;

create policy "Professores podem cadastrar questões"
  on questoes for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_professor = true
    )
  );

-- 5) Atualiza as permissões de upload de imagens: só professores
-- aprovados podem enviar imagens.
drop policy if exists "Qualquer pessoa pode enviar imagens" on storage.objects;

create policy "Professores podem enviar imagens"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'imagens-questoes'
    and exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_professor = true
    )
  );

-- ============================================================
-- COMO APROVAR UM PROFESSOR
-- 1) No menu lateral do Supabase, vá em "Table Editor".
-- 2) Abra a tabela "profiles".
-- 3) Encontre a linha da pessoa (pelo e-mail) que pediu acesso
--    (quer_ser_professor = true).
-- 4) Clique no valor da coluna "is_professor" dessa linha e
--    mude de "false" para "true". Salve.
-- A partir do próximo login dessa pessoa, ela já pode cadastrar
-- questões.
-- ============================================================

-- ============================================================
-- IMPORTANTE: desative a confirmação de e-mail
-- Em Authentication > Providers > Email, desligue a opção
-- "Confirm email". Assim os alunos conseguem usar a conta
-- imediatamente após se cadastrarem, sem precisar clicar em
-- um link enviado por e-mail.
-- ============================================================
