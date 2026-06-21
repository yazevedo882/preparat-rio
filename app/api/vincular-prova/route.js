import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Recebe instituto + ano (+ titulo opcional) e os ids das questões já salvas
// Busca prova existente com esse instituto+ano, ou cria uma nova, e vincula as questões
export async function POST(request) {
  try {
    const { instituto, ano, titulo, questao_ids } = await request.json();

    if (!instituto || !ano || !questao_ids?.length) {
      return Response.json({ error: 'instituto, ano e questao_ids são obrigatórios' }, { status: 400 });
    }

    // Procura prova existente
    let { data: provaExistente } = await supabaseAdmin
      .from('provas')
      .select('id, titulo')
      .eq('instituto', instituto)
      .eq('ano', Number(ano))
      .maybeSingle();

    let provaId;
    let criada = false;

    if (provaExistente) {
      provaId = provaExistente.id;
    } else {
      const tituloFinal = titulo || `${instituto} ${ano}`;
      const { data: novaProva, error: erroCriar } = await supabaseAdmin
        .from('provas')
        .insert({ instituto, ano: Number(ano), titulo: tituloFinal, ativa: true })
        .select('id')
        .single();

      if (erroCriar) throw new Error(erroCriar.message);
      provaId = novaProva.id;
      criada = true;
    }

    // Descobre o próximo número disponível na prova
    const { data: existentes } = await supabaseAdmin
      .from('prova_questoes')
      .select('numero')
      .eq('prova_id', provaId)
      .order('numero', { ascending: false })
      .limit(1);

    let proximoNumero = (existentes?.[0]?.numero || 0) + 1;

    // Vincula cada questão (ignora se já estiver vinculada)
    const vinculos = questao_ids.map((qid, i) => ({
      prova_id: provaId,
      questao_id: qid,
      numero: proximoNumero + i,
    }));

    await supabaseAdmin
      .from('prova_questoes')
      .upsert(vinculos, { onConflict: 'prova_id,questao_id', ignoreDuplicates: true });

    return Response.json({ prova_id: provaId, criada, titulo: provaExistente?.titulo || titulo || `${instituto} ${ano}` });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
