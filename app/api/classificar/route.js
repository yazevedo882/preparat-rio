import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Parsing tolerante: tenta JSON normal, depois corta sobras, depois extrai campo por campo com regex
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
        // Fallback final: extrai campo por campo via regex, tolerante a aspas internas quebradas
        const extrairCampo = (nome) => {
          const re = new RegExp(`"${nome}"\\s*:\\s*"([^"]*(?:\\\\.[^"]*)*)"`, 'i');
          const m = limpo.match(re);
          return m ? m[1] : '';
        };
        const padrao = extrairCampo('padrao');
        const assunto = extrairCampo('assunto');
        const dificuldade = extrairCampo('dificuldade');
        const justificativa = extrairCampo('justificativa');
        const padraoDescricao = extrairCampo('padrao_descricao');
        const padrao_novo = /"padrao_novo"\s*:\s*true/i.test(limpo);

        if (padrao || dificuldade) {
          return { padrao, assunto, dificuldade, justificativa, padrao_novo, padrao_descricao: padraoDescricao };
        }
        throw new Error('Não foi possível extrair nenhum campo reconhecível.');
      }
    }
    throw new Error('Resposta sem chaves de JSON.');
  }
}

export async function POST(request) {
  try {
    const { enunciado, opcoes, disciplina, assunto } = await request.json();
    if (!enunciado) return Response.json({ error: 'enunciado obrigatório' }, { status: 400 });

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ padrao: '', assunto: '', dificuldade: '', justificativa: 'IA não configurada.' });
    }

    // Busca padrões já existentes — biblioteca compartilhada entre institutos
    const { data: padroesExistentes } = await supabaseAdmin
      .from('padroes')
      .select('nome')
      .order('nome')
      .limit(30);

    const listaPadroes = (padroesExistentes || []).map(p => p.nome).join(', ');

    // Prompt mais simples e direto, pedindo explicitamente para evitar aspas internas
    const SYSTEM = `Classifique esta questão de vestibular de Instituto Federal.

Padrões já existentes (prefira reutilizar um destes): ${listaPadroes || '(nenhum ainda)'}

Responda APENAS com este JSON, em uma única linha, sem markdown, sem quebras de linha dentro dos valores, e NUNCA use aspas duplas dentro dos textos (use aspas simples se precisar citar algo):

{"assunto":"assunto curto sugerido","padrao":"nome do padrão (existente ou novo)","padrao_novo":true ou false,"padrao_descricao":"descrição curta se for novo, senão vazio","dificuldade":"Fácil ou Médio ou Difícil","justificativa":"frase curta de até 12 palavras"}`;

    const userMsg = `Disciplina: ${disciplina || '—'}\nAssunto informado: ${assunto || '(sugira um)'}\nEnunciado: ${enunciado}\nAlternativas: ${Array.isArray(opcoes) ? opcoes.map((o, i) => `${String.fromCharCode(65+i)}) ${o}`).join(' | ') : opcoes}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SYSTEM + '\n\n' + userMsg }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                assunto: { type: 'STRING' },
                padrao: { type: 'STRING' },
                padrao_novo: { type: 'BOOLEAN' },
                padrao_descricao: { type: 'STRING' },
                dificuldade: { type: 'STRING' },
                justificativa: { type: 'STRING' },
              },
              required: ['padrao', 'dificuldade', 'justificativa'],
            },
          },
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
