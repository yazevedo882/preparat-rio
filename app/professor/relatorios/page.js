'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function ProfessorRelatorios() {
  const router = useRouter();
  const [questoes, setQuestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const verificarAcesso = async () => {
      const { data } = await supabase.auth.getSession();
      const role = data?.session?.user?.user_metadata?.role;
      
      if (!data?.session || role !== 'professor') {
        router.push('/');
        return;
      }

      carregarQuestoes();
    };

    verificarAcesso();
  }, [router]);

  async function carregarQuestoes() {
    try {
      const { data, error } = await supabase.from('questoes').select('*');
      if (error) throw error;
      setQuestoes(data || []);
    } catch (e) {
      console.error('Erro ao carregar questões:', e);
    }
    setCarregando(false);
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-stone-600">Carregando...</p>
      </div>
    );
  }

  const estatisticas = {
    total: questoes.length,
    porDisciplina: {},
    porAssunto: {},
    porInstituto: {},
  };

  questoes.forEach((q) => {
    estatisticas.porDisciplina[q.disciplina] = (estatisticas.porDisciplina[q.disciplina] || 0) + 1;
    estatisticas.porAssunto[q.assunto] = (estatisticas.porAssunto[q.assunto] || 0) + 1;
    estatisticas.porInstituto[q.instituto] = (estatisticas.porInstituto[q.instituto] || 0) + 1;
  });

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="border-b-2 border-slate-900 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/professor/dashboard" className="text-xs text-stone-400 font-mono underline">
            ◂ voltar
          </Link>
          <h1 className="font-mono text-2xl font-bold text-slate-900">RELATÓRIOS</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <p className="text-xs text-stone-500 font-mono">TOTAL DE QUESTÕES</p>
            <h2 className="text-3xl font-bold text-slate-900 mt-2">{estatisticas.total}</h2>
          </div>

          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <p className="text-xs text-stone-500 font-mono">DISCIPLINAS</p>
            <h2 className="text-3xl font-bold text-slate-900 mt-2">{Object.keys(estatisticas.porDisciplina).length}</h2>
          </div>

          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <p className="text-xs text-stone-500 font-mono">ASSUNTOS</p>
            <h2 className="text-3xl font-bold text-slate-900 mt-2">{Object.keys(estatisticas.porAssunto).length}</h2>
          </div>

          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <p className="text-xs text-stone-500 font-mono">INSTITUTOS</p>
            <h2 className="text-3xl font-bold text-slate-900 mt-2">{Object.keys(estatisticas.porInstituto).length}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <h3 className="font-mono font-bold text-slate-900 mb-4">Por Disciplina</h3>
            <div className="space-y-2">
              {Object.entries(estatisticas.porDisciplina).map(([disciplina, count]) => (
                <div key={disciplina} className="flex justify-between items-center p-2 border-b border-stone-200">
                  <span className="text-sm text-slate-900">{disciplina}</span>
                  <span className="text-xs font-mono font-bold text-emerald-700">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <h3 className="font-mono font-bold text-slate-900 mb-4">Por Instituto</h3>
            <div className="space-y-2">
              {Object.entries(estatisticas.porInstituto).map(([instituto, count]) => (
                <div key={instituto} className="flex justify-between items-center p-2 border-b border-stone-200">
                  <span className="text-sm text-slate-900">{instituto}</span>
                  <span className="text-xs font-mono font-bold text-emerald-700">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <h3 className="font-mono font-bold text-slate-900 mb-4">Assuntos Mais Usados</h3>
            <div className="space-y-2">
              {Object.entries(estatisticas.porAssunto)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 8)
                .map(([assunto, count]) => (
                  <div key={assunto} className="flex justify-between items-center p-2 border-b border-stone-200">
                    <span className="text-sm text-slate-900 truncate">{assunto}</span>
                    <span className="text-xs font-mono font-bold text-emerald-700">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
