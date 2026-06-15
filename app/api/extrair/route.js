import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair questões de provas de Institutos Federais do Brasil.

Dado um texto de prova (ou transcrição de imagem/PDF), extraia TODAS as questões e retorne APENAS um JSON com o seguinte formato:
{
  "questoes": [
    {
      "numero": 1,
      "enunciado": "texto completo do enunciado",
      "opcoes": ["texto da A", "texto da B", "texto da C", "texto da D"],
      "numOpcoes": 4
    }
  ],
  "instituto": "ex: IFSP (se identificado no texto, senão null)",
  "ano": 2024,
  "disciplina": "ex: Matemática (se identificado, senão null)"
}

REGRAS:
- Extraia o enunciado completo de cada questão
- As opções devem ser só o texto, sem a letra (ex: "156" e não "A) 156")
- numOpcoes pode ser 4 ou 5 dependendo da prova
- Se não conseguir identificar instituto/ano/disciplina, deixe null
- Retorne APENAS o JSON, sem markdown, sem explicação`;

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let userMessage;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const texto = formData.get('texto');
      const imagem = formData.get('imagem');

      if (imagem && imagem.size > 0) {
        const bytes = await imagem.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        const mediaType = imagem.type || 'image/jpeg';

        userMessage = [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: 'Extraia todas as questões desta prova de Instituto Federal.',
          },
        ];
      } else if (texto) {
        userMessage = texto;
      } else {
        return Response.json({ error: 'Nenhum conteúdo enviado' }, { status: 400 });
      }
    } else {
      const body = await request.json();
      userMessage = body.texto || '';
      if (!userMessage) return Response.json({ error: 'texto obrigatório' }, { status: 400 });
    }

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const texto = msg.content[0].text.trim();
    const resultado = JSON.parse(texto);
    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
