import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
        const padraoMatch = limpo.match(/"padrao"\s*:\s*"([^"]*)"/);
        const assuntoMatch = limpo.match(/"assunto"\s*:\s*"([^"]*)"/);
        const dificuldadeMatch = limpo.match(/"dificuldade"\s*:\s*"([^"]*)"/);
        const justMatch = limpo.match(/"justificativa"\s*:\s*"([^"]*)/);
        const novoMatch = limpo.match(/"padrao_novo"\s*:\s*(true|false)/);
        if (padraoMatch || dificuldadeMatch) {
          return {
            padrao: padraoMatch?.[1] || '',
            assunto: assuntoMatch?.[1] || '',
            dificuldade: dificuldadeMatch?.[1] || '',
            justificativa: justMatch?.[1] || '',
            padrao_novo: novoMatch?.[1] === 'true',
          };
        }
        throw new Error('JSON malformado: ' + e2.message);
      }
    }
    throw new Error('Resposta sem JSON válido: ' + e.message);
  }
}

export async function POST(request) {
  try {
    const { enunciado, opcoes, disciplina, assunto } = await request.json();
    if (!enunciado) return Response.json({ error: 'enunciado obrigatório' }, { status: 400 });

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ padrao: '', assunto: '', dificuldade: '', justificativa: 'IA não configurada.' });
    }

    // Busca os padrões já existentes no banco — biblioteca compartilhada entre todos os institutos
    const { data: padroesExistentes } = await supabaseAdmin
      .from('padroes')
      .select('nome, descricao, exemplo')
      .order('nome');

    const listaPadroes = (padroesExistentes || [])
      .map(p => `"${p.nome}" — ${p.descricao || ''}${p.exemplo ? `\n  Ex: ${p.exemplo}` : ''}`)
      .join('\n');

    const SYSTEM = `Você é um classificador de questões de vestibular de Instituto Federal.

Sua tarefa tem 3 partes:
1. Sugerir o ASSUNTO da questão (ex: "Frações", "Interpretação textual", "Conjunções") com base na disciplina e no enunciado.
2. Classificar a questão em um PADRÃO. Você tem uma lista de padrões já usados — tente encaixar a questão em um deles. Só crie um padrão novo se a questão realmente não se encaixar em nenhum dos existentes.
3. Classificar a DIFICULDADE: "Fácil" (resposta direta), "Médio" (2-3 passos de raciocínio), "Difícil" (múltiplos conceitos ou abstração).

PADRÕES JÁ EXISTENTES NO BANCO:
${listaPadroes || '(nenhum ainda — você pode criar o primeiro)'}

Retorne APENAS um JSON válido (sem markdown, sem texto antes ou depois):
{
  "assunto": "assunto sugerido, curto",
  "padrao": "nome exato de um padrão da lista acima, OU um nome novo se necessário",
  "padrao_novo": true ou false (true só se o padrão não estava na lista acima),
  "padrao_descricao": "se padrao_novo=true, uma descrição curta do novo padrão; senão, string vazia",
  "dificuldade": "Fácil" ou "Médio" ou "Difícil",
  "justificativa": "frase curta de até 15 palavras, sem aspas internas"
}`;

    const userMsg = `Disciplina: ${disciplina || '—'}\nAssunto informado pelo professor: ${assunto || '(não informado, sugira um)'}\nEnunciado: ${enunciado}\nAlternativas: ${Array.isArray(opcoes) ? opcoes.map((o, i) => `${String.fromCharCode(65+i)}) ${o}`).join(' | ') : opcoes}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SYSTEM + '\n\n' + userMsg }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      return Response.json({ error: `Erro na API do Gemini (status ${res.status}): ${errBody.slice(0, 300)}` }, { status: 500 });
    }

    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      return Response.json({ error: 'A IA não retornou conteúdo.', debug: JSON.stringify(data).slice(0, 400) }, { status: 500 });
    }

    let resultado;
    try {
      resultado = tentarExtrairJSON(texto);
    } catch (parseError) {
      return Response.json({ error: 'Não foi possível interpretar a resposta da IA: ' + parseError.message, debug: texto.slice(0, 300) }, { status: 500 });
    }

    // Se a IA decidiu criar um padrão novo, salva na biblioteca para uso futuro
    if (resultado.padrao_novo && resultado.padrao) {
      await supabaseAdmin
        .from('padroes')
        .insert({
          nome: resultado.padrao,
          descricao: resultado.padrao_descricao || '',
          exemplo: enunciado.slice(0, 300),
        })
        .select()
        .then(() => {}, () => {}); // ignora erro de duplicado (nome único)
    }

    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: 'Erro inesperado: ' + e.message }, { status: 500 });
  }
}
