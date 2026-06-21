const SYSTEM_PROMPT = `Você é um assistente especializado em extrair questões de provas de Institutos Federais do Brasil.

Você vai receber o texto de uma prova com várias questões numeradas, cada uma com um enunciado e alternativas (A, B, C, D ou A, B, C, D, E).

ATENÇÃO — TEXTOS DE APOIO COMPARTILHADOS:
Provas frequentemente têm um texto de apoio (ex: uma reportagem, um poema, um trecho de livro) seguido de uma instrução como "Leia o Texto 1 para responder às questões de 1 a 5" — e várias questões seguintes dependem desse mesmo texto para fazer sentido.

Quando isso acontecer, você DEVE incluir o texto de apoio completo no início do campo "enunciado" de CADA questão que depende dele, seguido de uma linha em branco e então a pergunta específica daquela questão. Isso é essencial — sem o texto de apoio, a questão fica impossível de responder.

Exemplo de como ficar o enunciado de uma questão que depende de um texto de apoio:
"[texto de apoio completo aqui, na íntegra]\\n\\n[pergunta específica da questão, ex: 'A leitura do Texto 1 permite-nos constatar que ele se propõe, principalmente, a']"

Repita o texto de apoio em CADA questão vinculada a ele, mesmo que isso deixe o enunciado longo — é assim que deve ser, pois cada questão precisa ser autossuficiente quando exibida sozinha para o aluno.

Extraia TODAS as questões que conseguir identificar e retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois, no formato exato abaixo:

{
  "questoes": [
    {
      "numero": 1,
      "enunciado": "texto completo do enunciado (incluindo o texto de apoio compartilhado, se houver, conforme regra acima), sem o número da questão",
      "opcoes": ["texto da alternativa A", "texto da alternativa B", "texto da alternativa C", "texto da alternativa D"],
      "numOpcoes": 4
    }
  ],
  "instituto": "ex: IFSP, IFBA, etc. ou null se não identificar",
  "ano": 2024,
  "disciplina": null
}

REGRAS IMPORTANTES:
- As opções devem conter SÓ o texto, sem a letra (ex: "Geração de energia limpa" e não "A) Geração de energia limpa")
- numOpcoes é 4 ou 5 dependendo de quantas alternativas a questão tem
- Se não identificar instituto/ano/disciplina no texto, use null
- Retorne APENAS o objeto JSON, nada mais — sem explicações, sem markdown
- Se o texto tiver muitas questões, extraia todas mesmo assim
- NUNCA omita o texto de apoio de uma questão que depende dele, mesmo que ele já tenha aparecido em uma questão anterior`;

function tentarExtrairJSON(texto) {
  let limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(limpo);
  } catch (e) {
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio !== -1 && fim !== -1 && fim > inicio) {
      const possivel = limpo.slice(inicio, fim + 1);
      try {
        return JSON.parse(possivel);
      } catch (e2) {
        throw new Error('JSON malformado mesmo após limpeza: ' + e2.message);
      }
    }
    throw new Error('Resposta da IA não contém um JSON válido: ' + e.message);
  }
}

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: 'A chave do Gemini (GEMINI_API_KEY) não está configurada no Vercel.' }, { status: 500 });
    }

    const contentType = request.headers.get('content-type') || '';
    let parts;
    let textoOriginal = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const imagem = formData.get('imagem');
      const pdf = formData.get('pdf');

      if (pdf && pdf.size > 0) {
        if (pdf.size > 4_000_000) {
          return Response.json({ error: 'O PDF é muito grande (limite ~4MB). Tente exportar com menor resolução ou dividir em partes.' }, { status: 400 });
        }
        const bytes = await pdf.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        parts = [
          { inline_data: { mime_type: 'application/pdf', data: base64 } },
          { text: SYSTEM_PROMPT },
        ];
      } else if (imagem && imagem.size > 0) {
        const bytes = await imagem.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        const mediaType = imagem.type || 'image/jpeg';
        parts = [
          { inline_data: { mime_type: mediaType, data: base64 } },
          { text: SYSTEM_PROMPT },
        ];
      } else {
        textoOriginal = formData.get('texto') || '';
        if (!textoOriginal.trim()) {
          return Response.json({ error: 'Nenhum texto, imagem ou PDF foi enviado.' }, { status: 400 });
        }
        parts = [{ text: SYSTEM_PROMPT + '\n\nTexto da prova:\n' + textoOriginal }];
      }
    } else {
      const body = await request.json();
      textoOriginal = body.texto || '';
      if (!textoOriginal.trim()) {
        return Response.json({ error: 'Nenhum texto foi enviado.' }, { status: 400 });
      }
      parts = [{ text: SYSTEM_PROMPT + '\n\nTexto da prova:\n' + textoOriginal }];
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            maxOutputTokens: 32000,
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      return Response.json({ error: `Erro na API do Gemini (status ${res.status}): ${errBody.slice(0, 300)}` }, { status: 500 });
    }

    const data = await res.json();
    const finishReason = data?.candidates?.[0]?.finishReason;
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      return Response.json({
        error: 'A IA não retornou conteúdo. Tente colar um trecho menor da prova (ex: 15-20 questões por vez).',
        debug: JSON.stringify(data).slice(0, 500),
      }, { status: 500 });
    }

    let resultado;
    try {
      resultado = tentarExtrairJSON(texto);
    } catch (parseError) {
      const avisoCorte = finishReason === 'MAX_TOKENS'
        ? ' A resposta da IA foi cortada por ser muito longa — tente colar menos questões de uma vez (ex: 15-20 por vez).'
        : '';
      return Response.json({
        error: 'Não foi possível interpretar a resposta da IA.' + avisoCorte,
        debug: texto.slice(0, 500),
      }, { status: 500 });
    }

    if (!resultado.questoes || !Array.isArray(resultado.questoes) || resultado.questoes.length === 0) {
      return Response.json({ error: 'A IA não conseguiu identificar nenhuma questão no texto enviado. Verifique se o texto tem os enunciados e alternativas claros (A, B, C, D).' }, { status: 400 });
    }

    return Response.json(resultado);
  } catch (e) {
    return Response.json({ error: 'Erro inesperado: ' + e.message }, { status: 500 });
  }
}
