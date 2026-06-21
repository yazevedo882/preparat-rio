const SYSTEM_PROMPT = `Você é um assistente especializado em extrair questões de provas de Institutos Federais do Brasil.
Extraia TODAS as questões e retorne APENAS um JSON (sem markdown):
{
  "questoes": [
    {
      "numero": 1,
      "enunciado": "texto completo do enunciado",
      "opcoes": ["texto da A", "texto da B", "texto da C", "texto da D"],
      "numOpcoes": 4
    }
  ],
  "instituto": "ex: IFSP ou null",
  "ano": 2024,
  "disciplina": null
}
REGRAS: extraia o enunciado completo, opções sem a letra, numOpcoes pode ser 4 ou 5. Retorne APENAS o JSON.`;

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: 'IA não configurada.' }, { status: 500 });
    }

    const contentType = request.headers.get('content-type') || '';
    let parts;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const imagem = formData.get('imagem');

      if (imagem && imagem.size > 0) {
        const bytes = await imagem.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        const mediaType = imagem.type || 'image/jpeg';
        parts = [
          { inline_data: { mime_type: mediaType, data: base64 } },
          { text: 'Extraia todas as questões desta prova de Instituto Federal. ' + SYSTEM_PROMPT },
        ];
      } else {
        const texto = formData.get('texto') || '';
        parts = [{ text: SYSTEM_PROMPT + '\n\nTexto da prova:\n' + texto }];
      }
    } else {
      const body = await request.json();
      parts = [{ text: SYSTEM_PROMPT + '\n\nTexto da prova:\n' + (body.texto || '') }];
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 8000, temperature: 0.1 },
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
