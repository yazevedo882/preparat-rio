'use client';

import { useState } from 'react';
import Link from 'next/link';
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

export default function Cadastro() {
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
    if (!arquivo) {
      setImagem(null);
      setPreview(null);
      return;
    }
    setImagem(arquivo);
    setPreview(URL.createObjectURL(arquivo));
  }

  async function salvar() {
    setErro('');
    setSucesso(false);

    const ano = Number(form.ano);
    if (!form.instituto.trim() || !form.disciplina.trim() || !form.assunto.trim() || !form.enunciado.trim()) {
      setErro('Preencha instituto, disciplina, assunto e enunciado.');
      return;
    }
    if (!ano || ano < 1900 || ano > 2100) {
      setErro('Informe um ano válido.');
      return;
    }
    const opcoes = [form.opcaoA, form.opcaoB, form.opcaoC, form.opcaoD].map((o) => o.trim());
    if (opcoes.some((o) => !o)) {
      setErro('Preencha as quatro alternativas (A, B, C e D).');
      return;
    }

    setSalvando(true);
    try {
      let imagem_url = null;

      if (imagem) {
        const nomeArquivo = `${Date.now()}-${imagem.name.replace(/\s+/g, '-')}`;
        const { error: erroUpload } = await supabase.storage
          .from('imagens-questoes')
          .upload(nomeArquivo, imagem);

        if (erroUpload) {
          throw new Error(`Falha ao enviar imagem: ${erroUpload.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('imagens-questoes')
          .getPublicUrl(nomeArquivo);

        imagem_url = urlData.publicUrl;
      }

      const { error: erroInsert } = await supabase.from('questoes').insert({
        instituto: form.instituto.trim(),
        ano,
        disciplina: form.disciplina.trim(),
        assunto: form.assunto.trim(),
        enunciado: form.enunciado.trim(),
        opcoes,
        correta: form.correta,
        explicacao: form.explicacao.trim() ? form.explicacao.trim() : null,
        imagem_url,
      });

      if (erroInsert) {
        throw new Error(erroInsert.message);
      }

      setForm(CAMPOS_VAZIOS);
      setImagem(null);
      setPreview(null);
      setSucesso(true);
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar a questão agora. Tente novamente.');
    }
    setSalvando(false);
  }

  const Campo = ({ label, valor, onChange, placeholder, textarea, type }) => (
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

  return (
    <div className="min-h-screen bg-stone-100 flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-4">
          <h1 className="font-mono text-2xl font-bold tracking-widest text-slate-900">QUESTÕES IF</h1>
          <p className="text-xs text-stone-500 mt-1">cadastro de nova questão</p>
        </div>

        <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <Link href="/" className="text-xs text-stone-400 font-mono underline">
              ◂ voltar
            </Link>
            <span className="text-xs font-mono text-stone-500 uppercase tracking-wider">Nova questão</span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Instituto" valor={form.instituto} onChange={(e) => atualizar('instituto', e.target.value)} placeholder="Ex: IFSP" />
              <Campo label="Ano" type="number" valor={form.ano} onChange={(e) => atualizar('ano', e.target.value)} placeholder="Ex: 2024" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Disciplina" valor={form.disciplina} onChange={(e) => atualizar('disciplina', e.target.value)} placeholder="Ex: Matemática" />
              <Campo label="Assunto" valor={form.assunto} onChange={(e) => atualizar('assunto', e.target.value)} placeholder="Ex: Frações" />
            </div>
            <Campo label="Enunciado" textarea valor={form.enunciado} onChange={(e) => atualizar('enunciado', e.target.value)} placeholder="Digite o enunciado da questão" />

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Imagem (opcional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={escolherImagem}
                className="w-full text-sm text-stone-600 border border-stone-300 rounded-lg p-2 bg-stone-50"
              />
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Pré-visualização" className="w-full max-w-xs mx-auto my-3 rounded-lg border border-stone-200" />
              )}
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Alternativas</label>
              <div className="space-y-2">
                {['A', 'B', 'C', 'D'].map((letra) => (
                  <div key={letra} className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-slate-900 text-slate-900 font-mono font-bold text-sm flex-shrink-0">
                      {letra}
                    </span>
                    <input
                      type="text"
                      value={form[`opcao${letra}`]}
                      onChange={(e) => atualizar(`opcao${letra}`, e.target.value)}
                      placeholder={`Alternativa ${letra}`}
                      className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">Alternativa correta</label>
              <select
                value={form.correta}
                onChange={(e) => atualizar('correta', e.target.value)}
                className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              >
                {LETRAS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <Campo
              label="Explicação (opcional)"
              textarea
              valor={form.explicacao}
              onChange={(e) => atualizar('explicacao', e.target.value)}
              placeholder="Deixe em branco para a IA gerar uma explicação quando alguém responder"
            />
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4 text-xs text-red-700">{erro}</div>
          )}
          {sucesso && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-4 text-xs text-emerald-700">
              Questão salva! Já está disponível para todos no site.
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando}
            className="w-full mt-4 bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition"
          >
            {salvando ? 'Salvando...' : 'Salvar questão ▸'}
          </button>
        </div>
      </div>
    </div>
  );
}
