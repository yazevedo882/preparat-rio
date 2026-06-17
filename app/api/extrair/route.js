export async function POST(request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return Response.json({ error: 'IA não configurada.' }, { status: 500 });
    }

    const contentType = request.headers.get('content-type') || '';
    let textoProva = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      textoProva = formData.get('texto') || '';
      // Nota: Groq não suporta imagens ainda, só texto
      if (!textoProva) {
        return Response.json({ error: 'O Groq aceita apenas texto por enquanto. Cole o texto da prova.' }, { status: 400 });
      }
    } else {
      const body = await request.json();
      textoProva = body.texto || '';
    }

    const prompt = `Extraia TODAS as questões desta prova de Instituto Federal e retorne APENAS um JSON sem markdown:
{
  "questoes": [
    {
      "numero": 1,
      "enunciado": "texto completo do enunciado",
      "opcoes": ["texto A", "texto B", "texto C", "texto D"],
      "numOpcoes": 4
    }
  ],
  "instituto": "ex: IFSP ou null",
  "ano": 2024,
  "disciplina": null
}

REGRAS: enunciado completo, opções sem a letra, numOpcoes = 4 ou 5.

Texto da prova:
${textoProva}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        max_tokens: 8000,
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
