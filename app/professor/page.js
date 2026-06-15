'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabaseClient';

const LETRAS = ['A', 'B', 'C', 'D'];

const CAMPOS_VAZIOS = {
  instituto: '',
  ano: '',
  disciplina: '',
  assunto: '',
  enunciado: '',
  opcaoA: '',
  opcaoB: '',
  opcaoC: '',
  opcaoD: '',
  correta: 'A',
  explicacao: '',
};

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-stone-100 flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-4">
          <h1 className="font-mono text-2xl font-bold tracking-widest text-slate-900">QUESTÕES IF</h1>
          <p className="text-xs text-stone-500 mt-1">área do professor</p>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Aba: Cadastro manual ────────────────────────────────────────────────────

function AbaManual({ user }) {
  const [form, setForm] = useState(CAMPOS_VAZIOS);
  const [imagem, setImagem] = useState(null);
  const [preview, setPreview] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function escolherImagem(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) { setImagem(null); setPreview(null); return; }
    setImagem(arquivo);
    setPreview(URL.createObjectURL(arquivo));
  }

  async function salvar() {
    setErro(''); setSucesso(false);
    const ano = Number(form.ano);
    if (!form.instituto.trim() || !form.disciplina.trim() || !form.assunto.trim() || !form.enunciado.trim()) {
      setErro('Preencha instituto, disciplina, assunto e enunciado.'); return;
    }
    if (!ano || ano < 1900 || ano > 2100) { setErro('Informe um ano válido.'); return; }
    const opcoes = [form.opcaoA, form.opcaoB, form.opcaoC, form.opcaoD].map((o) => o.trim());
    if (opcoes.some((o) => !o)) { setErro('Preencha as quatro alternativas.'); return; }

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
      const { error: erroInsert } = await supabase.from('questoes').insert({
        instituto: form.instituto.trim(), ano,
        disciplina: form.disciplina.trim(), assunto: form.assunto.trim(),
        enunciado: form.enunciado.trim(), opcoes, correta: form.correta,
        explicacao: form.explicacao.trim() || null, imagem_url,
      });
      if (erroInsert) throw new Error(erroInsert.message);
      setForm(CAMPOS_VAZIOS); setImagem(null); setPreview(null); setSucesso(true);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.');
    }
    setSalvando(false);
  }

  const Campo = ({ label, valor, onChange, placeholder, textarea, type }) => (
    <div>
      <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">{label}</label>
      {textarea ? (
        <textarea value={valor} onChange={onChange} placeholder={placeholder} rows={3}
          className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-none" />
      ) : (
        <input type={type || 'text'} value={valor} onChange={onChange} placeholder={placeholder}
          className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600" />
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Instituto" valor={form.instituto} onChange={(e) => atualizar('instituto', e.target.value)} placeholder="Ex: IFBA" />
        <Campo label="Ano" type="number" valor={form.ano} onChange={(e) => atualizar('ano', e.target.value)} placeholder="Ex: 2024" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Disciplina" valor={form.disciplina} onChange={(e) => atualizar('disciplina', e.target.value)} placeholder="Ex: Matemática" />
        <Campo label="Assunto" valor={form.assunto} onChange={(e) => atualizar('assunto', e.target.value)} placeholder="Ex: Frações" />
      </div>
      <Campo label="Enunciado" textarea valor={form.enunciado} onChange={(e) => atualizar('enunciado', e.target.value)} placeholder="Digite o enunciado" />
      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Imagem (opcional)</label>
        <input type="file" accept="image/*" onChange={escolherImagem}
          className="w-full text-sm text-stone-600 border border-stone-300 rounded-lg p-2 bg-stone-50" />
        {preview && <img src={preview} alt="Preview" className="w-full max-w-xs mx-auto my-3 rounded-lg border border-stone-200" />}
      </div>
      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Alternativas</label>
        <div className="space-y-2">
          {['A', 'B', 'C', 'D'].map((letra) => (
            <div key={letra} className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-slate-900 text-slate-900 font-mono font-bold text-sm flex-shrink-0">{letra}</span>
              <input type="text" value={form[`opcao${letra}`]} onChange={(e) => atualizar(`opcao${letra}`, e.target.value)} placeholder={`Alternativa ${letra}`}
                className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Alternativa correta</label>
        <select value={form.correta} onChange={(e) => atualizar('correta', e.target.value)}
          className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">
          {LETRAS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <Campo label="Explicação (opcional)" textarea valor={form.explicacao} onChange={(e) => atualizar('explicacao', e.target.value)} placeholder="Deixe em branco para a IA gerar" />
      {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erro}</div>}
      {sucesso && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">Questão salva com sucesso!</div>}
      <button onClick={salvar} disabled={salvando}
        className="w-full bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition">
        {salvando ? 'Salvando...' : 'Salvar questão ▸'}
      </button>
    </div>
  );
}

// ─── Aba: Extração por IA ────────────────────────────────────────────────────

function AbaIA({ user }) {
  const [modo, setModo] = useState('escolha'); // escolha | imagens | texto | revisao | salvando | concluido
  const [arquivos, setArquivos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [textoProva, setTextoProva] = useState('');
  const [instituto, setInstituto] = useState('');
  const [ano, setAno] = useState('');
  const [processando, setProcessando] = useState(false);
  const [questoesExtraidas, setQuestoesExtraidas] = useState([]);
  const [erroIA, setErroIA] = useState('');
  const [progresso, setProgresso] = useState('');
  const [salvos, setSalvos] = useState(0);
  const inputRef = useRef();

  function escolherArquivos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setArquivos(files);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
  }

  function removerArquivo(i) {
    setArquivos((a) => a.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function extrairComIA() {
    setErroIA('');
    const temImagens = arquivos.length > 0;
    const temTexto = textoProva.trim().length > 0;
    if (!temImagens && !temTexto) { setErroIA('Adicione imagens ou cole o texto da prova.'); return; }
    if (!instituto.trim()) { setErroIA('Informe o instituto (ex: IFBA).'); return; }
    if (!ano.trim()) { setErroIA('Informe o ano da prova.'); return; }

    setProcessando(true);
    setProgresso('Analisando a prova com IA...');

    try {
      let mensagemConteudo = [];

      if (temImagens) {
        setProgresso('Preparando imagens...');
        for (const arquivo of arquivos) {
          const base64 = await fileToBase64(arquivo);
          const mediaType = arquivo.type || 'image/jpeg';
          mensagemConteudo.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
        }
      }

      const instrucaoTexto = temTexto
        ? `Texto da prova:\n\n${textoProva}`
        : 'As imagens acima contêm as páginas da prova.';

      mensagemConteudo.push({
        type: 'text',
        text: `${instrucaoTexto}

Extraia TODAS as questões de múltipla escolha desta prova do ${instituto} de ${ano}.
Ignore questões de redação, textos introdutórios, instruções e páginas em branco.
Ignore questões que dependam de imagens/gráficos que você não consegue ler claramente.

Para cada questão, identifique:
- O número da questão
- A disciplina (Matemática, Português, História, Geografia, etc.)
- O assunto principal (ex: Frações, Conjunções, Colonização, Clima, etc.)
- O enunciado completo
- As alternativas A, B, C, D e E
- A alternativa correta (se o gabarito estiver disponível; caso contrário, deixe null)

Responda APENAS com um JSON válido, sem nenhum texto antes ou depois, sem blocos de código, no seguinte formato:
{
  "questoes": [
    {
      "numero": 1,
      "disciplina": "Português",
      "assunto": "Interpretação de texto",
      "enunciado": "Sobre o texto acima, é correto afirmar:",
      "opcoes": ["Opção A", "Opção B", "Opção C", "Opção D", "Opção E"],
      "correta": "A"
    }
  ]
}`
      });

      setProgresso('Aguardando resposta da IA (pode levar até 1 min para provas longas)...');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{ role: 'user', content: mensagemConteudo }],
        }),
      });

      const data = await response.json();
      const textoResposta = data.content?.map((b) => b.text || '').join('') || '';

      let parsed;
      try {
        const limpo = textoResposta.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(limpo);
      } catch {
        throw new Error('A IA não retornou um formato válido. Tente novamente.');
      }

      const questoes = (parsed.questoes || []).map((q) => ({
        ...q,
        instituto: instituto.trim(),
        ano: Number(ano),
        correta: q.correta || 'A',
        opcoes: q.opcoes || [],
        selecionada: true,
      }));

      if (questoes.length === 0) throw new Error('Nenhuma questão encontrada. Verifique as imagens ou o texto.');

      setQuestoesExtraidas(questoes);
      setModo('revisao');
    } catch (e) {
      setErroIA(e.message || 'Erro ao processar. Tente novamente.');
    }
    setProcessando(false);
    setProgresso('');
  }

  function toggleQuestao(i) {
    setQuestoesExtraidas((qs) => qs.map((q, idx) => idx === i ? { ...q, selecionada: !q.selecionada } : q));
  }

  function editarCampo(i, campo, valor) {
    setQuestoesExtraidas((qs) => qs.map((q, idx) => idx === i ? { ...q, [campo]: valor } : q));
  }

  async function salvarSelecionadas() {
    const selecionadas = questoesExtraidas.filter((q) => q.selecionada);
    if (selecionadas.length === 0) { setErroIA('Selecione ao menos uma questão.'); return; }

    setModo('salvando');
    let count = 0;
    for (const q of selecionadas) {
      const { error } = await supabase.from('questoes').insert({
        instituto: q.instituto,
        ano: q.ano,
        disciplina: q.disciplina,
        assunto: q.assunto,
        enunciado: q.enunciado,
        opcoes: q.opcoes,
        correta: q.correta,
        explicacao: null,
        imagem_url: null,
      });
      if (!error) count++;
    }
    setSalvos(count);
    setModo('concluido');
  }

  function reiniciar() {
    setModo('escolha');
    setArquivos([]); setPreviews([]); setTextoProva('');
    setInstituto(''); setAno('');
    setQuestoesExtraidas([]); setErroIA(''); setSalvos(0);
  }

  // — Tela de escolha —
  if (modo === 'escolha') return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">Escolha como deseja importar a prova:</p>
      <button onClick={() => setModo('imagens')}
        className="w-full flex items-center gap-3 p-4 bg-white border-2 border-slate-900 rounded-xl text-left hover:bg-stone-50 transition">
        <span className="text-2xl">📷</span>
        <div>
          <p className="text-sm font-bold text-slate-900">Foto ou PDF da prova</p>
          <p className="text-xs text-stone-500">Envie fotos das páginas ou um PDF escaneado</p>
        </div>
      </button>
      <button onClick={() => setModo('texto')}
        className="w-full flex items-center gap-3 p-4 bg-white border-2 border-slate-900 rounded-xl text-left hover:bg-stone-50 transition">
        <span className="text-2xl">📋</span>
        <div>
          <p className="text-sm font-bold text-slate-900">Colar texto da prova</p>
          <p className="text-xs text-stone-500">Cole o texto copiado de um PDF digital</p>
        </div>
      </button>
    </div>
  );

  // — Tela de imagens —
  if (modo === 'imagens') return (
    <div className="space-y-3">
      <button onClick={() => setModo('escolha')} className="text-xs text-stone-400 font-mono underline">◂ voltar</button>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Instituto</label>
          <input value={instituto} onChange={(e) => setInstituto(e.target.value)} placeholder="Ex: IFBA"
            className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Ano</label>
          <input value={ano} onChange={(e) => setAno(e.target.value)} placeholder="Ex: 2018" type="number"
            className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Fotos ou PDF das páginas</label>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple onChange={escolherArquivos} className="hidden" />
        <button onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-stone-300 rounded-xl p-6 text-center text-stone-400 hover:border-emerald-600 hover:text-emerald-700 transition">
          <p className="text-2xl mb-1">+</p>
          <p className="text-xs font-mono uppercase tracking-wider">Toque para adicionar arquivos</p>
        </button>
      </div>
      {previews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-stone-500">{arquivos.length} arquivo{arquivos.length > 1 ? 's' : ''} selecionado{arquivos.length > 1 ? 's' : ''}</p>
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative">
                {arquivos[i]?.type?.startsWith('image/') ? (
                  <img src={src} alt={`Página ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border border-stone-200" />
                ) : (
                  <div className="w-full aspect-square bg-stone-100 rounded-lg border border-stone-200 flex items-center justify-center">
                    <span className="text-xs text-stone-400 font-mono text-center px-1">{arquivos[i]?.name}</span>
                  </div>
                )}
                <button onClick={() => removerArquivo(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {erroIA && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erroIA}</div>}
      {processando && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">{progresso}</div>}
      <button onClick={extrairComIA} disabled={processando}
        className="w-full bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition">
        {processando ? 'Processando...' : 'Extrair questões com IA ▸'}
      </button>
    </div>
  );

  // — Tela de texto —
  if (modo === 'texto') return (
    <div className="space-y-3">
      <button onClick={() => setModo('escolha')} className="text-xs text-stone-400 font-mono underline">◂ voltar</button>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Instituto</label>
          <input value={instituto} onChange={(e) => setInstituto(e.target.value)} placeholder="Ex: IFBA"
            className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Ano</label>
          <input value={ano} onChange={(e) => setAno(e.target.value)} placeholder="Ex: 2018" type="number"
            className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Texto da prova</label>
        <textarea value={textoProva} onChange={(e) => setTextoProva(e.target.value)} rows={10}
          placeholder="Cole aqui o texto completo da prova..."
          className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 resize-none" />
      </div>
      {erroIA && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erroIA}</div>}
      {processando && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">{progresso}</div>}
      <button onClick={extrairComIA} disabled={processando}
        className="w-full bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition">
        {processando ? 'Processando...' : 'Extrair questões com IA ▸'}
      </button>
    </div>
  );

  // — Tela de revisão —
  if (modo === 'revisao') return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">{questoesExtraidas.length} questões encontradas</p>
        <p className="text-xs text-stone-400 font-mono">{questoesExtraidas.filter(q => q.selecionada).length} selecionadas</p>
      </div>
      <p className="text-xs text-stone-500">Revise, edite se necessário e desmarque as que não quiser salvar.</p>
      {questoesExtraidas.map((q, i) => (
        <div key={i} className={`border-2 rounded-xl p-4 transition ${q.selecionada ? 'border-slate-900 bg-white' : 'border-stone-200 bg-stone-50 opacity-50'}`}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="text-xs font-mono font-bold text-slate-900 uppercase tracking-wider">Q{q.numero} · {q.disciplina}</span>
            <button onClick={() => toggleQuestao(i)}
              className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold transition ${q.selecionada ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-stone-300 text-stone-300'}`}>
              {q.selecionada ? '✓' : ''}
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-stone-400 mb-0.5">Assunto</label>
              <input value={q.assunto} onChange={(e) => editarCampo(i, 'assunto', e.target.value)}
                className="w-full border border-stone-200 rounded-lg p-2 bg-stone-50 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-0.5">Enunciado</label>
              <textarea value={q.enunciado} onChange={(e) => editarCampo(i, 'enunciado', e.target.value)} rows={3}
                className="w-full border border-stone-200 rounded-lg p-2 bg-stone-50 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600 resize-none" />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Alternativas</label>
              {(q.opcoes || []).map((op, j) => (
                <div key={j} className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-mono font-bold text-stone-400 w-4">{LETRAS[j]}</span>
                  <input value={op} onChange={(e) => {
                    const novas = [...q.opcoes]; novas[j] = e.target.value;
                    editarCampo(i, 'opcoes', novas);
                  }} className="flex-1 border border-stone-200 rounded-lg p-1.5 bg-stone-50 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-0.5">Correta</label>
              <select value={q.correta} onChange={(e) => editarCampo(i, 'correta', e.target.value)}
                className="border border-stone-200 rounded-lg p-1.5 bg-stone-50 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-600">
                {LETRAS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
      {erroIA && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{erroIA}</div>}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button onClick={reiniciar} className="border-2 border-slate-900 text-slate-900 font-mono uppercase tracking-wider text-xs font-bold py-3 rounded-lg transition hover:bg-stone-50">
          ◂ Recomeçar
        </button>
        <button onClick={salvarSelecionadas}
          className="bg-emerald-700 text-white font-mono uppercase tracking-wider text-xs font-bold py-3 rounded-lg transition">
          Salvar {questoesExtraidas.filter(q => q.selecionada).length} questões ▸
        </button>
      </div>
    </div>
  );

  // — Salvando —
  if (modo === 'salvando') return (
    <div className="text-center py-8">
      <p className="text-sm font-mono text-stone-400 uppercase tracking-wider">Salvando questões...</p>
    </div>
  );

  // — Concluído —
  if (modo === 'concluido') return (
    <div className="text-center py-6 space-y-4">
      <p className="text-4xl">✓</p>
      <p className="text-sm font-bold text-slate-900">{salvos} questão{salvos !== 1 ? 'ões' : ''} salva{salvos !== 1 ? 's' : ''}!</p>
      <p className="text-xs text-stone-500">Já estão disponíveis no banco para os alunos.</p>
      <button onClick={reiniciar}
        className="w-full bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg transition">
        Importar outra prova ▸
      </button>
    </div>
  );

  return null;
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Professor() {
  const { user, profile, loading } = useAuth();
  const [aba, setAba] = useState('ia'); // ia | manual

  if (loading) return <Shell><div className="bg-white border-2 border-slate-900 rounded-2xl p-5 text-sm text-stone-500">Carregando...</div></Shell>;

  if (!user) return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        <p className="text-sm text-stone-700 mb-4">Você precisa entrar com uma conta de professor aprovada.</p>
        <Link href="/login" className="w-full block text-center bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg transition">Entrar ▸</Link>
      </div>
    </Shell>
  );

  if (!profile?.is_professor) return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        {profile?.quer_ser_professor ? (
          <p className="text-sm text-stone-700">Seu pedido está aguardando aprovação. Volte mais tarde.</p>
        ) : (
          <p className="text-sm text-stone-700">Sua conta não tem acesso de professor. Peça para um administrador liberar.</p>
        )}
        <p className="text-xs text-stone-400 mt-4"><Link href="/" className="underline">◂ voltar para o início</Link></p>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
        <div className="flex justify-between items-center mb-4">
          <Link href="/" className="text-xs text-stone-400 font-mono underline">◂ voltar</Link>
          <span className="text-xs font-mono text-stone-500 uppercase tracking-wider">Cadastrar questões</span>
        </div>

        {/* Abas */}
        <div className="flex border-2 border-slate-900 rounded-xl overflow-hidden mb-5">
          <button onClick={() => setAba('ia')}
            className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase tracking-wider transition ${aba === 'ia' ? 'bg-slate-900 text-white' : 'text-stone-500 hover:bg-stone-50'}`}>
            ✦ Importar com IA
          </button>
          <button onClick={() => setAba('manual')}
            className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase tracking-wider transition ${aba === 'manual' ? 'bg-slate-900 text-white' : 'text-stone-500 hover:bg-stone-50'}`}>
            Manual
          </button>
        </div>

        {aba === 'ia' ? <AbaIA user={user} /> : <AbaManual user={user} />}
      </div>
    </Shell>
  );
}
