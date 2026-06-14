'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function ProfessorDashboard() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
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

      setUsuario(data.session.user);
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
          <h1 className="font-mono text-2xl font-bold text-slate-900">QUESTÕES IF - PROFESSOR</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-600">Bem-vindo, {usuario?.user_metadata?.nome}</span>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link href="/professor/cadastro" className="bg-white border-2 border-slate-900 rounded-xl p-6 hover:shadow-lg transition">
            <div className="text-3xl mb-2">➕</div>
            <h2 className="font-mono font-bold text-slate-900">Nova Questão</h2>
            <p className="text-xs text-stone-500 mt-1">Adicionar questão ao banco</p>
          </Link>

          <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
            <div className="text-3xl mb-2">📊</div>
            <h2 className="font-mono font-bold text-slate-900">{questoes.length}</h2>
            <p className="text-xs text-stone-500 mt-1">Questões no banco</p>
          </div>

          <Link href="/professor/relatorios" className="bg-white border-2 border-slate-900 rounded-xl p-6 hover:shadow-lg transition">
            <div className="text-3xl mb-2">📈</div>
            <h2 className="font-mono font-bold text-slate-900">Relatórios</h2>
            <p className="text-xs text-stone-500 mt-1">Ver estatísticas</p>
          </Link>
        </div>

        <div className="bg-white border-2 border-slate-900 rounded-xl p-6">
          <h2 className="font-mono font-bold text-slate-900 mb-4">Questões Recentes</h2>
          {questoes.length === 0 ? (
            <p className="text-stone-600 text-sm">Nenhuma questão cadastrada ainda.</p>
          ) : (
            <div className="space-y-3">
              {questoes.slice(0, 5).map((q, idx) => (
                <div key={idx} className="border border-stone-300 rounded-lg p-3 hover:bg-stone-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-mono font-bold text-slate-900">{q.disciplina} - {q.assunto}</p>
                      <p className="text-xs text-stone-600 mt-1">{q.instituto} ({q.ano})</p>
                    </div>
                    <Link href={`/professor/editar/${q.id}`} className="text-xs text-emerald-600 hover:underline">Editar</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
