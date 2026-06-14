'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function CadastroConta() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [queroProfessor, setQueroProfessor] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function criar() {
    setErro('');
    setSucesso(false);

    if (!nome.trim() || !email.trim() || !senha) {
      setErro('Preencha nome, e-mail e senha.');
      return;
    }
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setCarregando(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        data: {
          nome: nome.trim(),
          quer_ser_professor: queroProfessor,
        },
      },
    });
    setCarregando(false);

    if (error) {
      setErro(error.message);
      return;
    }

    if (data.session) {
      router.push('/');
    } else {
      // o projeto exige confirmação de e-mail
      setSucesso(true);
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-4">
          <h1 className="font-mono text-2xl font-bold tracking-widest text-slate-900">QUESTÕES IF</h1>
          <p className="text-xs text-stone-500 mt-1">criar conta</p>
        </div>

        <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
          {sucesso ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-700">
              Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Nome</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Senha</label>
                  <input
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="mínimo 6 caracteres"
                    className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>

                <label className="flex items-start gap-2 text-sm text-stone-700 pt-1">
                  <input
                    type="checkbox"
                    checked={queroProfessor}
                    onChange={(e) => setQueroProfessor(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Sou professor e quero solicitar acesso para cadastrar questões. (Um administrador vai analisar
                    seu pedido.)
                  </span>
                </label>
              </div>

              {erro && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 text-xs text-red-700">{erro}</div>
              )}

              <button
                onClick={criar}
                disabled={carregando}
                className="w-full mt-4 bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition"
              >
                {carregando ? 'Criando...' : 'Criar conta ▸'}
              </button>
            </>
          )}

          <p className="text-xs text-stone-500 mt-4 text-center">
            Já tem conta?{' '}
            <Link href="/login" className="underline text-slate-900">
              Entrar
            </Link>
          </p>
          <p className="text-xs text-stone-400 mt-2 text-center">
            <Link href="/" className="underline">
              ◂ voltar para o início
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
