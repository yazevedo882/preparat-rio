const PADROES = {
  contexto_cotidiano: { label: 'Contextualização cotidiana', exemplo: 'Uma fábrica produziu 1.248 peças e distribuiu em 8 caixas. Quantas peças por caixa?' },
  leitura_grafico: { label: 'Leitura de gráfico/tabela', exemplo: 'De acordo com o gráfico abaixo, em qual ano houve maior crescimento?' },
  julgamento_itens: { label: 'Julgamento de itens (I, II, III)', exemplo: 'Analise as afirmativas: I) ... II) ... III) ... Estão corretas apenas:' },
  texto_apoio: { label: 'Texto de apoio + interpretação', exemplo: 'Leia o texto a seguir e responda: o autor defende que...' },
  classificacao_comparacao: { label: 'Classificação / comparação', exemplo: 'Assinale a alternativa que classifica corretamente os seres vivos abaixo em seus reinos.' },
  teoria_aplicacao: { label: 'Teoria + aplicação direta', exemplo: 'A palavra "Apesar" estabelece relação de:' },
};

const SYSTEM = `Você é um classificador de questões de vestibular de Instituto Federal.
Retorne APENAS um JSON (sem markdown):
{ "padrao": "...", "dificuldade": "Fácil"|"Médio"|"Difícil", "justificativa": "frase curta" }

PADRÕES:
${Object.entries(PADROES).map(([k, v]) => `"${k}" — ${v.label}\n  Ex: ${v.exemplo}`).join('\n')}

DIFICULDADE: Fácil=direto, Médio=2-3 passos, Difícil=múltiplos conceitos.`;

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
          generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
        }),
      }
    );

    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = texto.replace(/```json|```/g, '').trim();
    const resultado = JSON.parse(clean);
    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
