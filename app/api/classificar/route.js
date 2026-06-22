import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

export async function POST(request) {
  try {
    const { enunciado, opcoes, disciplina, assunto } = await request.json();
    if (!enunciado) return Response.json({ error: 'enunciado obrigatório' }, { status: 400 });

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ disciplina: '', assunto: '', padrao: '', dificuldade: '', justificativa: 'IA não configurada.', correta: '' });
    }

    // Busca padrões já existentes — biblioteca compartilhada entre institutos
    const { data: padroesExistentes } = await supabaseAdmin
      .from('padroes')
      .select('nome')
      .order('nome')
      .limit(30);

    const listaPadroes = (padroesExistentes || []).map(p => p.nome).join(', ');

    const SYSTEM = `Você é um especialista em questões de vestibular de Institutos Federais do Brasil.

Analise a questão abaixo e determine:
1. DISCIPLINA — a matéria escolar (ex: Matemática, Língua Portuguesa, Biologia, Física, História). Só sugira se não foi informada.
2. ASSUNTO — o tema específico dentro da disciplina (ex: "Frações", "Interpretação textual", "Genética").
3. PADRÃO — o tipo/formato da questão. Prefira reutilizar um destes já existentes: ${listaPadroes || '(nenhum ainda, pode criar o primeiro)'}. Só crie um novo nome se a questão realmente não se encaixar em nenhum.
4. DIFICULDADE — "Fácil" (resposta direta), "Médio" (2-3 passos de raciocínio) ou "Difícil" (múltiplos conceitos / alta abstração).

Responda APENAS com este JSON, em uma única linha, sem markdown, sem quebras de linha dentro dos valores, e NUNCA use aspas duplas dentro dos textos (use aspas simples se precisar citar algo):

{"disciplina":"disciplina sugerida ou vazio se já informada","assunto":"assunto curto sugerido","padrao":"nome do padrão","padrao_novo":true ou false,"padrao_descricao":"descrição curta se for novo, senão vazio","dificuldade":"Fácil ou Médio ou Difícil","justificativa":"frase curta de até 15 palavras explicando a classificação"}`;

    const letras = ['A', 'B', 'C', 'D', 'E'];
    const userMsg = `Disciplina informada: ${disciplina || '(não informada, sugira)'}\\nAssunto informado: ${assunto || '(não informado, sugira)'}\\nEnunciado: ${enunciado}\\nAlternativas: ${Array.isArray(opcoes) ? opcoes.map((o, i) => `${letras[i]}) ${o}`).join(' | ') : opcoes}`;

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
                disciplina: { type: 'STRING' },
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
