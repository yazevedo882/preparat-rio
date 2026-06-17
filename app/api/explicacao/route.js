import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const LETRAS = ['A', 'B', 'C', 'D', 'E'];

export async function POST(request) {
  try {
    const { questao_id, enunciado, opcoes, correta, disciplina, assunto, acertou } = await request.json();

    // Só gera explicação se o aluno ERROU
    if (acertou) return Response.json({ explicacao: null });

    // Verifica cache no banco
    if (questao_id) {
      const { data: questao } = await supabaseAdmin
        .from('questoes')
        .select('explicacao, explicacao_gerada')
        .eq('id', questao_id)
        .single();
      if (questao?.explicacao) return Response.json({ explicacao: questao.explicacao });
      if (questao?.explicacao_gerada) return Response.json({ explicacao: questao.explicacao_gerada });
    }

    if (!process.env.GROQ_API_KEY) {
      return Response.json({ explicacao: 'Explicação automática não configurada ainda.' });
    }

    const prompt = `Você é um professor explicando uma questão de prova de Instituto Federal.
Questão de ${disciplina} — ${assunto}:
"${enunciado}"
Alternativas: ${opcoes.map((o, i) => `${LETRAS[i]}) ${o}`).join(' | ')}
A alternativa correta é ${correta}.
Explique em até 60 palavras, em português, de forma direta e didática, por que essa é a resposta correta.`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const texto = data?.choices?.[0]?.message?.content || 'Não foi possível gerar a explicação agora.';

    // Salva no cache
    if (questao_id) {
      await supabaseAdmin
        .from('questoes')
        .update({ explicacao_gerada: texto })
        .eq('id', questao_id);
    }

    return Response.json({ explicacao: texto });
  } catch (e) {
    return Response.json({ explicacao: 'Não foi possível gerar a explicação agora.' });
  }
}
