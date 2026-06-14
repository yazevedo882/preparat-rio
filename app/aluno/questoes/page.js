'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function AlunoQuestoes() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [questoes, setQuestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtros, setFiltros] = useState({ disciplina: '', assunto: '', instituto: '' });
  const [questoesResolvidas, setQuestoesResolvidas] = useState({});

  useEffect(() => {
    const verificarAcesso = async () => {
      const { data } = await supabase.auth.getSession();
      const role = data?.session?.user?.user_metadata?.role;
      
      if (!data?.session || role === 'professor') {
        router.push('/');
        return;
      }

      setUsuario(data.session.user);
      carregarQuestoes();
    };

    verificarAcesso();
  }, [router]);

  async function carregarQuestoes() {
    try {
      let query = supabase.from('questoes').select('*');

      if (filtros.disciplina) query = query.eq('disciplina', filtros.disciplina);
      if (filtros.assunto) query = query.eq('assunto', filtros.assunto);
      if (filtros.instituto) query = query.eq('instituto', filtros.instituto);

      const { data, error } = await query;
      if (error) throw error;
      setQuestoes(data || []);
    } catch (e) {
      console.error('Erro ao carregar questões:', e);
    }
    setCarregando(false);
  }

  function marcarResolvida(id) {
    setQuestoesResolvidas((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-stone-600">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="border-b-2 border-slate-900 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="font-mono text-2xl font-bold text-slate-900">QUESTÕES IF - ALUNO</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-600">Bem-vindo, {usuario?.user_metadata?.nome}</span>
            <Link href="/aluno/revisar" className="px-3 py-1.5 text-xs font-mono bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Imprimir PDF
            </Link>
            <button
              onClick={sair}
              className="px-3 py-1.5 text-xs font-mono bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white border-2 border-slate-900 rounded-xl p-6 mb-6">
          <h2 className="font-mono font-bold text-slate-900 mb-4">Filtrar Questões</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 mb-1">Disciplina</label>
              <input
                type="text"
                placeholder="Ex: Matemática"
                value={filtros.disciplina}
                onChange={(e) => setFiltros({ ...filtros, disciplina: e.target.value })}
                className="w-full border border-stone-300 rounded-lg p-2 bg-stone-50 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 mb-1">Assunto</label>
              <input
                type="text"
                placeholder="Ex: Frações"
                value={filtros.assunto}
                onChange={(e) => setFiltros({ ...filtros, assunto: e.target.value })}
                className="w-full border border-stone-300 rounded-lg p-2 bg-stone-50 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 mb-1">Instituto</label>
              <input
                type="text"
                placeholder="Ex: IFSP"
                value={filtros.instituto}
                onChange={(e) => setFiltros({ ...filtros, instituto: e.target.value })}
                className="w-full border border-stone-300 rounded-lg p-2 bg-stone-50 text-sm"
              />
            </div>
          </div>
          <button
            onClick={carregarQuestoes}
            className="mt-4 px-4 py-2 bg-emerald-700 text-white text-xs font-mono rounded-lg hover:bg-emerald-800"
          >
            Pesquisar
          </button>
        </div>

        <div className="space-y-4">
          {questoes.length === 0 ? (
            <div className="bg-white border-2 border-slate-900 rounded-xl p-6 text-center">
              <p className="text-stone-600">Nenhuma questão encontrada.</p>
            </div>
          ) : (
            questoes.map((q) => (
              <div key={q.id} className="bg-white border-2 border-slate-900 rounded-xl p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-stone-500 font-mono">{q.instituto} • {q.ano} • {q.disciplina}</p>
                    <h3 className="font-mono font-bold text-slate-900 mt-1">Assunto: {q.assunto}</h3>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={questoesResolvidas[q.id] || false}
                      onChange={() => marcarResolvida(q.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-xs text-stone-600">Resolvida</span>
                  </label>
                </div>

                <div className="bg-stone-50 border border-stone-300 rounded-lg p-4 mb-4">
                  <p className="text-sm text-slate-900 mb-3">{q.enunciado}</p>
                  {q.imagem_url && (
                    <img src={q.imagem_url} alt="Questão" className="max-w-sm rounded-lg mb-3" />
                  )}
                </div>

                <div className="space-y-2 mb-4">
                  {q.opcoes.map((opcao, idx) => (
                    <label key={idx} className="flex items-center gap-2 p-2 border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer">
                      <input type="radio" name={`q${q.id}`} className="w-4 h-4" />
                      <span className="text-sm text-slate-900">{String.fromCharCode(65 + idx)}) {opcao}</span>
                    </label>
                  ))}
                </div>

                <Link href={`/aluno/questoes/${q.id}`} className="text-xs text-emerald-600 font-mono hover:underline">
                  Ver explicação ▸
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
