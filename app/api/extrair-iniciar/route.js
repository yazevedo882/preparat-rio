import { createClient } from '@supabase/supabase-js';
import { jsonrepair } from 'jsonrepair';
import { waitUntil } from '@vercel/functions';

export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BUCKET = 'provas-temp';

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair questões de provas de Institutos Federais do Brasil.

Você vai receber o conteúdo de uma prova com várias questões numeradas, cada uma com um enunciado e alternativas (A, B, C, D ou A, B, C, D, E). O conteúdo pode vir como texto, um PDF com várias páginas, ou uma ou mais fotos/imagens de páginas da prova — processe TUDO que for enviado, questão por questão, até o fim.

ATENÇÃO — TEXTOS DE APOIO COMPARTILHADOS:
Provas frequentemente têm um texto de apoio (ex: uma reportagem, um poema, um trecho de livro) seguido de uma instrução como "Leia o Texto 1 para responder às questões de 1 a 5" — e várias questões seguintes dependem desse mesmo texto para fazer sentido.

Avalie o TAMANHO de cada texto de apoio para decidir como tratá-lo:

- TEXTO DE APOIO CURTO (até ~4 linhas — ex: uma citação, tirinha, provérbio, tabela pequena): reproduza o texto de apoio completo no início do campo "enunciado" de cada questão vinculada a ele, seguido de uma linha em branco e a pergunta específica. Formato: "[texto de apoio completo]\\n\\n[pergunta específica]"

- TEXTO DE APOIO LONGO (mais de ~4 linhas — ex: uma reportagem, um artigo, um trecho de livro): NÃO reproduza o texto. O professor vai anexar manualmente uma foto desse texto em cada questão vinculada (usando o recurso de imagens do sistema, depois da extração). Em vez disso, escreva o enunciado assim: "[Ver texto de apoio anexado] [pergunta específica da questão]"

Para questões que NÃO dependem de nenhum texto de apoio compartilhado, escreva o enunciado normalmente, sem nenhum desses tratamentos.

Extraia TODAS as questões que conseguir identificar, de TODAS as páginas/imagens recebidas — não pare nas primeiras. Retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois, no formato exato abaixo:

{
  "questoes": [
    {
      "numero": 1,
      "enunciado": "texto do enunciado, seguindo as regras acima sobre textos de apoio curtos/longos, sem o número da questão",
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
- NUNCA reproduza um texto de apoio LONGO — use sempre o marcador "[Ver texto de apoio anexado] " nesses casos
- NUNCA pare antes do fim do documento/conjunto de imagens recebido
- IMPORTANTE SOBRE FORMATAÇÃO DO JSON: dentro dos textos (enunciado, opções), escape corretamente aspas duplas (\\") e quebras de linha (\\n). Nunca deixe uma aspa dupla literal sem escape dentro de uma string do JSON.`;

function tentarExtrairJSON(texto) {
  let limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(limpo);
  } catch (e) {
    try {
      return JSON.parse(jsonrepair(limpo));
    } catch (e2) {
      const inicio = limpo.indexOf('{');
      const fim = limpo.lastIndexOf('}');
      if (inicio !== -1 && fim !== -1 && fim > inicio) {
        const possivel = limpo.slice(inicio, fim + 1);
        try {
          return JSON.parse(possivel);
        } catch (e3) {
          try {
            return JSON.parse(jsonrepair(possivel));
          } catch (e4) {
            throw new Error('JSON malformado mesmo após reparo: ' + e4.message);
          }
        }
      }
      throw new Error('Resposta da IA não contém um JSON válido: ' + e.message);
    }
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

async function marcarErro(jobId, mensagem) {
  await supabaseAdmin.from('extracoes').update({ status: 'erro', erro: mensagem }).eq('id', jobId);
}

// Faz o trabalho pesado (baixar arquivo, chamar a IA, interpretar o JSON) em segundo plano,
// continuando a rodar mesmo depois da resposta HTTP já ter sido enviada ao cliente.
async function processarExtracao(jobId, { texto, pdfPath, imagePaths }) {
  let pathsParaApagar = [];
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      await marcarErro(jobId, 'A chave da Claude (ANTHROPIC_API_KEY) não está configurada no Vercel.');
      return;
    }

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
      await marcarErro(jobId, 'Nenhum texto, imagem ou PDF foi enviado.');
      return;
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
        max_tokens: 64000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      await apagarDoStorage(pathsParaApagar);
      await marcarErro(jobId, `Erro na API da Anthropic (status ${res.status}): ${errBody.slice(0, 300)}`);
      return;
    }

    const data = await res.json();
    const stopReason = data?.stop_reason;
    const texto_resposta = data?.content?.find(b => b.type === 'text')?.text;

    if (!texto_resposta) {
      await apagarDoStorage(pathsParaApagar);
      await marcarErro(jobId, 'A IA não retornou conteúdo. Tente enviar um trecho menor da prova (ex: 15-20 questões por vez).');
      return;
    }

    let resultado;
    try {
      resultado = tentarExtrairJSON(texto_resposta);
    } catch (parseError) {
      const avisoCorte = stopReason === 'max_tokens'
        ? ' A resposta da IA foi cortada por ser muito longa — tente enviar menos questões de uma vez (ex: 15-20 por vez).'
        : '';
      await apagarDoStorage(pathsParaApagar);
      await marcarErro(jobId, 'Não foi possível interpretar a resposta da IA.' + avisoCorte);
      return;
    }

    if (!resultado.questoes || !Array.isArray(resultado.questoes) || resultado.questoes.length === 0) {
      await apagarDoStorage(pathsParaApagar);
      await marcarErro(jobId, 'A IA não conseguiu identificar nenhuma questão no material enviado. Verifique se os enunciados e alternativas (A, B, C, D) estão legíveis.');
      return;
    }

    await apagarDoStorage(pathsParaApagar);
    await supabaseAdmin.from('extracoes').update({ status: 'concluido', resultado }).eq('id', jobId);
  } catch (e) {
    await apagarDoStorage(pathsParaApagar);
    await marcarErro(jobId, 'Erro inesperado: ' + e.message);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const { data: job, error } = await supabaseAdmin
      .from('extracoes')
      .insert({ status: 'processando' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    // Continua processando em segundo plano mesmo depois da resposta abaixo ser enviada —
    // isso permite que o professor feche o app/tranque a tela sem interromper a extração.
    waitUntil(processarExtracao(job.id, body));

    return Response.json({ id: job.id });
  } catch (e) {
    return Response.json({ error: 'Erro ao iniciar extração: ' + e.message }, { status: 500 });
  }
}
