import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Lista fechada de disciplinas — a IA sempre escolhe uma destas, nunca inventa variação
// (ex: "Português", "Portugues" e "Língua Portuguesa" viram sempre "Língua Portuguesa")
const DISCIPLINAS_PERMITIDAS = [
  'Língua Portuguesa', 'Matemática', 'Biologia', 'Física', 'Química',
  'História', 'Geografia', 'Filosofia', 'Sociologia', 'Inglês',
  'Espanhol', 'Artes', 'Educação Física', 'Informática', 'Atualidades',
];

// Assuntos "canônicos" preferidos por disciplina — a IA deve tentar encaixar
// a questão em um destes primeiro, antes de considerar reaproveitar outro já
// existente no banco ou criar um assunto novo. Mantém as listas de estudo
// concentradas em poucos temas amplos, em vez de fragmentadas.
const ASSUNTOS_SUGERIDOS = {
  'Língua Portuguesa': [
    'Interpretação textual', 'Correção textual', 'Denotação e conotação',
    'Expressão linguística', 'Concordância verbal e nominal',
    'Regência verbal e nominal', 'Coesão e coerência textual',
    'Figuras de linguagem', 'Ortografia e acentuação',
    'Classes gramaticais', 'Pontuação', 'Sinônimos e antônimos',
    'Gêneros e tipos textuais',
  ],
};

// Parsing tolerante: tenta JSON normal, depois corta sobras, depois extrai campo por campo
function tentarExtrairJSON(texto) {
  let limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(limpo);
  } catch (e) {
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio !== -1 && fim !== -1 && fim > inicio) {
      try {
        return JSON.parse(limpo.slice(inicio, fim + 1));
      } catch (e2) {
        const extrairCampo = (nome) => {
          const re = new RegExp(`"${nome}"\\s*:\\s*"([^"]*(?:\\\\.[^"]*)*)"`, 'i');
          const m = limpo.match(re);
          return m ? m[1] : '';
        };
        const disciplina = extrairCampo('disciplina');
        const assunto = extrairCampo('assunto');
        const padrao = extrairCampo('padrao');
        const dificuldade = extrairCampo('dificuldade');
        const justificativa = extrairCampo('justificativa');
        const padraoDescricao = extrairCampo('padrao_descricao');
        const padrao_novo = /"padrao_novo"\s*:\s*true/i.test(limpo);

        if (padrao || dificuldade) {
          return { disciplina, assunto, padrao, dificuldade, justificativa, padrao_novo, padrao_descricao: padraoDescricao };
        }
        throw new Error('Não foi possível extrair nenhum campo reconhecível.');
      }
    }
    throw new Error('Resposta sem chaves de JSON.');
  }
}

// Normaliza a disciplina retornada pela IA para bater exatamente com a lista fixa,
// mesmo que ela tenha respondido com grafia/variação ligeiramente diferente
function normalizarDisciplina(valor) {
  if (!valor) return valor;
  const alvo = valor.trim().toLowerCase();
  const encontrada = DISCIPLINAS_PERMITIDAS.find(d => d.toLowerCase() === alvo);
  if (encontrada) return encontrada;
  // Casos comuns de variação
  if (/^portugu/.test(alvo) || alvo.includes('portugues')) return 'Língua Portuguesa';
  if (/^ingl/.test(alvo)) return 'Inglês';
  if (/^espanh/.test(alvo)) return 'Espanhol';
  if (/^matem/.test(alvo)) return 'Matemática';
  return valor;
}

export async function POST(request) {
  try {
    const { enunciado, opcoes, disciplina, assunto } = await request.json();
    if (!enunciado) return Response.json({ error: 'enunciado obrigatório' }, { status: 400 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ disciplina: '', assunto: '', padrao: '', dificuldade: '', justificativa: 'IA não configurada.', correta: '' });
    }

    const disciplinaNormalizada = normalizarDisciplina(disciplina);

    // Busca padrões já existentes — biblioteca compartilhada entre institutos
    const { data: padroesExistentes } = await supabaseAdmin
      .from('padroes')
      .select('nome')
      .order('nome')
      .limit(30);
    const listaPadroes = (padroesExistentes || []).map(p => p.nome).join(', ');

    // Busca assuntos já cadastrados nessa disciplina, para a IA priorizar reaproveitar
    // em vez de criar um assunto hiperespecífico e exclusivo pra cada questão
    let assuntosExistentes = [];
    if (disciplinaNormalizada) {
      const { data } = await supabaseAdmin
        .from('questoes')
        .select('assunto')
        .eq('disciplina', disciplinaNormalizada)
        .not('assunto', 'is', null)
        .limit(500);
      assuntosExistentes = [...new Set((data || []).map(a => a.assunto).filter(Boolean))].slice(0, 40);
    }
    const assuntosCanonicos = ASSUNTOS_SUGERIDOS[disciplinaNormalizada] || [];
    const listaAssuntos = [...new Set([...assuntosCanonicos, ...assuntosExistentes])].join(', ');

    const SYSTEM = `Você é um especialista em questões de vestibular de Institutos Federais do Brasil.

Analise a questão abaixo e determine:

1. DISCIPLINA — escolha EXATAMENTE uma destas opções (sem variações de grafia, sem sinônimos):
${DISCIPLINAS_PERMITIDAS.join(', ')}
Mesmo que a disciplina informada no texto venha escrita diferente (ex: "Português", "Portugues"), normalize para o nome correto da lista acima (ex: "Língua Portuguesa").

2. ASSUNTO — o tema específico dentro da disciplina. Esta é uma regra CRÍTICA: você DEVE tentar encaixar a questão em um destes assuntos já usados (nessa ordem de preferência): ${listaAssuntos || '(nenhum ainda, crie um nome amplo e reutilizável)'}.
Só crie um assunto novo se a questão REALMENTE não se encaixar em nenhum desses — o que deve ser raro. Ao criar um assunto novo, use um nome AMPLO e REUTILIZÁVEL (ex: "Interpretação textual", "Concordância verbal") — NUNCA uma descrição longa e específica de uma única questão (ex: NUNCA "Ambiguidade lexical em texto humorístico sobre viagens"; nesse caso o assunto correto seria "Interpretação textual" ou "Figuras de linguagem"). O objetivo é que dezenas de questões diferentes compartilhem o mesmo assunto, formando listas de estudo robustas — evite a todo custo criar um assunto exclusivo para uma questão só.

3. PADRÃO — o tipo/formato da questão. Prefira reutilizar um destes já existentes: ${listaPadroes || '(nenhum ainda, pode criar o primeiro)'}. Só crie um novo nome se a questão realmente não se encaixar em nenhum.

4. DIFICULDADE — "Fácil" (resposta direta), "Médio" (2-3 passos de raciocínio) ou "Difícil" (múltiplos conceitos / alta abstração).

Responda APENAS com JSON válido, sem markdown, sem texto antes ou depois. Formato exato:
{"disciplina":"...","assunto":"...","padrao":"...","padrao_novo":true,"padrao_descricao":"...","dificuldade":"Fácil","justificativa":"..."}`;

    const letras = ['A', 'B', 'C', 'D', 'E'];
    const userMsg = `Disciplina informada: ${disciplina || '(não informada, sugira)'}
Assunto informado: ${assunto || '(não informado, sugira)'}
Enunciado: ${enunciado}
Alternativas: ${Array.isArray(opcoes) ? opcoes.map((o, i) => `${letras[i]}) ${o}`).join(' | ') : opcoes}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return Response.json({ error: `Erro na API da Anthropic (status ${res.status}): ${errBody.slice(0, 300)}` }, { status: 500 });
    }

    const data = await res.json();
    const texto = data?.content?.[0]?.text;

    if (!texto) {
      return Response.json({ error: 'A IA não retornou conteúdo.', debug: JSON.stringify(data).slice(0, 400) }, { status: 500 });
    }

    let resultado;
    try {
      resultado = tentarExtrairJSON(texto);
    } catch (parseError) {
      return Response.json({ error: 'Não foi possível interpretar a resposta da IA: ' + parseError.message, debug: texto.slice(0, 300) }, { status: 500 });
    }

    // Garante que a disciplina final também está normalizada, mesmo se a IA "escorregar"
    if (resultado.disciplina) {
      resultado.disciplina = normalizarDisciplina(resultado.disciplina);
    }

    // Salva padrão novo na biblioteca, se for o caso
    if (resultado.padrao_novo && resultado.padrao) {
      try {
        await supabaseAdmin.from('padroes').insert({
          nome: resultado.padrao,
          descricao: resultado.padrao_descricao || '',
          exemplo: enunciado.slice(0, 300),
        });
      } catch (e) { /* ignora duplicado */ }
    }

    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: 'Erro inesperado: ' + e.message }, { status: 500 });
  }
}
