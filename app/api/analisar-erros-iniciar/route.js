import { createClient } from '@supabase/supabase-js';
import { jsonrepair } from 'jsonrepair';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BUCKET = 'provas-temp';
const MODELO = 'claude-sonnet-4-6';

// Categorias fixas: assim dá pra contar e agregar em código, sem depender do "achismo" do modelo.
const PEGADINHAS = [
  'negacao_excecao',        // "exceto", "incorreta", "não é"
  'absolutos',              // "sempre", "nunca", "somente", "todos"
  'termos_parecidos',       // nomes/estruturas/conceitos semelhantes trocados
  'localizacao_lateralidade', // direita/esquerda, proximal/distal, anterior/posterior
  'alternativa_parcial',    // parte certa, parte errada
  'interpretacao_imagem',   // esquema, lâmina, corte, radiografia
  'inversao_causa_efeito',
  'excesso_de_detalhe',     // distrator com dado correto mas que não responde à pergunta
  'outra',
];
const CAUSAS = ['lacuna_conteudo', 'confusao_conceitos', 'falha_leitura_atencao', 'chute_ou_incerteza', 'raciocinio_incompleto'];
const BLOOM = ['lembrar', 'compreender', 'aplicar', 'analisar'];

const SYSTEM_CLASSIFICACAO = `Você é um tutor de Medicina e especialista em análise de erros (pedagogia da avaliação). Você recebe o PDF de uma prova de graduação em Medicina. A disciplina/módulo NÃO é informado: identifique você mesmo a área e o tema de cada questão. O gabarito oficial e as alternativas marcadas pelo estudante podem estar NO PRÓPRIO PDF da prova (ex: alternativa circulada/marcada, correção com certo/errado, folha de respostas ou gabarito ao final) ou em arquivos/textos separados; procure nos dois lugares.

Tarefa: comparar, questão por questão, a resposta marcada com o gabarito e classificar CADA ERRO. Para acertos, apenas registre número, tema e nível.

Retorne APENAS JSON válido (sem markdown), no formato:
{
  "questoes": [
    {
      "numero": 1,
      "tema": "tema curto e específico (ex: plexo braquial, epitélio de revestimento)",
      "area": "ex: anatomia, histologia, embriologia, fisiologia, semiologia...",
      "marcada": "B",
      "correta": "D",
      "acertou": false,
      "nivel_bloom": "lembrar|compreender|aplicar|analisar",
      "pegadinha": "uma de: ${PEGADINHAS.join(', ')} (ou null se acertou)",
      "causa_provavel": "uma de: ${CAUSAS.join(', ')} (ou null se acertou)",
      "por_que_errou": "1-2 frases: o que a alternativa marcada sugere que o estudante confundiu",
      "o_que_revisar": "1 frase objetiva"
    }
  ]
}

REGRAS:
- Use SOMENTE os valores permitidos em pegadinha, causa_provavel e nivel_bloom.
- causa_provavel é uma hipótese a partir do padrão da alternativa marcada; seja honesto, use chute_ou_incerteza quando não der para inferir.
- Se o gabarito ou as respostas marcadas de alguma questão não estiverem disponíveis, use null em marcada/correta/acertou e não classifique o erro.
- Escape corretamente aspas duplas e quebras de linha dentro das strings.
- Processe TODAS as questões até o fim.`;

function extrairJSON(texto) {
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(limpo); } catch (e) {
    try { return JSON.parse(jsonrepair(limpo)); } catch (e2) {
      const i = limpo.indexOf('{'), f = limpo.lastIndexOf('}');
      if (i !== -1 && f > i) return JSON.parse(jsonrepair(limpo.slice(i, f + 1)));
      throw new Error('JSON inválido na resposta da IA');
    }
  }
}

async function baixarComoBase64(path) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Falha ao baixar ${path}: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return { base64: buffer.toString('base64'), mimeType: data.type || 'application/octet-stream' };
}

async function chamarClaude({ system, content, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`API Anthropic (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const texto = data?.content?.find(b => b.type === 'text')?.text;
  if (!texto) throw new Error('A IA não retornou conteúdo.');
  return { texto, stopReason: data.stop_reason };
}

function contar(lista, chave) {
  const m = {};
  for (const q of lista) if (q[chave]) m[q[chave]] = (m[q[chave]] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }));
}

// Agregação feita em código (números confiáveis), não pelo modelo.
function agregar(questoes) {
  const avaliadas = questoes.filter(q => q.acertou !== null && q.acertou !== undefined);
  const erros = avaliadas.filter(q => q.acertou === false);
  const porArea = {};
  for (const q of avaliadas) {
    const a = q.area || 'sem área';
    porArea[a] = porArea[a] || { area: a, total: 0, erros: 0 };
    porArea[a].total++;
    if (!q.acertou) porArea[a].erros++;
  }
  const porTema = {};
  for (const q of erros) {
    const t = q.tema || 'sem tema';
    porTema[t] = (porTema[t] || 0) + 1;
  }
  return {
    total: avaliadas.length,
    acertos: avaliadas.length - erros.length,
    erros: erros.length,
    por_area: Object.values(porArea).map(a => ({ ...a, taxa_erro: a.total ? +(a.erros / a.total).toFixed(2) : 0 }))
      .sort((a, b) => b.taxa_erro - a.taxa_erro),
    temas_com_mais_erro: Object.entries(porTema).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tema, qtd]) => ({ tema, qtd })),
    por_pegadinha: contar(erros, 'pegadinha'),
    por_causa: contar(erros, 'causa_provavel'),
    por_bloom: contar(erros, 'nivel_bloom'),
  };
}

const SYSTEM_RELATORIO = `Você é um tutor de Medicina com formação em pedagogia. Recebe as estatísticas de erro de UMA prova de um estudante e a lista dos erros classificados. Escreva um relatório em português (a disciplina foi identificada automaticamente a partir das questões), direto e acolhedor, em Markdown, com estas seções:

## Diagnóstico geral
## Onde você mais erra (por área e tema)
## Pegadinhas em que você cai
## Erro de conteúdo ou de leitura?
## Plano de estudo (prioridades, com técnicas: prática de recuperação, revisão espaçada, flashcards, desenhar/rotular estruturas, refazer questões erradas)

Regras: use APENAS os números fornecidos, não invente estatísticas. Se a amostra for pequena (poucos erros), diga que os padrões são indicativos, não conclusivos. Não use linguagem alarmista nem diagnostique nada sobre a pessoa; fale só de desempenho na prova.`;

async function processar(jobId, body) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada no Vercel.');
    const { arquivos = [], gabaritoTexto, respostasTexto } = body;
    if (!arquivos.length) throw new Error('Envie ao menos o PDF ou as fotos da prova.');

    const content = [];
    for (const a of arquivos) {
      const { base64, mimeType } = await baixarComoBase64(a.path);
      const rotulo = { prova: 'PROVA', gabarito: 'GABARITO OFICIAL', minhas_respostas: 'O QUE O ESTUDANTE MARCOU' }[a.papel] || 'ARQUIVO';
      content.push({ type: 'text', text: `A seguir: ${rotulo}` });
      if (mimeType.includes('pdf') || a.path.toLowerCase().endsWith('.pdf')) {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
      } else {
        content.push({ type: 'image', source: { type: 'base64', media_type: mimeType.startsWith('image/') ? mimeType : 'image/jpeg', data: base64 } });
      }
    }
    if (gabaritoTexto?.trim()) content.push({ type: 'text', text: `GABARITO OFICIAL (texto, na ordem das questões): ${gabaritoTexto}` });
    if (respostasTexto?.trim()) content.push({ type: 'text', text: `O QUE O ESTUDANTE MARCOU (texto, na ordem das questões): ${respostasTexto}` });
    content.push({ type: 'text', text: `Classifique todas as questões conforme as instruções.` });

    // Etapa 1: classificação estruturada (JSON)
    const r1 = await chamarClaude({ system: SYSTEM_CLASSIFICACAO, content, maxTokens: 32000 });
    let parsed;
    try { parsed = extrairJSON(r1.texto); } catch (e) {
      throw new Error('Não consegui interpretar a resposta da IA.' + (r1.stopReason === 'max_tokens' ? ' A resposta foi cortada: envie menos questões por vez.' : ''));
    }
    const questoes = parsed.questoes || [];
    if (!questoes.length) throw new Error('Nenhuma questão identificada. Confira se a prova está legível.');

    // Etapa 2: agregação em código + relatório narrativo
    const estatisticas = agregar(questoes);
    if (estatisticas.total === 0) throw new Error('Não encontrei, no PDF, o gabarito nem as alternativas que você marcou. Abra "Adicionar gabarito / minhas respostas" e envie o que faltar.');

    const erros = questoes.filter(q => q.acertou === false);
    const r2 = await chamarClaude({
      system: SYSTEM_RELATORIO,
      content: [{ type: 'text', text: `ESTATÍSTICAS:\n${JSON.stringify(estatisticas)}\n\nERROS CLASSIFICADOS:\n${JSON.stringify(erros)}` }],
      maxTokens: 6000,
    });

    await supabaseAdmin.from('extracoes').update({
      status: 'concluido',
      resultado: { tipo: 'analise_erros', estatisticas, questoes, relatorio: r2.texto },
    }).eq('id', jobId);
  } catch (e) {
    await supabaseAdmin.from('extracoes').update({ status: 'erro', erro: e.message }).eq('id', jobId);
  } finally {
    // apaga os arquivos da prova do Storage (best-effort)
    try {
      const paths = (body.arquivos || []).map(a => a.path);
      if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
    } catch (e) { /* ignora */ }
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { data: job, error } = await supabaseAdmin.from('extracoes').insert({ status: 'processando' }).select('id').single();
    if (error) throw new Error(error.message);
    waitUntil(processar(job.id, body));
    return Response.json({ id: job.id });
  } catch (e) {
    return Response.json({ error: 'Erro ao iniciar análise: ' + e.message }, { status: 500 });
  }
}
