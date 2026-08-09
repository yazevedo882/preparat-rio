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

// Assuntos FECHADOS por disciplina — quando a disciplina tem uma lista aqui, a IA é
// obrigada a escolher um destes (nunca cria um novo), mantendo no máximo ~10 assuntos
// por disciplina e listas de estudo bem preenchidas. Nuances mais específicas (ex: tipo
// de conjunção, uso de S/C/Ç/X) vão para o campo PADRÃO em vez de virarem assunto novo.
const ASSUNTOS_FECHADOS = {
  'Língua Portuguesa': [
    'Interpretação textual',
    'Correção textual',
    'Denotação e conotação',
    'Expressão linguística',
    'Concordância verbal e nominal',
    'Ortografia e acentuação',
    'Figuras de linguagem',
    'Coesão e coerência textual',
    'Pontuação',
    'Classes gramaticais',
  ],
};

// Tenta encaixar um assunto retornado pela IA na lista fechada da disciplina,
// via correspondência por palavras-chave, como rede de segurança caso a IA fuja da lista
function normalizarAssunto(valor, disciplina) {
  const fechados = ASSUNTOS_FECHADOS[disciplina];
  if (!fechados || !valor) return valor;
  const alvo = valor.trim().toLowerCase();
  const exato = fechados.find(a => a.toLowerCase() === alvo);
  if (exato) return exato;
  const regras = [
    [/concord/, 'Concordância verbal e nominal'],
    [/reg[êe]nc/, 'Concordância verbal e nominal'],
    [/ortograf|acentua|[sc]edilha|uso de s|uso de c/, 'Ortografia e acentuação'],
    [/pontua/, 'Pontuação'],
    [/classe gramatical|substantivo|adjetivo|\bverbo\b|adv[eé]rbio|pronome|conjun[cç][aã]o|conjun[cç][oõ]es|preposi[cç]/, 'Classes gramaticais'],
    [/figura|met[aá]fora|ironia|hip[eé]rbole|met[oó]nimia/, 'Figuras de linguagem'],
    [/coes|coer[eê]n/, 'Coesão e coerência textual'],
    [/denota|conota|sentido literal|sentido figurado/, 'Denotação e conotação'],
    [/corre[cç][aã]o|reescrit|norma culta|erro gramatical/, 'Correção textual'],
    [/interpret|compreens[aã]o|ideia central|tema central|g[êe]nero textual|tipo textual/, 'Interpretação textual'],
  ];
  for (const [re, canonico] of regras) {
    if (re.test(alvo)) return canonico;
  }
  return 'Interpretação textual'; // fallback mais abrangente, evita perder a questão
}

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
    // (só usado quando a disciplina NÃO tem uma lista fechada definida acima)
    let assuntosExistentes = [];
    if (disciplinaNormalizada && !ASSUNTOS_FECHADOS[disciplinaNormalizada]) {
      const { data } = await supabaseAdmin
        .from('questoes')
        .select('assunto')
        .eq('disciplina', disciplinaNormalizada)
        .not('assunto', 'is', null)
        .limit(500);
      assuntosExistentes = [...new Set((data || []).map(a => a.assunto).filter(Boolean))].slice(0, 40);
    }

    const assuntosFechados = ASSUNTOS_FECHADOS[disciplinaNormalizada];
    const instrucaoAssunto = assuntosFechados
      ? `2. ASSUNTO — esta é uma regra RÍGIDA e OBRIGATÓRIA: escolha EXATAMENTE um destes ${assuntosFechados.length} assuntos, nunca crie um novo, nunca escreva variação de nome:
${assuntosFechados.join(', ')}
Se a questão tiver uma nuance mais específica que não cabe em nenhum nome acima (ex: um tipo específico de conjunção, uso de S/C/Ç/X, um verbo irregular específico), NÃO crie um assunto novo para isso — em vez disso, descreva essa nuance específica no campo PADRÃO (item 3 abaixo). O campo ASSUNTO deve ficar sempre restrito a esses ${assuntosFechados.length} valores, para que cada assunto acumule muitas questões.`
      : `2. ASSUNTO — o tema específico dentro da disciplina. Priorize reaproveitar um destes assuntos já cadastrados: ${assuntosExistentes.join(', ') || '(nenhum ainda, crie um nome amplo e reutilizável)'}. Só crie um assunto novo se a questão realmente não se encaixar em nenhum. Use nomes AMPLOS e REUTILIZÁVEIS, nunca uma descrição específica de uma única questão.`;

    const SYSTEM = `Você é um especialista em questões de vestibular de Institutos Federais do Brasil.

Analise a questão abaixo e determine:

1. DISCIPLINA — escolha EXATAMENTE uma destas opções (sem variações de grafia, sem sinônimos):
${DISCIPLINAS_PERMITIDAS.join(', ')}
Mesmo que a disciplina informada no texto venha escrita diferente (ex: "Português", "Portugues"), normalize para o nome correto da lista acima (ex: "Língua Portuguesa").

${instrucaoAssunto}

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
    // Garante que o assunto respeita a lista fechada da disciplina, se houver uma definida
    if (resultado.assunto && resultado.disciplina) {
      resultado.assunto = normalizarAssunto(resultado.assunto, resultado.disciplina);
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
