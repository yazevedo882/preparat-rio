const PADROES = {
  contexto_cotidiano: { label: 'Contextualização cotidiana', exemplo: 'Uma fábrica produziu 1.248 peças e distribuiu em 8 caixas. Quantas peças por caixa?' },
  leitura_grafico: { label: 'Leitura de gráfico/tabela', exemplo: 'De acordo com o gráfico abaixo, em qual ano houve maior crescimento?' },
  julgamento_itens: { label: 'Julgamento de itens (I, II, III)', exemplo: 'Analise as afirmativas: I) ... II) ... III) ... Estão corretas apenas:' },
  texto_apoio: { label: 'Texto de apoio + interpretação', exemplo: 'Leia o texto a seguir e responda: o autor defende que...' },
  classificacao_comparacao: { label: 'Classificação / comparação', exemplo: 'Assinale a alternativa que classifica corretamente os seres vivos abaixo em seus reinos.' },
  teoria_aplicacao: { label: 'Teoria + aplicação direta', exemplo: 'A palavra "Apesar" estabelece relação de:' },
};

const SYSTEM = `Você é um classificador de questões de vestibular de Instituto Federal.
Retorne APENAS um JSON válido (sem markdown, sem texto antes ou depois):
{ "padrao": "...", "dificuldade": "Fácil"|"Médio"|"Difícil", "justificativa": "frase curta de até 15 palavras" }

PADRÕES:
${Object.entries(PADROES).map(([k, v]) => `"${k}" — ${v.label}\n  Ex: ${v.exemplo}`).join('\n')}

DIFICULDADE: Fácil=direto, Médio=2-3 passos, Difícil=múltiplos conceitos.
A justificativa deve ser curta e direta, sem aspas internas, para garantir um JSON válido.`;

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
        // Última tentativa: extrair campos com regex, tolerante a JSON quebrado
        const padraoMatch = limpo.match(/"padrao"\s*:\s*"([^"]*)"/);
        const dificuldadeMatch = limpo.match(/"dificuldade"\s*:\s*"([^"]*)"/);
        const justMatch = limpo.match(/"justificativa"\s*:\s*"([^"]*)/);
        if (padraoMatch || dificuldadeMatch) {
          return {
            padrao: padraoMatch?.[1] || '',
            dificuldade: dificuldadeMatch?.[1] || '',
            justificativa: justMatch?.[1] || '',
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
      return Response.json({ padrao: '', dificuldade: '', justificativa: 'IA não configurada.' });
    }

    const userMsg = `Disciplina: ${disciplina || '—'}\nAssunto: ${assunto || '—'}\nEnunciado: ${enunciado}\nAlternativas: ${Array.isArray(opcoes) ? opcoes.map((o, i) => `${String.fromCharCode(65+i)}) ${o}`).join(' | ') : opcoes}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SYSTEM + '\n\n' + userMsg }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
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

    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: 'Erro inesperado: ' + e.message }, { status: 500 });
  }
}
