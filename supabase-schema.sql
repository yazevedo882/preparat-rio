-- ============================================================
-- Execute este script no Supabase: menu "SQL Editor" > "New query"
-- Cole tudo e clique em "Run".
-- ============================================================

-- 1) Tabela de questões
create table if not exists questoes (
  id bigint generated always as identity primary key,
  instituto text not null,
  ano int not null,
  disciplina text not null,
  assunto text not null,
  enunciado text not null,
  opcoes jsonb not null,
  correta text not null,
  explicacao text,
  imagem_url text,
  created_at timestamptz default now()
);

-- 2) Permissões: como o app é público (alunos não fazem login),
-- liberamos leitura e cadastro de questões para qualquer pessoa.
alter table questoes enable row level security;

create policy "Qualquer pessoa pode ler questões"
  on questoes for select
  using (true);

create policy "Qualquer pessoa pode cadastrar questões"
  on questoes for insert
  with check (true);

-- 3) Bucket de imagens (também pode ser criado pela interface,
-- em Storage > New bucket > nome "imagens-questoes" > Public)
insert into storage.buckets (id, name, public)
values ('imagens-questoes', 'imagens-questoes', true)
on conflict (id) do nothing;

create policy "Qualquer pessoa pode ver imagens"
  on storage.objects for select
  using (bucket_id = 'imagens-questoes');

create policy "Qualquer pessoa pode enviar imagens"
  on storage.objects for insert
  with check (bucket_id = 'imagens-questoes');

-- 4) Questões iniciais (banco de exemplo)
insert into questoes (instituto, ano, disciplina, assunto, enunciado, opcoes, correta, explicacao, imagem_url) values
('IFSP', 2023, 'Matemática', 'Operações',
 'Uma fábrica produziu 1.248 peças em um dia, distribuídas igualmente entre 8 caixas para transporte. Quantas peças foram colocadas em cada caixa?',
 '["144","156","158","162"]', 'B',
 '1.248 ÷ 8 = 156. Conferindo: 156 × 8 = 1.248, então cada caixa recebeu 156 peças.', null),

('IFBA', 2024, 'Matemática', 'Operações',
 'Um ônibus saiu do terminal com 42 passageiros. Na primeira parada desceram 15 passageiros e subiram 23. Na segunda parada desceram 18 passageiros e não subiu ninguém. Quantos passageiros estavam no ônibus após a segunda parada?',
 '["28","30","32","35"]', 'C', null, null),

('IFBA', 2023, 'Matemática', 'Frações',
 'Marina recebeu seu salário mensal e gastou 2/5 desse valor com aluguel e 1/4 com alimentação. Que fração do salário ela ainda não gastou?',
 '["7/20","13/20","3/20","1/5"]', 'A',
 'Some as frações gastas usando o MMC de 5 e 4, que é 20: 2/5 = 8/20 e 1/4 = 5/20. Juntas, 8/20 + 5/20 = 13/20 foram gastos. O que falta é 20/20 − 13/20 = 7/20.', null),

('IFRJ', 2023, 'Matemática', 'Operações',
 'Em um campeonato, uma equipe ganhou 3 pontos em cada uma das 5 primeiras partidas e perdeu 2 pontos em cada uma das 3 partidas seguintes. Qual foi o saldo final de pontos dessa equipe?',
 '["6","9","11","15"]', 'B', null, null),

('IFMG', 2023, 'Matemática', 'Geometria',
 'A figura representa o terreno retangular de uma horta escolar, com 12 metros de comprimento e 8 metros de largura. Qual é o perímetro desse terreno?',
 '["20 m","40 m","96 m","48 m"]', 'B',
 'O perímetro de um retângulo é a soma de todos os lados, ou 2 × (comprimento + largura). Aqui: 2 × (12 + 8) = 2 × 20 = 40 metros.', null),

('IFSP', 2024, 'Matemática', 'Frações',
 'Uma turma do Instituto Federal tem 30 alunos. Sabendo que 2/3 da turma são meninas, quantos meninos há nessa turma?',
 '["10","15","20","12"]', 'A', null, null),

('IFMG', 2022, 'Português', 'Conjunções',
 'Leia a frase: "Apesar da forte chuva, os operários concluíram a obra dentro do prazo." A palavra "Apesar" estabelece, entre as orações, uma relação de:',
 '["Causa","Concessão/oposição","Tempo","Condição"]', 'B',
 '"Apesar de" é uma locução conjuntiva concessiva: introduz um fato que poderia impedir a ação principal, mas não impede. Por isso indica concessão/oposição entre as ideias.', null),

('IFRJ', 2024, 'Português', 'Ortografia',
 'Assinale a alternativa em que o uso de "por que", "porque", "por quê" e "porquê" está correto:',
 '["Ninguém entendeu por que a reunião foi cancelada de repente.","Ele chegou atrasado porquê o trânsito estava intenso.","Qual é o porque dessa decisão tão repentina?","A prova foi remarcada, mas ele não disse por que."]', 'A', null, null),

('IFSP', 2022, 'Matemática', 'Operações',
 'Um reservatório de água tem capacidade para 2.400 litros. Uma torneira despeja água nesse reservatório a uma taxa constante de 15 litros por minuto. Partindo do reservatório vazio, quantos minutos serão necessários para enchê-lo completamente?',
 '["120 min","150 min","160 min","180 min"]', 'C', null, null);
