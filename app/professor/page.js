'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabaseClient';

const DIFICULDADES = [
  { value: '', label: '— não classificado —' },
  { value: 'Fácil', label: 'Fácil' },
  { value: 'Médio', label: 'Médio' },
  { value: 'Difícil', label: 'Difícil' },
];

const CAMPOS_VAZIOS = {
  instituto: '', ano: '', disciplina: '', assunto: '',
  enunciado: '', opcaoA: '', opcaoB: '', opcaoC: '', opcaoD: '', opcaoE: '',
  correta: 'A', explicacao: '', padrao: '', dificuldade: '', numOpcoes: 4,
};

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-stone-100 flex items-start justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-4">
          <h1 className="font-mono text-2xl font-bold tracking-widest text-slate-900">QUESTÕES IF</h1>
          <p className="text-xs text-stone-500 mt-1">área do professor</p>
        </div>
        {children}
      </div>
    </div>
  );
}

// Componente de campo isolado para evitar bug de foco
function Campo({ label, valor, onChange, placeholder, textarea, type }) {
  return (
    <div>
      <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">{label}</label>
      {textarea ? (
        <textarea
          value={valor}
          onChange={onChange}
          placeholder={placeholder}
          rows={3}
          className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-none"
        />
      ) : (
        <input
          type={type || 'text'}
          value={valor}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
        />
      )}
    </div>
  );
}

// Formulário de revisão/edição de uma questão
function FormQuestao({ q, idx, total, onChange, onClassificar, classificando, padroesDisponiveis }) {
  const letras = q.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
  return (
    <div className="bg-white border-2 border-slate-900 rounded-2xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-mono text-stone-400 uppercase">Questão {idx + 1} de {total}</span>
        <button
          onClick={() => onClassificar(idx)}
          disabled={classificando === idx}
          className="text-xs font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-lg disabled:opacity-50"
        >
          {classificando === idx ? 'Analisando...' : '✦ Sugerir com IA'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Campo label="Instituto" valor={q.instituto} onChange={e => onChange(idx, 'instituto', e.target.value)} placeholder="Ex: IFSP" />
        <Campo label="Ano" type="number" valor={q.ano} onChange={e => onChange(idx, 'ano', e.target.value)} placeholder="Ex: 2024" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Disciplina" valor={q.disciplina} onChange={e => onChange(idx, 'disciplina', e.target.value)} placeholder="Ex: Matemática" />
        <Campo label="Assunto" valor={q.assunto} onChange={e => onChange(idx, 'assunto', e.target.value)} placeholder="Ex: Frações" />
      </div>
      <Campo label="Enunciado" textarea valor={q.enunciado} onChange={e => onChange(idx, 'enunciado', e.target.value)} placeholder="Enunciado da questão" />

      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Alternativas</label>
        <div className="space-y-2">
          {letras.map(letra => (
            <div key={letra} className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-slate-900 text-slate-900 font-mono font-bold text-sm flex-shrink-0">{letra}</span>
              <input
                type="text"
                value={q[`opcao${letra}`] || ''}
                onChange={e => onChange(idx, `opcao${letra}`, e.target.value)}
                placeholder={`Alternativa ${letra}`}
                className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Alternativa correta</label>
        <select
          value={q.correta}
          onChange={e => onChange(idx, 'correta', e.target.value)}
          className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          {letras.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <Campo label="Explicação (opcional)" textarea valor={q.explicacao} onChange={e => onChange(idx, 'explicacao', e.target.value)} placeholder="Deixe em branco para a IA gerar" />

      <div className="border border-stone-200 rounded-xl p-3 space-y-2 bg-stone-50">
        <p className="text-xs font-mono uppercase tracking-wider text-stone-400">Classificação</p>
        {q.dicaIA && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">💡 {q.dicaIA}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Padrão</label>
            <input
              list={`padroes-lista-${idx}`}
              value={q.padrao || ''}
              onChange={e => onChange(idx, 'padrao', e.target.value)}
              placeholder="— não classificado —"
              className="w-full border border-stone-300 rounded-lg p-2 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <datalist id={`padroes-lista-${idx}`}>
              {(padroesDisponiveis || []).map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Dificuldade</label>
            <select value={q.dificuldade} onChange={e => onChange(idx, 'dificuldade', e.target.value)} className="w-full border border-stone-300 rounded-lg p-2 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
              {DIFICULDADES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Professor() {
  const { user, profile, loading } = useAuth();

  // Modo: 'escolher' | 'manual' | 'texto' | 'pdf' | 'revisar' | 'editar'
  const [modo, setModo] = useState('escolher');
  const [form, setForm] = useState({ ...CAMPOS_VAZIOS });
  const [imagem, setImagem] = useState(null);
  const [preview, setPreview] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [classificando, setClassificando] = useState(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Modo texto/pdf
  const [textoProva, setTextoProva] = useState('');
  const [arquivoPdf, setArquivoPdf] = useState(null);
  const [arquivoImagem, setArquivoImagem] = useState(null);
  const [extraindo, setExtraindo] = useState(false);

  // Revisão em lote
  const [questoesLote, setQuestoesLote] = useState([]);
  const [indiceRevisao, setIndiceRevisao] = useState(0);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [gabarito, setGabarito] = useState('');

  // Editar questão já salva
  const [questoesSalvas, setQuestoesSalvas] = useState([]);
  const [buscandoSalvas, setBuscandoSalvas] = useState(false);
  const [questaoEditando, setQuestaoEditando] = useState(null);

  // Biblioteca de padrões — vem do banco, cresce conforme a IA classifica
  const [padroesDisponiveis, setPadroesDisponiveis] = useState([]);

  // Busca padrões existentes ao carregar a tela
  useEffect(() => {
    supabase.from('padroes').select('nome').order('nome').then(({ data }) => {
      if (data) setPadroesDisponiveis(data.map(p => p.nome));
    });
  }, []);

  const atualizar = useCallback((campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }));
  }, []);

  const atualizarLote = useCallback((idx, campo, valor) => {
    setQuestoesLote(qs => qs.map((q, i) => i === idx ? { ...q, [campo]: valor } : q));
  }, []);

  if (loading) return <Shell><div className="bg-white border-2 border-slate-900 rounded-2xl p-5 text-sm text-stone-500">Carregando...</div></Shell>;

  if (!user) return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        <p className="text-sm text-stone-700 mb-4">Você precisa entrar com uma conta de professor aprovada.</p>
        <Link href="/login" className="w-full block text-center bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg">Entrar ▸</Link>
        <p className="text-xs text-stone-400 mt-3 text-center"><Link href="/" className="underline">◂ voltar</Link></p>
      </div>
    </Shell>
  );

  if (!profile?.is_professor) return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        <p className="text-sm text-stone-700">{profile?.quer_ser_professor ? 'Seu pedido está aguardando aprovação.' : `Conta sem acesso de professor (${user.email}).`}</p>
        <p className="text-xs text-stone-400 mt-4"><Link href="/" className="underline">◂ voltar</Link></p>
      </div>
    </Shell>
  );

  // ── Classificar com IA (manual ou lote) ──
  async function classificarComIA(idx) {
    const q = idx === 'manual' ? form : questoesLote[idx];
    if (!q.enunciado?.trim()) { setErro('Preencha o enunciado antes.'); return; }
    setClassificando(idx);
    setErro('');
    try {
      const letras = q.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
      const opcoes = letras.map(l => q[`opcao${l}`]).filter(Boolean);
      const res = await fetch('/api/classificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enunciado: q.enunciado, opcoes, disciplina: q.disciplina, assunto: q.assunto }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (idx === 'manual') {
        setForm(f => ({
          ...f,
          padrao: data.padrao || f.padrao,
          assunto: f.assunto?.trim() ? f.assunto : (data.assunto || f.assunto),
          dificuldade: data.dificuldade || f.dificuldade,
          dicaIA: data.justificativa,
        }));
      } else {
        setQuestoesLote(qs => qs.map((item, i) => i === idx ? {
          ...item,
          padrao: data.padrao || item.padrao,
          assunto: item.assunto?.trim() ? item.assunto : (data.assunto || item.assunto),
          dificuldade: data.dificuldade || item.dificuldade,
          dicaIA: data.justificativa,
        } : item));
      }
      // Se a IA criou um padrão novo, atualiza a lista local para aparecer no autocomplete
      if (data.padrao_novo && data.padrao && !padroesDisponiveis.includes(data.padrao)) {
        setPadroesDisponiveis(prev => [...prev, data.padrao].sort());
      }
    } catch (e) { setErro('Erro IA: ' + e.message); }
    setClassificando(null);
  }

  // ── Extrair questões de texto/imagem/PDF ──
  async function extrairQuestoes() {
    setExtraindo(true);
    setErro('');
    try {
      let res;
      if (arquivoImagem) {
        const fd = new FormData();
        fd.append('imagem', arquivoImagem);
        res = await fetch('/api/extrair', { method: 'POST', body: fd });
      } else if (textoProva.trim()) {
        res = await fetch('/api/extrair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: textoProva }),
        });
      } else {
        setErro('Cole o texto da prova ou envie uma imagem/foto.');
        setExtraindo(false);
        return;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.questoes?.length) throw new Error('Nenhuma questão encontrada.');

      // Montar lote com dados extraídos
      const lote = data.questoes.map(q => {
        const letras = q.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
        const obj = {
          ...CAMPOS_VAZIOS,
          instituto: data.instituto || '',
          ano: data.ano ? String(data.ano) : '',
          disciplina: data.disciplina || '',
          enunciado: q.enunciado || '',
          numOpcoes: q.numOpcoes || 4,
          correta: 'A',
        };
        letras.forEach((l, i) => { obj[`opcao${l}`] = q.opcoes?.[i] || ''; });
        return obj;
      });

      setQuestoesLote(lote);
      setIndiceRevisao(0);
      setGabarito('');
      setModo('revisar');
    } catch (e) { setErro('Erro ao extrair: ' + e.message); }
    setExtraindo(false);
  }

  // ── Aplicar gabarito ao lote ──
  function aplicarGabarito() {
    const letras = gabarito.toUpperCase().replace(/[^ABCDE]/g, '');
    setQuestoesLote(qs => qs.map((q, i) => letras[i] ? { ...q, correta: letras[i] } : q));
  }

  // ── Salvar questão manual ──
  async function salvarManual() {
    setErro(''); setSucesso('');
    const ano = Number(form.ano);
    if (!form.instituto.trim() || !form.disciplina.trim() || !form.assunto.trim() || !form.enunciado.trim()) { setErro('Preencha instituto, disciplina, assunto e enunciado.'); return; }
    if (!ano || ano < 1900 || ano > 2100) { setErro('Informe um ano válido.'); return; }
    const letras = form.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
    const opcoes = letras.map(l => form[`opcao${l}`]?.trim());
    if (opcoes.some(o => !o)) { setErro(`Preencha as ${letras.length} alternativas.`); return; }

    setSalvando(true);
    try {
      let imagem_url = null;
      if (imagem) {
        const nomeArquivo = `${Date.now()}-${imagem.name.replace(/\s+/g, '-')}`;
        const { error: erroUpload } = await supabase.storage.from('imagens-questoes').upload(nomeArquivo, imagem);
        if (erroUpload) throw new Error(`Falha ao enviar imagem: ${erroUpload.message}`);
        const { data: urlData } = supabase.storage.from('imagens-questoes').getPublicUrl(nomeArquivo);
        imagem_url = urlData.publicUrl;
      }
      const { data: inserida, error } = await supabase.from('questoes').insert({
        instituto: form.instituto.trim(), ano, disciplina: form.disciplina.trim(),
        assunto: form.assunto.trim(), enunciado: form.enunciado.trim(), opcoes,
        correta: form.correta, explicacao: form.explicacao.trim() || null,
        imagem_url, padrao: form.padrao || null, dificuldade: form.dificuldade || null,
      }).select('id').single();
      if (error) throw new Error(error.message);

      let msgProva = '';
      try {
        const res = await fetch('/api/vincular-prova', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instituto: form.instituto.trim(), ano, questao_ids: [inserida.id] }),
        });
        const data = await res.json();
        if (data.titulo) msgProva = ` Vinculada à prova: ${data.titulo}${data.criada ? ' (nova)' : ''}.`;
      } catch (e) { /* não bloqueia */ }

      setForm({ ...CAMPOS_VAZIOS });
      setImagem(null); setPreview(null);
      setSucesso('Questão salva com sucesso!' + msgProva);
    } catch (e) { setErro(e.message); }
    setSalvando(false);
  }

  // ── Salvar lote ──
  async function salvarLote() {
    setSalvandoLote(true); setErro('');
    let salvos = 0;
    const idsPorProva = {}; // agrupa questao_id por "instituto|ano"

    for (const q of questoesLote) {
      const ano = Number(q.ano);
      if (!q.instituto?.trim() || !q.disciplina?.trim() || !q.enunciado?.trim() || !ano) continue;
      const letras = q.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
      const opcoes = letras.map(l => q[`opcao${l}`]?.trim()).filter(Boolean);
      if (opcoes.length < 4) continue;

      const { data: inserida, error } = await supabase.from('questoes').insert({
        instituto: q.instituto.trim(), ano, disciplina: q.disciplina.trim(),
        assunto: q.assunto?.trim() || '', enunciado: q.enunciado.trim(), opcoes,
        correta: q.correta, explicacao: q.explicacao?.trim() || null,
        padrao: q.padrao || null, dificuldade: q.dificuldade || null,
      }).select('id').single();

      if (error || !inserida) continue;
      salvos++;

      const chave = `${q.instituto.trim()}|${ano}`;
      if (!idsPorProva[chave]) idsPorProva[chave] = { instituto: q.instituto.trim(), ano, ids: [] };
      idsPorProva[chave].ids.push(inserida.id);
    }

    // Auto-cria/vincula a prova para cada grupo instituto+ano encontrado
    let provasInfo = [];
    for (const chave in idsPorProva) {
      const grupo = idsPorProva[chave];
      try {
        const res = await fetch('/api/vincular-prova', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instituto: grupo.instituto, ano: grupo.ano, questao_ids: grupo.ids }),
        });
        const data = await res.json();
        if (data.titulo) provasInfo.push(`${data.titulo}${data.criada ? ' (nova)' : ''}`);
      } catch (e) { /* não bloqueia o salvamento das questões */ }
    }

    setSalvandoLote(false);
    const msgProvas = provasInfo.length ? ` Vinculadas à prova: ${provasInfo.join(', ')}.` : '';
    setSucesso(`${salvos} questão(ões) salva(s) com sucesso!${msgProvas}`);
    setModo('escolher');
    setQuestoesLote([]);
  }

  // ── Buscar questões salvas para editar ──
  async function buscarQuestoesSalvas() {
    setBuscandoSalvas(true);
    const { data } = await supabase.from('questoes').select('*').order('id', { ascending: false }).limit(50);
    setQuestoesSalvas(data || []);
    setBuscandoSalvas(false);
  }

  // ── Salvar edição ──
  async function salvarEdicao() {
    if (!questaoEditando) return;
    setSalvando(true); setErro('');
    const q = questaoEditando;
    const letras = q.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
    const opcoes = letras.map(l => q[`opcao${l}`]?.trim()).filter(Boolean);
    const { error } = await supabase.from('questoes').update({
      instituto: q.instituto, ano: Number(q.ano), disciplina: q.disciplina,
      assunto: q.assunto, enunciado: q.enunciado, opcoes,
      correta: q.correta, explicacao: q.explicacao || null,
      padrao: q.padrao || null, dificuldade: q.dificuldade || null,
    }).eq('id', q.id);
    if (error) { setErro(error.message); } else { setSucesso('Questão atualizada!'); setQuestaoEditando(null); setModo('editar'); }
    setSalvando(false);
  }

  // ════════════════════════════════════════
  // TELAS
  // ════════════════════════════════════════

  // Tela: escolher modo
  if (modo === 'escolher') return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        <div className="flex justify-between items-center mb-5">
          <Link href="/" className="text-xs text-stone-400 font-mono underline">◂ voltar</Link>
          <span className="text-xs font-mono text-stone-500 uppercase tracking-wider">Área do professor</span>
        </div>
        {sucesso && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-xs text-emerald-700">{sucesso}</div>}
        <p className="text-sm text-stone-600 mb-4">Como você quer adicionar questões?</p>
        <div className="space-y-3">
          <button onClick={() => { setModo('manual'); setErro(''); setSucesso(''); setForm({...CAMPOS_VAZIOS}); }} className="w-full text-left border-2 border-slate-900 rounded-xl p-4 hover:bg-stone-50 transition">
            <p className="font-mono font-bold text-sm text-slate-900">✏️ Manual</p>
            <p className="text-xs text-stone-500 mt-1">Digita uma questão por vez com sugestão de IA</p>
          </button>
          <button onClick={() => { setModo('texto'); setErro(''); setSucesso(''); setTextoProva(''); setArquivoImagem(null); }} className="w-full text-left border-2 border-slate-900 rounded-xl p-4 hover:bg-stone-50 transition">
            <p className="font-mono font-bold text-sm text-slate-900">📄 Texto ou foto da prova</p>
            <p className="text-xs text-stone-500 mt-1">Cola o texto ou manda uma foto — a IA extrai todas as questões</p>
          </button>
          <button onClick={() => { setModo('editar'); setErro(''); setSucesso(''); buscarQuestoesSalvas(); }} className="w-full text-left border-2 border-slate-900 rounded-xl p-4 hover:bg-stone-50 transition">
            <p className="font-mono font-bold text-sm text-slate-900">✏️ Editar questão salva</p>
            <p className="text-xs text-stone-500 mt-1">Corrigir ou atualizar questões já cadastradas</p>
          </button>
        </div>
      </div>
    </Shell>
  );

  // Tela: manual
  if (modo === 'manual') {
    const letras = form.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
    return (
      <Shell>
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <button onClick={() => setModo('escolher')} className="text-xs text-stone-400 font-mono underline">◂ voltar</button>
            <span className="text-xs font-mono text-stone-500 uppercase">Nova questão</span>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Instituto" valor={form.instituto} onChange={e => atualizar('instituto', e.target.value)} placeholder="Ex: IFSP" />
              <Campo label="Ano" type="number" valor={form.ano} onChange={e => atualizar('ano', e.target.value)} placeholder="Ex: 2024" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Disciplina" valor={form.disciplina} onChange={e => atualizar('disciplina', e.target.value)} placeholder="Ex: Matemática" />
              <Campo label="Assunto" valor={form.assunto} onChange={e => atualizar('assunto', e.target.value)} placeholder="Ex: Frações" />
            </div>
            <Campo label="Enunciado" textarea valor={form.enunciado} onChange={e => atualizar('enunciado', e.target.value)} placeholder="Digite o enunciado" />

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Imagem (opcional)</label>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; setImagem(f||null); setPreview(f ? URL.createObjectURL(f) : null); }} className="w-full text-sm text-stone-600 border border-stone-300 rounded-lg p-2 bg-stone-50" />
              {preview && <img src={preview} alt="preview" className="w-full max-w-xs mx-auto my-3 rounded-lg border border-stone-200" />}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-mono uppercase tracking-wider text-stone-500">Alternativas</label>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => atualizar('numOpcoes', 4)} className={`font-mono px-2 py-0.5 rounded border ${form.numOpcoes===4 ? 'bg-slate-900 text-white border-slate-900' : 'border-stone-300 text-stone-500'}`}>4</button>
                  <button onClick={() => atualizar('numOpcoes', 5)} className={`font-mono px-2 py-0.5 rounded border ${form.numOpcoes===5 ? 'bg-slate-900 text-white border-slate-900' : 'border-stone-300 text-stone-500'}`}>5</button>
                </div>
              </div>
              <div className="space-y-2">
                {letras.map(letra => (
                  <div key={letra} className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-slate-900 font-mono font-bold text-sm flex-shrink-0">{letra}</span>
                    <input type="text" value={form[`opcao${letra}`]||''} onChange={e => atualizar(`opcao${letra}`, e.target.value)} placeholder={`Alternativa ${letra}`} className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Alternativa correta</label>
              <select value={form.correta} onChange={e => atualizar('correta', e.target.value)} className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                {letras.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <Campo label="Explicação (opcional)" textarea valor={form.explicacao} onChange={e => atualizar('explicacao', e.target.value)} placeholder="Deixe em branco para a IA gerar" />

            <div className="border border-stone-200 rounded-xl p-3 space-y-3 bg-stone-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-stone-500">Classificação</span>
                <button onClick={() => classificarComIA('manual')} disabled={classificando==='manual'} className="text-xs font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-lg disabled:opacity-50">
                  {classificando==='manual' ? 'Analisando...' : '✦ Sugerir com IA'}
                </button>
              </div>
              {form.dicaIA && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">💡 {form.dicaIA}</p>}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Padrão</label>
                  <input
                    list="padroes-lista-manual"
                    value={form.padrao || ''}
                    onChange={e => atualizar('padrao', e.target.value)}
                    placeholder="— não classificado —"
                    className="w-full border border-stone-300 rounded-lg p-2 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <datalist id="padroes-lista-manual">
                    {padroesDisponiveis.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Dificuldade</label>
                  <select value={form.dificuldade} onChange={e => atualizar('dificuldade', e.target.value)} className="w-full border border-stone-300 rounded-lg p-2 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                    {DIFICULDADES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 text-xs text-red-700">{erro}</div>}
          {sucesso && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-4 text-xs text-emerald-700">{sucesso}</div>}
          <button onClick={salvarManual} disabled={salvando} className="w-full mt-4 bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition">
            {salvando ? 'Salvando...' : 'Salvar questão ▸'}
          </button>
        </div>
      </Shell>
    );
  }

  // Tela: texto ou foto
  if (modo === 'texto') return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        <div className="flex justify-between items-center mb-3">
          <button onClick={() => setModo('escolher')} className="text-xs text-stone-400 font-mono underline">◂ voltar</button>
          <span className="text-xs font-mono text-stone-500 uppercase">Importar prova</span>
        </div>
        <p className="text-sm text-stone-600 mb-4">Cole o texto da prova <span className="text-stone-400">ou</span> envie uma foto/imagem.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Foto ou imagem da prova</label>
            <input type="file" accept="image/*" onChange={e => { setArquivoImagem(e.target.files?.[0]||null); if(e.target.files?.[0]) setTextoProva(''); }} className="w-full text-sm text-stone-600 border border-stone-300 rounded-lg p-2 bg-stone-50" />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-xs text-stone-400 font-mono">ou</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Texto da prova</label>
            <textarea
              value={textoProva}
              onChange={e => { setTextoProva(e.target.value); if(e.target.value) setArquivoImagem(null); }}
              placeholder="Cole aqui o texto completo da prova..."
              rows={8}
              className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Gabarito (opcional)</label>
            <input
              type="text"
              value={gabarito}
              onChange={e => setGabarito(e.target.value)}
              placeholder="Ex: ABCDABCDAB... (uma letra por questão)"
              className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <p className="text-xs text-stone-400 mt-1">Se não informar agora, poderá preencher na revisão.</p>
          </div>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 text-xs text-red-700">{erro}</div>}

        <button onClick={extrairQuestoes} disabled={extraindo} className="w-full mt-4 bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition">
          {extraindo ? 'Extraindo questões com IA...' : 'Extrair questões ▸'}
        </button>
      </div>
    </Shell>
  );

  // Tela: revisar lote
  if (modo === 'revisar') {
    const q = questoesLote[indiceRevisao];
    return (
      <Shell>
        <div className="space-y-3">
          <div className="bg-white border-2 border-slate-900 rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <button onClick={() => setModo('texto')} className="text-xs text-stone-400 font-mono underline">◂ voltar</button>
              <span className="text-xs font-mono text-stone-500">{questoesLote.length} questões extraídas</span>
            </div>

            {gabarito && (
              <div className="mt-3">
                <button onClick={aplicarGabarito} className="text-xs bg-amber-100 text-amber-800 border border-amber-300 font-mono px-3 py-1 rounded-lg">
                  Aplicar gabarito às questões
                </button>
              </div>
            )}
          </div>

          {/* Navegação entre questões */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {questoesLote.map((_, i) => (
              <button key={i} onClick={() => setIndiceRevisao(i)} className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-mono font-bold border-2 transition ${i===indiceRevisao ? 'bg-slate-900 text-white border-slate-900' : 'border-stone-300 text-stone-600 bg-white'}`}>
                {i+1}
              </button>
            ))}
          </div>

          {q && (
            <FormQuestao
              q={q}
              idx={indiceRevisao}
              total={questoesLote.length}
              onChange={atualizarLote}
              onClassificar={classificarComIA}
              classificando={classificando}
              padroesDisponiveis={padroesDisponiveis}
            />
          )}

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erro}</div>}

          <button onClick={salvarLote} disabled={salvandoLote} className="w-full bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition">
            {salvandoLote ? 'Salvando...' : `Salvar todas as ${questoesLote.length} questões ▸`}
          </button>
        </div>
      </Shell>
    );
  }

  // Tela: editar questões salvas
  if (modo === 'editar' && !questaoEditando) return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setModo('escolher')} className="text-xs text-stone-400 font-mono underline">◂ voltar</button>
          <span className="text-xs font-mono text-stone-500 uppercase">Editar questões</span>
        </div>
        {sucesso && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-xs text-emerald-700">{sucesso}</div>}
        {buscandoSalvas ? (
          <p className="text-sm text-stone-400">Carregando...</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {questoesSalvas.map(q => (
              <button key={q.id} onClick={() => {
                const letras = (q.opcoes?.length === 5) ? ['A','B','C','D','E'] : ['A','B','C','D'];
                const obj = { ...q, numOpcoes: q.opcoes?.length || 4 };
                letras.forEach((l, i) => { obj[`opcao${l}`] = q.opcoes?.[i] || ''; });
                setQuestaoEditando(obj);
                setErro(''); setSucesso('');
              }} className="w-full text-left border border-stone-200 rounded-xl p-3 hover:bg-stone-50 transition">
                <p className="text-xs font-mono text-stone-400">{q.instituto} · {q.ano} · {q.disciplina}</p>
                <p className="text-sm text-slate-900 mt-1 line-clamp-2">{q.enunciado}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );

  // Tela: editando questão específica
  if (modo === 'editar' && questaoEditando) return (
    <Shell>
      <div className="space-y-3">
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-4 flex justify-between items-center">
          <button onClick={() => { setQuestaoEditando(null); }} className="text-xs text-stone-400 font-mono underline">◂ lista</button>
          <span className="text-xs font-mono text-stone-500 uppercase">Editando questão #{questaoEditando.id}</span>
        </div>

        <FormQuestao
          q={questaoEditando}
          idx={0}
          total={1}
          onChange={(_, campo, valor) => setQuestaoEditando(q => ({ ...q, [campo]: valor }))}
          onClassificar={async () => {
            setClassificando(0);
            try {
              const letras = questaoEditando.numOpcoes === 5 ? ['A','B','C','D','E'] : ['A','B','C','D'];
              const opcoes = letras.map(l => questaoEditando[`opcao${l}`]).filter(Boolean);
              const res = await fetch('/api/classificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enunciado: questaoEditando.enunciado, opcoes, disciplina: questaoEditando.disciplina, assunto: questaoEditando.assunto }) });
              const data = await res.json();
              setQuestaoEditando(q => ({
                ...q,
                padrao: data.padrao || q.padrao,
                assunto: q.assunto?.trim() ? q.assunto : (data.assunto || q.assunto),
                dificuldade: data.dificuldade || q.dificuldade,
                dicaIA: data.justificativa,
              }));
              if (data.padrao_novo && data.padrao && !padroesDisponiveis.includes(data.padrao)) {
                setPadroesDisponiveis(prev => [...prev, data.padrao].sort());
              }
            } catch(e) { setErro(e.message); }
            setClassificando(null);
          }}
          classificando={classificando}
          padroesDisponiveis={padroesDisponiveis}
        />

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erro}</div>}
        {sucesso && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">{sucesso}</div>}

        <button onClick={salvarEdicao} disabled={salvando} className="w-full bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition">
          {salvando ? 'Salvando...' : 'Salvar alterações ▸'}
        </button>
      </div>
    </Shell>
  );

  return null;
}
