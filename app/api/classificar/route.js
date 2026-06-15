import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PADROES = {
  contexto_cotidiano: { label: 'Contextualização cotidiana', exemplo: 'Uma fábrica produziu 1.248 peças e distribuiu em 8 caixas. Quantas peças por caixa?' },
  leitura_grafico: { label: 'Leitura de gráfico/tabela', exemplo: 'De acordo com o gráfico abaixo, em qual ano houve maior crescimento?' },
  julgamento_itens: { label: 'Julgamento de itens (I, II, III)', exemplo: 'Analise as afirmativas: I) ... II) ... III) ... Estão corretas apenas:' },
  texto_apoio: { label: 'Texto de apoio + interpretação', exemplo: 'Leia o texto a seguir e responda: o autor defende que...' },
  classificacao_comparacao: { label: 'Classificação / comparação', exemplo: 'Assinale a alternativa que classifica corretamente os seres vivos abaixo em seus reinos.' },
  teoria_aplicacao: { label: 'Teoria + aplicação direta', exemplo: '"Apesar da forte chuva, os operários concluíram a obra." A palavra Apesar estabelece relação de:' },
};

const SYSTEM_PROMPT = `Você é um classificador de questões de vestibular de Instituto Federal.
Retorne APENAS um JSON:
{ "padrao": "...", "dificuldade": "Fácil"|"Médio"|"Difícil", "justificativa": "frase curta" }

PADRÕES:
${Object.entries(PADROES).map(([k, v]) => `"${k}" — ${v.label}\n  Ex: ${v.exemplo}`).join('\n')}

DIFICULDADE: Fácil=direto, Médio=2-3 passos, Difícil=múltiplos conceitos.
Responda APENAS o JSON.`;

export async function POST(request) {
  try {
    const { enunciado, opcoes, disciplina, assunto } = await request.json();
    if (!enunciado) return Response.json({ error: 'enunciado obrigatório' }, { status: 400 });

    const userMsg = `Disciplina: ${disciplina || '—'}\nAssunto: ${assunto || '—'}\nEnunciado: ${enunciado}\nAlternativas: ${Array.isArray(opcoes) ? opcoes.map((o, i) => `${String.fromCharCode(65+i)}) ${o}`).join(' | ') : opcoes}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    const resultado = JSON.parse(msg.content[0].text.trim());
    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
