'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import { useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabaseClient';

const CHAVE_JOB = 'qif_job_analise_erros';

function sanitizeFileName(n) {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '-').toLowerCase();
}

const ROTULOS = {
  negacao_excecao: 'Negação / "exceto"', absolutos: 'Palavras absolutas', termos_parecidos: 'Termos parecidos',
  localizacao_lateralidade: 'Localização / lateralidade', alternativa_parcial: 'Alternativa parcialmente certa',
  interpretacao_imagem: 'Interpretação de imagem', inversao_causa_efeito: 'Causa × efeito invertidos',
  excesso_de_detalhe: 'Distrator com dado verdadeiro', outra: 'Outra',
  lacuna_conteudo: 'Lacuna de conteúdo', confusao_conceitos: 'Confusão entre conceitos',
  falha_leitura_atencao: 'Falha de leitura/atenção', chute_ou_incerteza: 'Chute / incerteza', raciocinio_incompleto: 'Raciocínio incompleto',
  lembrar: 'Lembrar', compreender: 'Compreender', aplicar: 'Aplicar', analisar: 'Analisar',
};
const r = (k) => ROTULOS[k] || k;

function Barras({ titulo, itens }) {
  if (!itens?.length) return null;
  const max = Math.max(...itens.map(i => i.qtd));
  return (
    <div className="mb-5">
      <h3 className="font-mono text-xs uppercase text-stone-500 mb-2">{titulo}</h3>
      {itens.map(i => (
        <div key={i.nome} className="mb-1.5">
          <div className="flex justify-between text-sm"><span>{r(i.nome)}</span><span className="font-mono">{i.qtd}</span></div>
          <div className="h-2 bg-stone-200 rounded"><div className="h-2 bg-slate-900 rounded" style={{ width: `${(i.qtd / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

// Renderizador mínimo de Markdown (títulos, listas e negrito)
function Markdown({ texto }) {
  const negrito = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p);
  return (
    <div className="text-sm leading-relaxed">
      {texto.split('\n').map((l, i) => {
        if (l.startsWith('## ')) return <h2 key={i} className="font-bold mt-4 mb-1">{l.slice(3)}</h2>;
        if (/^\s*[-*] /.test(l)) return <li key={i} className="ml-5 list-disc">{negrito(l.replace(/^\s*[-*] /, ''))}</li>;
        if (!l.trim()) return <div key={i} className="h-2" />;
        return <p key={i}>{negrito(l)}</p>;
      })}
    </div>
  );
}

export default function AnaliseErros() {
  const { user, loading } = useAuth();
  const [prova, setProva] = useState(null);
  const [gabarito, setGabarito] = useState(null);
  const [minhas, setMinhas] = useState(null);
  const [gabaritoTexto, setGabaritoTexto] = useState('');
  const [respostasTexto, setRespostasTexto] = useState('');
  const [etapa, setEtapa] = useState('');
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);
  const [mostrarErros, setMostrarErros] = useState(false);

  function acompanhar(jobId) {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/extrair-status?id=${jobId}`);
        const data = await res.json();
        if (data.error || data.status === 'erro') {
          clearInterval(t); localStorage.removeItem(CHAVE_JOB);
          setErro(data.error || data.erro || 'Erro desconhecido'); setEtapa('');
        } else if (data.status === 'concluido') {
          clearInterval(t); localStorage.removeItem(CHAVE_JOB);
          setResultado(data.resultado); setEtapa('');
        }
      } catch (e) { /* tenta de novo no próximo ciclo */ }
    }, 4000);
    return t;
  }

  // Retoma a análise se a página for recarregada
  useEffect(() => {
    const id = localStorage.getItem(CHAVE_JOB);
    if (!id) return;
    setEtapa('Retomando análise em andamento...');
    const t = acompanhar(id);
    return () => clearInterval(t);
  }, []);

  async function subir(arquivo, papel) {
    const path = `analise-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${sanitizeFileName(arquivo.name)}`;
    const { error } = await supabase.storage.from('provas-temp').upload(path, arquivo, { contentType: arquivo.type || 'application/pdf' });
    if (error) throw new Error(`Falha ao enviar ${arquivo.name}: ${error.message}`);
    return { path, papel };
  }

  async function analisar() {
    setErro(''); setResultado(null);
    if (!prova) { setErro('Envie o PDF da prova.'); return; }
    try {
      setEtapa('Enviando arquivos...');
      const arquivos = [await subir(prova, 'prova')];
      if (gabarito) arquivos.push(await subir(gabarito, 'gabarito'));
      if (minhas) arquivos.push(await subir(minhas, 'minhas_respostas'));
      setEtapa('Analisando com IA (pode levar alguns minutos; pode fechar o app)...');
      const res = await fetch('/api/analisar-erros-iniciar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arquivos, gabaritoTexto, respostasTexto }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      localStorage.setItem(CHAVE_JOB, data.id);
      acompanhar(data.id);
    } catch (e) { setErro(e.message); setEtapa(''); }
  }

  const Campo = ({ label, arquivo, setArquivo }) => (
    <label className="block mb-3">
      <span className="text-sm font-semibold">{label}</span>
      <input type="file" accept="application/pdf,image/*" onChange={e => setArquivo(e.target.files?.[0] || null)} className="block w-full text-sm mt-1" />
      {arquivo && <span className="text-xs text-stone-500">{arquivo.name}</span>}
    </label>
  );

  if (!loading && !user) {
    return (
      <main className="max-w-xl mx-auto p-4">
        <Header />
        <p className="text-sm">Entre na sua conta para usar a análise de erros. <Link href="/login" className="underline">Entrar</Link></p>
      </main>
    );
  }

  const est = resultado?.estatisticas;

  return (
    <main className="max-w-xl mx-auto p-4">
      <Header />
      <Link href="/" className="text-xs underline text-stone-500">← Voltar</Link>
      <h1 className="text-xl font-bold my-3">Análise dos meus erros</h1>

      {!resultado && (
        <>
          <Campo label="PDF da prova" arquivo={prova} setArquivo={setProva} />
          <p className="text-xs text-stone-500 mb-4">
            O ideal é um PDF que já mostre o gabarito e as alternativas que você marcou. Se não mostrar, adicione abaixo (opcional).
          </p>
          <details className="mb-4">
            <summary className="text-sm underline cursor-pointer">Adicionar gabarito / minhas respostas (opcional)</summary>
            <div className="mt-3">
              <Campo label="Gabarito oficial (PDF ou foto)" arquivo={gabarito} setArquivo={setGabarito} />
              <input value={gabaritoTexto} onChange={e => setGabaritoTexto(e.target.value)} placeholder="ou digite o gabarito: ABCDDAB..." className="w-full border rounded p-2 text-sm mb-3 font-mono" />
              <Campo label="O que eu marquei (PDF ou foto)" arquivo={minhas} setArquivo={setMinhas} />
              <input value={respostasTexto} onChange={e => setRespostasTexto(e.target.value)} placeholder="ou digite o que marcou: ABCDDAB..." className="w-full border rounded p-2 text-sm font-mono" />
            </div>
          </details>
          <button onClick={analisar} disabled={!!etapa} className="w-full bg-slate-900 text-white rounded p-3 disabled:opacity-50">
            {etapa || 'Analisar meus erros'}
          </button>
          {erro && <p className="text-red-700 text-sm mt-3">{erro}</p>}
        </>
      )}

      {resultado && est && (
        <>
          <p className="text-sm mb-4">{est.acertos} acertos e {est.erros} erros em {est.total} questões.</p>
          <Barras titulo="Erros por pegadinha" itens={est.por_pegadinha} />
          <Barras titulo="Erros por causa provável" itens={est.por_causa} />
          <Barras titulo="Erros por nível cognitivo" itens={est.por_bloom} />
          <div className="mb-5">
            <h3 className="font-mono text-xs uppercase text-stone-500 mb-2">Taxa de erro por área</h3>
            {est.por_area.map(a => (
              <div key={a.area} className="flex justify-between text-sm"><span>{a.area}</span><span className="font-mono">{a.erros}/{a.total} ({Math.round(a.taxa_erro * 100)}%)</span></div>
            ))}
          </div>
          <div className="border-t pt-4 mb-4"><Markdown texto={resultado.relatorio} /></div>
          <button onClick={() => setMostrarErros(v => !v)} className="text-sm underline mb-3">{mostrarErros ? 'Ocultar' : 'Ver'} erro por erro</button>
          {mostrarErros && resultado.questoes.filter(q => q.acertou === false).map(q => (
            <div key={q.numero} className="border rounded p-3 mb-2 text-sm">
              <div className="font-semibold">Questão {q.numero} · {q.tema}</div>
              <div className="text-xs text-stone-500 mb-1">Marcou {q.marcada} · correta {q.correta} · {r(q.pegadinha)} · {r(q.causa_provavel)}</div>
              <p>{q.por_que_errou}</p>
              <p className="mt-1"><strong>Revisar:</strong> {q.o_que_revisar}</p>
            </div>
          ))}
          <button onClick={() => { setResultado(null); setProva(null); setGabarito(null); setMinhas(null); }} className="w-full border rounded p-3 mt-4">Analisar outra prova</button>
        </>
      )}
    </main>
  );
}
