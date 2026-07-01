import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BUCKET = 'provas-temp';

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair questões de provas de Institutos Federais do Brasil.

Você vai receber o conteúdo de uma prova com várias questões numeradas, cada uma com um enunciado e alternativas (A, B, C, D ou A, B, C, D, E). O conteúdo pode vir como texto, um PDF com várias páginas, ou uma ou mais fotos/imagens de páginas da prova — processe TUDO que for enviado, questão por questão, até o fim.

ATENÇÃO — TEXTOS DE APOIO COMPARTILHADOS:
Provas frequentemente têm um texto de apoio (ex: uma reportagem, um poema, um trecho de livro) seguido de uma instrução como "Leia o Texto 1 para responder às questões de 1 a 5" — e várias questões seguintes dependem desse mesmo texto para fazer sentido.

Quando isso acontecer, você DEVE incluir o texto de apoio completo no início do campo "enunciado" de CADA questão que depende dele, seguido de uma linha em branco e então a pergunta específica daquela questão. Isso é essencial — sem o texto de apoio, a questão fica impossível de responder.

Exemplo de como ficar o enunciado de uma questão que depende de um texto de apoio:
"[texto de apoio completo aqui, na íntegra]\\n\\n[pergunta específica da questão, ex: 'A leitura do Texto 1 permite-nos constatar que ele se propõe, principalmente, a']"

Repita o texto de apoio em CADA questão vinculada a ele, mesmo que isso deixe o enunciado longo — é assim que deve ser, pois cada questão precisa ser autossuficiente quando exibida sozinha para o aluno.

Extraia TODAS as questões que conseguir identificar, de TODAS as páginas/imagens recebidas — não pare nas primeiras. Retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois, no formato exato abaixo:

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
- Se o texto/prova tiver muitas questões, extraia todas mesmo assim
- NUNCA omita o texto de apoio de uma questão que depende dele, mesmo que ele já tenha aparecido em uma questão anterior
- NUNCA pare antes do fim do documento/conjunto de imagens recebido`;

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

async function baixarComoBase64(path) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Falha ao baixar arquivo do Storage (${path}): ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return { base64: buffer.toString('base64'), mimeType: data.type || 'application/octet-stream' };
}

async function apagarDoStorage(paths) {
  try {
    if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
  } catch (e) { /* limpeza best-effort, não falha a request por isso */ }
}

export async function POST(request) {
  let pathsParaApagar = [];
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'A chave da Claude (ANTHROPIC_API_KEY) não está configurada no Vercel.' }, { status: 500 });
    }

    const body = await request.json();
    const { texto, pdfPath, imagePaths } = body;

    const contentBlocks = [];

    if (pdfPath) {
      pathsParaApagar = [pdfPath];
      const { base64 } = await baixarComoBase64(pdfPath);
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      });
    } else if (Array.isArray(imagePaths) && imagePaths.length > 0) {
      pathsParaApagar = imagePaths;
      for (const path of imagePaths) {
        const { base64, mimeType } = await baixarComoBase64(path);
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mimeType.startsWith('image/') ? mimeType : 'image/jpeg', data: base64 },
        });
      }
    } else if (texto && texto.trim()) {
      contentBlocks.push({ type: 'text', text: 'Texto da prova:\n' + texto });
    } else {
      return Response.json({ error: 'Nenhum texto, imagem ou PDF foi enviado.' }, { status: 400 });
    }

    contentBlocks.push({ type: 'text', text: 'Extraia todas as questões conforme as instruções.' });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      await apagarDoStorage(pathsParaApagar);
      return Response.json({ error: `Erro na API da Anthropic (status ${res.status}): ${errBody.slice(0, 300)}` }, { status: 500 });
    }

    const data = await res.json();
    const stopReason = data?.stop_reason;
    const texto_resposta = data?.content?.find(b => b.type === 'text')?.text;

    if (!texto_resposta) {
      await apagarDoStorage(pathsParaApagar);
      return Response.json({
        error: 'A IA não retornou conteúdo. Tente enviar um trecho menor da prova (ex: 15-20 questões por vez).',
        debug: JSON.stringify(data).slice(0, 500),
      }, { status: 500 });
    }

    let resultado;
    try {
      resultado = tentarExtrairJSON(texto_resposta);
    } catch (parseError) {
      const avisoCorte = stopReason === 'max_tokens'
        ? ' A resposta da IA foi cortada por ser muito longa — tente enviar menos questões de uma vez (ex: 15-20 por vez).'
        : '';
      await apagarDoStorage(pathsParaApagar);
      return Response.json({
        error: 'Não foi possível interpretar a resposta da IA.' + avisoCorte,
        debug: texto_resposta.slice(0, 500),
      }, { status: 500 });
    }

    if (!resultado.questoes || !Array.isArray(resultado.questoes) || resultado.questoes.length === 0) {
      await apagarDoStorage(pathsParaApagar);
      return Response.json({ error: 'A IA não conseguiu identificar nenhuma questão no material enviado. Verifique se os enunciados e alternativas (A, B, C, D) estão legíveis.' }, { status: 400 });
    }

    await apagarDoStorage(pathsParaApagar);
    return Response.json(resultado);
  } catch (e) {
    await apagarDoStorage(pathsParaApagar);
    return Response.json({ error: 'Erro inesperado: ' + e.message }, { status: 500 });
  }
}
