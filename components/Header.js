'use client';

import Link from 'next/link';
import { useAuth } from '../app/AuthProvider';
import { supabase } from '../lib/supabaseClient';

export default function Header() {
  const { user, profile, loading } = useAuth();

  async function sair() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (loading) {
    return <div className="h-6 mb-2" />;
  }

  return (
    <div className="flex justify-between items-center text-xs font-mono mb-2 px-1">
      {user ? (
        <>
          <span className="text-stone-500 truncate max-w-[40%]">
            Olá, {profile?.nome || user.email}
          </span>
          <div className="flex gap-3 items-center">
            {profile?.is_professor && (
              <Link href="/professor" className="underline text-slate-900">
                Área do professor
              </Link>
            )}
            <button onClick={sair} className="underline text-stone-500">
              Sair
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="text-stone-400">Visitante</span>
          <div className="flex gap-3">
            <Link href="/login" className="underline text-slate-900">
              Entrar
            </Link>
            <Link href="/cadastro-conta" className="underline text-slate-900">
              Criar conta
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
