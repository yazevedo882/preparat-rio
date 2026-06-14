'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const CODIGO_PROFESSOR = 'PROF2024';

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState('login');
  const [form, setForm] = useState({ email: '', senha: '', nome: '', codigoProf: '', tipo: 'aluno' });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const verificarSessao = async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        const role = data.session.user.user_metadata?.role || 'aluno';
        router.push(role === 'professor' ? '/professor/dashboard' : '/aluno/questoes');
      }
    };
    verificarSessao();
  }, [router]);

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function entrar() {
    setErro('');
    if (!form.email.trim() || !form.senha) {
      setErro('Preencha email e senha.');
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.senha,
    });
    if (error) {
      setErro('Email ou senha incorretos.');
    } else {
      const { data } = await supabase.auth.getSession();
      const role = data?.session?.user?.user_metadata?.role || 'aluno';
      router.push(role === 'professor' ? '/professor/dashboard' : '/aluno/questoes');
    }
    setCarregando(false);
  }

  async function cadastrar() {
    setErro('');
    if (!form.nome.trim()) { setErro('Informe seu nome.'); return; }
    if (!form.email.trim()) { setErro('Informe seu email.'); return; }
    if (form.senha.length < 6) { setErro('Senha deve ter pelo menos 6 caracteres.'); return; }

    const isProfessor = form.tipo === 'professor' && form.codigoProf.trim().toUpperCase() === CODIGO_PROFESSOR;
    
    if (form.tipo === 'professor' && !isProfessor) {
      setErro('Código de professor inválido.');
      return;
    }

    setCarregando(true);
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.senha,
      options: {
        data: {
          nome: form.nome.trim(),
          role: isProfessor ? 'professor' : 'aluno',
        },
      },
    });

    if (error) {
      setErro(error.message === 'User already registered'
        ? 'Este email já está cadastrado.'
        : 'Erro ao cadastrar. Tente novamente.');
    } else {
      setErro('Cadastro realizado! Faça login para continuar.');
      setModo('login');
      setForm({ email: form.email, senha: '', nome: '', codigoProf: '', tipo: 'aluno' });
    }
    setCarregando(false);
  }

  const Campo = ({ label, type, valor, onChange, placeholder }) => (
    <div>
      <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">{label}</label>
      <input
        type={type || 'text'}
        value={valor}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-mono text-3xl font-bold tracking-widest text-slate-900">QUESTÕES IF</h1>
          <p className="text-xs text-stone-500 mt-2">banco de questões · institutos federais</p>
        </div>

        <div className="bg-white border-2 border-slate-900 rounded-2xl p-6">
          <div className="flex mb-6 border-2 border-slate-900 rounded-xl overflow-hidden">
            <button
              onClick={() => { setModo('login'); setErro(''); }}
              className={`flex-1 py-2.5 text-xs font-mono uppercase tracking-wider font-bold transition ${
                modo === 'login' ? 'bg-slate-900 text-white' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setModo('cadastro'); setErro(''); }}
              className={`flex-1 py-2.5 text-xs font-mono uppercase tracking-wider font-bold transition ${
                modo === 'cadastro' ? 'bg-slate-900 text-white' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Criar conta
            </button>
          </div>

          <div className="space-y-3">
            {modo === 'cadastro' && (
              <>
                <Campo label="Nome completo" valor={form.nome} onChange={(e) => atualizar('nome', e.target.value)} placeholder="Seu nome" />
                
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-2">Tipo de conta</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer flex-1 p-2 border border-stone-300 rounded-lg hover:bg-stone-50">
                      <input
                        type="radio"
                        name="tipo"
                        value="aluno"
                        checked={form.tipo === 'aluno'}
                        onChange={(e) => atualizar('tipo', e.target.value)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-slate-700">Aluno</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer flex-1 p-2 border border-stone-300 rounded-lg hover:bg-stone-50">
                      <input
                        type="radio"
                        name="tipo"
                        value="professor"
                        checked={form.tipo === 'professor'}
                        onChange={(e) => atualizar('tipo', e.target.value)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-slate-700">Professor</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            <Campo label="Email" type="email" valor={form.email} onChange={(e) => atualizar('email', e.target.value)} placeholder="seu@email.com" />
            <Campo label="Senha" type="password" valor={form.senha} onChange={(e) => atualizar('senha', e.target.value)} placeholder={modo === 'cadastro' ? 'Mínimo 6 caracteres' : '••••••'} />

            {modo === 'cadastro' && form.tipo === 'professor' && (
              <div>
                <Campo label="Código de professor" valor={form.codigoProf} onChange={(e) => atualizar('codigoProf', e.target.value)} placeholder="Código fornecido" />
                <p className="text-xs text-stone-400 mt-1">Somente professores possuem esse código.</p>
              </div>
            )}
          </div>

          {erro && (
            <div className={`rounded-lg p-3 mt-4 text-xs ${
              erro.includes('realizado') 
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {erro}
            </div>
          )}

          <button
            onClick={modo === 'login' ? entrar : cadastrar}
            disabled={carregando}
            className="w-full mt-4 bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 hover:bg-emerald-800 transition"
          >
            {carregando ? 'Aguarde...' : modo === 'login' ? 'Entrar ▸' : 'Criar conta ▸'}
          </button>
        </div>
      </div>
    </div>
  );
}
