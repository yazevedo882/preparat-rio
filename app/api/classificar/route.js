const PADROES = {
  contexto_cotidiano: 'Contextualização cotidiana — Ex: Uma fábrica produziu 1.248 peças...',
  leitura_grafico: 'Leitura de gráfico/tabela — Ex: De acordo com o gráfico, em qual ano...',
  julgamento_itens: 'Julgamento de itens I/II/III — Ex: Estão corretas apenas:',
  texto_apoio: 'Texto de apoio + interpretação — Ex: Leia o texto e responda...',
  classificacao_comparacao: 'Classificação/comparação — Ex: Assinale a alternativa que classifica...',
  teoria_aplicacao: 'Teoria + aplicação direta — Ex: A palavra "Apesar" estabelece relação de:',
};

export async function POST(request) {
  try {
    const { enunciado, opcoes, disciplina, assunto } = await request.json();
    if (!enunciado) return Response.json({ error: 'enunciado obrigatório' }, { status: 400 });

    if (!process.env.GROQ_API_KEY) {
      return Response.json({ padrao: '', dificuldade: '', justificativa: 'IA não configurada.' });
    }

    const prompt = `Classifique esta questão de vestibular de Instituto Federal.
Disciplina: ${disciplina || '—'} | Assunto: ${assunto || '—'}
Enunciado: ${enunciado}
Alternativas: ${Array.isArray(opcoes) ? opcoes.map((o, i) => `${String.fromCharCode(65+i)}) ${o}`).join(' | ') : ''}

PADRÕES possíveis:
${Object.entries(PADROES).map(([k, v]) => `"${k}" — ${v}`).join('\n')}

DIFICULDADE: "Fácil" (resposta direta), "Médio" (2-3 passos), "Difícil" (múltiplos conceitos)

Retorne APENAS um JSON sem markdown:
{"padrao": "...", "dificuldade": "...", "justificativa": "frase curta"}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 256,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const texto = data?.choices?.[0]?.message?.content || '{}';
    const clean = texto.replace(/```json|```/g, '').trim();
    const resultado = JSON.parse(clean);
    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
