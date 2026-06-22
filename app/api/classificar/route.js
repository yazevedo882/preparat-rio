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

    if (!process.env.ANTHROPIC_API_KEY) {
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
