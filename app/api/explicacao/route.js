const LETRAS = ['A', 'B', 'C', 'D'];

export async function POST(request) {
  try {
    const { enunciado, opcoes, correta, disciplina, assunto } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({
        explicacao:
          'Explicação automática não está configurada neste site. Cadastre a explicação manualmente ao criar a questão, ou configure a chave ANTHROPIC_API_KEY.',
      });
    }

    const prompt = `Questão de prova de Instituto Federal (${disciplina}, assunto: ${assunto}):\n"${enunciado}"\nAlternativas: ${opcoes
      .map((o, i) => `${LETRAS[i]}) ${o}`)
      .join(' | ')}\nA alternativa correta é ${correta}.\nExplique em até 60 palavras, em português, de forma direta e didática, por que essa é a resposta correta.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await resp.json();
    const texto = data?.content?.find((c) => c.type === 'text')?.text;

    return Response.json({
      explicacao: texto || 'Não foi possível gerar a explicação agora.',
    });
  } catch (e) {
    return Response.json(
      { explicacao: 'Não foi possível gerar a explicação agora. Tente novamente.' },
      { status: 200 }
    );
  }
}
