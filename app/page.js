'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthProvider';
import Header from '../components/Header';
import { gerarPdfQuestoes } from '../lib/gerarPdf';

const LETRAS = ['A', 'B', 'C', 'D'];

const LABEL_PADRAO = {
  contexto_cotidiano: 'Contexto cotidiano',
  leitura_grafico: 'Gráfico/tabela',
  julgamento_itens: 'Itens I/II/III',
  texto_apoio: 'Texto de apoio',
  classificacao_comparacao: 'Classificação',
  teoria_aplicacao: 'Teoria + aplicação',
};

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [questoes, setQuestoes] = useState([]);
  const [tela, setTela] = useState('carregando'); // carregando | inativo | erro | filtros | provas-lista | quiz | resultado
  const [erroMsg, setErroMsg] = useState('');

  // Aba "Provas": lista de provas oficiais e qual está em andamento
  const [provas, setProvas] = useState([]);
  const [provaAtual, setProvaAtual] = useState(null);
  const [origemLista, setOrigemLista] = useState('filtro'); // 'filtro' | 'prova'

  const [filtros, setFiltros] = useState({
    instituto: 'Todos',
    ano: 'Todos',
    disciplina: 'Todos',
    assunto: 'Todos',
    padrao: 'Todos',
    dificuldade: 'Todos',
  });
  const [lista, setLista] = useState([]);
  const [indice, setIndice] = useState(0);
  const [selecionada, setSelecionada] = useState(null);
  const [respondida, setRespondida] = useState(false);
  const [explicacao, setExplicacao] = useState('');
  const [carregandoExplicacao, setCarregandoExplicacao] = useState(false);
  const [respostas, setRespostas] = useState([]);
  const [comGabarito, setComGabarito] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (profile && profile.ativo === false) {
      setTela('inativo');
      return;
    }

    async function carregar() {
      const { data, error } = await supabase
        .from('questoes')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        setErroMsg(error.message);
        setTela('erro');
        return;
      }
      setQuestoes(data || []);

      // Carrega provas oficiais que já têm questões cadastradas
      const { data: provasData } = await supabase
        .from('provas')
        .select('*, questoes(count)')
        .order('ano', { ascending: false });
      setProvas(
        (provasData || [])
          .map((p) => ({ ...p, total: p.questoes?.[0]?.count || 0 }))
          .filter((p) => p.total > 0)
      );

      setTela('filtros');
    }
    carregar();
  }, [user, profile, loading]);

  const institutos = ['Todos', ...new Set(questoes.map((q) => q.instituto))];
  const anos = ['Todos', ...new Set(questoes.map((q) => q.ano))].sort((a, b) =>
    a === 'Todos' ? -1 : b === 'Todos' ? 1 : a - b
  );
  const disciplinas = ['Todos', ...new Set(questoes.map((q) => q.disciplina))];
  const assuntos = ['Todos', ...new Set(
    questoes.filter((q) => filtros.disciplina === 'Todos' || q.disciplina === filtros.disciplina).map((q) => q.assunto)
  )];

  // Padrões e dificuldades: só mostra opções que existem no banco
  const padroesExistentes = ['Todos', ...new Set(questoes.map((q) => q.padrao).filter(Boolean))];
  const dificuldadesExistentes = ['Todos', ...(['Fácil', 'Médio', 'Difícil'].filter((d) =>
    questoes.some((q) => q.dificuldade === d)
  ))];

  const encontradas = questoes.filter((q) =>
    (filtros.instituto === 'Todos' || q.instituto === filtros.instituto) &&
    (filtros.ano === 'Todos' || q.ano === Number(filtros.ano)) &&
    (filtros.disciplina === 'Todos' || q.disciplina === filtros.disciplina) &&
    (filtros.assunto === 'Todos' || q.assunto === filtros.assunto) &&
    (filtros.padrao === 'Todos' || q.padrao === filtros.padrao) &&
    (filtros.dificuldade === 'Todos' || q.dificuldade === filtros.dificuldade)
  );

  function atualizarFiltro(campo, valor) {
    if (campo === 'disciplina') {
      setFiltros((f) => ({ ...f, disciplina: valor, assunto: 'Todos' }));
    } else {
      setFiltros((f) => ({ ...f, [campo]: valor }));
    }
  }

  function montarLista() {
    setLista(encontradas);
    setIndice(0);
    setRespostas([]);
    setSelecionada(null);
    setRespondida(false);
    setExplicacao('');
    setOrigemLista('filtro');
    setTela('quiz');
  }

  // Carrega todas as questões de uma prova oficial, na ordem original
  async function iniciarProva(prova) {
    const { data, error } = await supabase
      .from('questoes')
      .select('*')
      .eq('prova_id', prova.id)
      .order('numero_na_prova', { ascending: true });

    if (error || !data?.length) return;

    setProvaAtual(prova);
    setLista(data);
    setIndice(0);
    setRespostas([]);
    setSelecionada(null);
    setRespondida(false);
    setExplicacao('');
    setOrigemLista('prova');
    setTela('quiz');
  }

  async function baixarPdf() {
    if (encontradas.length === 0) return;
    setGerandoPdf(true);
    try {
      await gerarPdfQuestoes(encontradas, comGabarito);
    } catch (e) {
      // ignore
    }
    setGerandoPdf(false);
  }

  async function responder(letra) {
    if (respondida) return;
    setSelecionada(letra);
    setRespondida(true);
    const q = lista[indice];
    const acertou = letra === q.correta;
    setRespostas((r) => [...r, { acertou, assunto: q.assunto, disciplina: q.disciplina }]);

    // Só busca explicação se ERROU
    if (!acertou) {
      // Usa cache do banco (explicacao ou explicacao_gerada)
      if (q.explicacao || q.explicacao_gerada) {
        setExplicacao(q.explicacao || q.explicacao_gerada);
        return;
      }
      setCarregandoExplicacao(true);
      try {
        const resp = await fetch('/api/explicacao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questao_id: q.id,
            enunciado: q.enunciado,
            opcoes: q.opcoes,
            correta: q.correta,
            disciplina: q.disciplina,
            assunto: q.assunto,
            acertou: false,
          }),
        });
        const data = await resp.json();
        // Salva no objeto local para não buscar de novo se voltar
        q.explicacao_gerada = data.explicacao;
        setExplicacao(data.explicacao || 'Não foi possível gerar a explicação agora.');
      } catch (e) {
        setExplicacao('Não foi possível gerar a explicação agora.');
      }
      setCarregandoExplicacao(false);
    }
  }

  function proxima() {
    setSelecionada(null);
    setRespondida(false);
    setExplicacao('');
    if (indice + 1 < lista.length) {
      setIndice((i) => i + 1);
    } else {
      setTela('resultado');
    }
  }

  function resumoPorAssunto() {
    const grupos = {};
    respostas.forEach((r) => {
      if (!grupos[r.assunto]) grupos[r.assunto] = { acertos: 0, total: 0 };
      grupos[r.assunto].total += 1;
      if (r.acertou) grupos[r.assunto].acertos += 1;
    });
    return grupos;
  }

  const Select = ({ label, opcoes, valor, onChange, labelFn }) => (
    <div>
      <label className="block text-xs font-mono uppercase tracking-wider text-stone-500 mb-1">{label}</label>
      <select
        value={valor}
        onChange={onChange}
        className="w-full border border-stone-300 rounded-lg p-2.5 bg-stone-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
      >
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {labelFn ? labelFn(o) : o}
          </option>
        ))}
      </select>
    </div>
  );

  if (tela === 'carregando') {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <p className="text-sm font-mono text-stone-400 uppercase tracking-wider">Carregando banco de questões...</p>
      </div>
    );
  }

  if (tela === 'inativo') {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-5 max-w-md text-center">
          <p className="text-sm font-mono uppercase tracking-wider text-stone-400 mb-2">Acesso suspenso</p>
          <p className="text-sm text-stone-700 mb-4">
            Sua conta está temporariamente desativada. Entre em contato com a professora para reativar o acesso.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
            className="text-xs underline text-stone-400"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (tela === 'erro') {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="bg-white border-2 border-red-500 rounded-2xl p-5 max-w-md text-sm text-red-700">
          Não foi possível carregar as questões. Verifique a configuração do Supabase.
          <p className="text-xs text-stone-400 mt-2 font-mono">{erroMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <Header />
        <div className="text-center mb-4">
          <h1 className="font-mono text-2xl font-bold tracking-widest text-slate-900">QUESTÕES IF</h1>
          <p className="text-xs text-stone-500 mt-1">banco de questões · institutos federais</p>
        </div>

        {(tela === 'filtros' || tela === 'provas-lista') && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setTela('filtros')}
              className={`flex-1 font-mono uppercase tracking-wider text-xs font-bold py-2 rounded-lg border-2 transition ${
                tela === 'filtros' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-900'
              }`}
            >
              Questões
            </button>
            <button
              onClick={() => setTela('provas-lista')}
              className={`flex-1 font-mono uppercase tracking-wider text-xs font-bold py-2 rounded-lg border-2 transition ${
                tela === 'provas-lista' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-900 border-slate-900'
              }`}
            >
              Provas
            </button>
          </div>
        )}

        {tela === 'provas-lista' && (
          <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
            <p className="text-sm text-stone-600 mb-4">Escolha uma prova oficial para resolver completa, na ordem original.</p>
            {provas.length === 0 ? (
              <p className="text-sm text-stone-400">Nenhuma prova disponível ainda.</p>
            ) : (
              <div className="space-y-2">
                {provas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => iniciarProva(p)}
                    className="w-full text-left border border-stone-200 rounded-xl p-3 hover:bg-stone-50 transition"
                  >
                    <p className="text-sm font-bold text-slate-900">{p.titulo}</p>
                    <p className="text-xs font-mono text-stone-400 mt-1">
                      {p.instituto} · {p.ano} · {p.disciplina} · {p.total} questõe{p.total === 1 ? '' : 's'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tela === 'filtros' && (
          <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
            <p className="text-sm text-stone-600 mb-4">Monte sua lista de questões escolhendo os filtros abaixo.</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Select label="Instituto" opcoes={institutos} valor={filtros.instituto} onChange={(e) => atualizarFiltro('instituto', e.target.value)} />
              <Select label="Ano" opcoes={anos.map(String)} valor={String(filtros.ano)} onChange={(e) => atualizarFiltro('ano', e.target.value)} />
              <Select label="Disciplina" opcoes={disciplinas} valor={filtros.disciplina} onChange={(e) => atualizarFiltro('disciplina', e.target.value)} />
              <Select label="Assunto" opcoes={assuntos} valor={filtros.assunto} onChange={(e) => atualizarFiltro('assunto', e.target.value)} />
            </div>

            {/* ── Filtros de Padrão e Dificuldade (só aparecem se há questões classificadas) ── */}
            {(padroesExistentes.length > 1 || dificuldadesExistentes.length > 1) && (
              <div className="border border-stone-200 rounded-xl p-3 mb-3 space-y-3 bg-stone-50">
                <p className="text-xs font-mono uppercase tracking-wider text-stone-400">Filtros avançados</p>
                <div className="grid grid-cols-2 gap-3">
                  {padroesExistentes.length > 1 && (
                    <Select
                      label="Padrão"
                      opcoes={padroesExistentes}
                      valor={filtros.padrao}
                      onChange={(e) => atualizarFiltro('padrao', e.target.value)}
                      labelFn={(v) => v === 'Todos' ? 'Todos' : (LABEL_PADRAO[v] || v)}
                    />
                  )}
                  {dificuldadesExistentes.length > 1 && (
                    <Select
                      label="Dificuldade"
                      opcoes={dificuldadesExistentes}
                      valor={filtros.dificuldade}
                      onChange={(e) => atualizarFiltro('dificuldade', e.target.value)}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-stone-200 mt-4 pt-4 flex items-center justify-between">
              <span className="text-sm text-stone-600">
                <span className="font-bold text-slate-900">{encontradas.length}</span> questõe{encontradas.length === 1 ? '' : 's'} encontrada{encontradas.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              onClick={montarLista}
              disabled={encontradas.length === 0}
              className="w-full mt-4 bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 disabled:text-stone-500 transition"
            >
              Montar lista ▸
            </button>

            <div className="border-t border-stone-200 mt-4 pt-4">
              {user ? (
                <>
                  <label className="flex items-center gap-2 text-xs text-stone-600 mb-2">
                    <input type="checkbox" checked={comGabarito} onChange={(e) => setComGabarito(e.target.checked)} />
                    Incluir gabarito no PDF
                  </label>
                  <button
                    onClick={baixarPdf}
                    disabled={encontradas.length === 0 || gerandoPdf}
                    className="w-full bg-white border-2 border-slate-900 text-slate-900 font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:opacity-50 transition hover:bg-stone-50"
                  >
                    {gerandoPdf ? 'Gerando PDF...' : 'Baixar lista em PDF ▸'}
                  </button>
                </>
              ) : (
                <p className="text-xs text-stone-500 text-center">
                  <Link href="/login" className="underline text-slate-900">Entre na sua conta</Link> para baixar a lista filtrada em PDF.
                </p>
              )}
            </div>

            <p className="text-xs text-stone-400 mt-3">
              Banco com {questoes.length} questões cadastradas no total.
            </p>
          </div>
        )}

        {tela === 'quiz' && lista[indice] && (
          <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
            <div className="flex justify-between items-center mb-3">
              <button onClick={() => setTela(origemLista === 'prova' ? 'provas-lista' : 'filtros')} className="text-xs text-stone-400 font-mono underline">
                ◂ {origemLista === 'prova' ? 'provas' : 'filtros'}
              </button>
              <span className="text-xs font-mono text-stone-500">{indice + 1} / {lista.length}</span>
            </div>
            <div className="flex gap-1.5 justify-center mb-4">
              {lista.map((_, i) => {
                let cor = 'bg-stone-200';
                if (i < respostas.length) cor = respostas[i].acertou ? 'bg-emerald-600' : 'bg-red-500';
                else if (i === indice) cor = 'bg-slate-900';
                return <span key={i} className={`w-2.5 h-2.5 rounded-full ${cor}`} />;
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {origemLista === 'prova' && provaAtual && (
                <span className="inline-block bg-emerald-700 text-white text-xs font-mono uppercase tracking-wider px-3 py-1 rounded-full">
                  {provaAtual.titulo}
                </span>
              )}
              <span className="inline-block bg-slate-900 text-white text-xs font-mono uppercase tracking-wider px-3 py-1 rounded-full">
                {lista[indice].instituto} · {lista[indice].ano} · {lista[indice].disciplina} · {lista[indice].assunto}
              </span>
              {lista[indice].dificuldade && (
                <span className={`inline-block text-xs font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${
                  lista[indice].dificuldade === 'Fácil' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                  lista[indice].dificuldade === 'Médio' ? 'bg-amber-50 border-amber-300 text-amber-700' :
                  'bg-red-50 border-red-300 text-red-700'
                }`}>
                  {lista[indice].dificuldade}
                </span>
              )}
              {lista[indice].padrao && (
                <span className="inline-block bg-stone-100 border border-stone-300 text-stone-600 text-xs font-mono px-2 py-1 rounded-full">
                  {LABEL_PADRAO[lista[indice].padrao] || lista[indice].padrao}
                </span>
              )}
            </div>
            {lista[indice].imagem_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lista[indice].imagem_url}
                alt="Imagem da questão"
                className="w-full max-w-xs mx-auto my-3 rounded-lg border border-stone-200"
              />
            )}
            <p className="text-sm text-slate-900 mb-4 leading-relaxed">{lista[indice].enunciado}</p>
            <div className="space-y-2 mb-4">
              {lista[indice].opcoes.map((opcao, i) => {
                const letra = LETRAS[i];
                let borda = 'border-stone-300';
                let bolha = 'border-slate-900 text-slate-900';
                let texto = 'text-slate-900';
                if (respondida) {
                  if (letra === lista[indice].correta) {
                    borda = 'border-emerald-600 bg-emerald-50';
                    bolha = 'bg-emerald-600 border-emerald-600 text-white';
                  } else if (letra === selecionada) {
                    borda = 'border-red-500 bg-red-50';
                    bolha = 'bg-red-500 border-red-500 text-white';
                  } else {
                    borda = 'border-stone-200';
                    bolha = 'border-stone-300 text-stone-400';
                    texto = 'text-stone-400';
                  }
                }
                return (
                  <button
                    key={letra}
                    onClick={() => responder(letra)}
                    disabled={respondida}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition ${borda}`}
                  >
                    <span className={`flex items-center justify-center w-8 h-8 rounded-full border-2 font-mono font-bold text-sm flex-shrink-0 ${bolha}`}>
                      {letra}
                    </span>
                    <span className={`text-sm ${texto}`}>{opcao}</span>
                  </button>
                );
              })}
            </div>
            {respondida && (
              <div className="border-t border-stone-200 pt-4">
                <p className={`text-sm font-bold mb-2 ${selecionada === lista[indice].correta ? 'text-emerald-700' : 'text-red-600'}`}>
                  {selecionada === lista[indice].correta
                    ? '✓ Você acertou!'
                    : `✗ Você errou. Resposta correta: ${lista[indice].correta}`}
                </p>
                <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mb-4 min-h-[3rem]">
                  <p className="text-xs font-mono uppercase tracking-wider text-stone-400 mb-1">Explicação</p>
                  {carregandoExplicacao ? (
                    <p className="text-sm text-stone-400 italic">Gerando explicação com IA...</p>
                  ) : (
                    <p className="text-sm text-stone-700 leading-relaxed">{explicacao}</p>
                  )}
                </div>
                <button
                  onClick={proxima}
                  disabled={carregandoExplicacao}
                  className="w-full bg-slate-900 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg disabled:bg-stone-300 transition"
                >
                  {indice + 1 < lista.length ? 'Próxima questão ▸' : 'Ver resultado ▸'}
                </button>
              </div>
            )}
          </div>
        )}

        {tela === 'resultado' && (
          <div className="bg-white border-2 border-slate-900 rounded-2xl p-5">
            <p className="text-xs font-mono uppercase tracking-wider text-stone-400 mb-1">Resultado</p>
            <p className="text-3xl font-bold text-slate-900 mb-1">
              {respostas.filter((r) => r.acertou).length} / {respostas.length}
            </p>
            <p className="text-sm text-stone-500 mb-4">
              {Math.round((respostas.filter((r) => r.acertou).length / respostas.length) * 100)}% de acertos
            </p>
            <p className="text-xs font-mono uppercase tracking-wider text-stone-400 mb-2">Desempenho por assunto</p>
            <div className="space-y-2 mb-5">
              {Object.entries(resumoPorAssunto()).map(([assunto, dados]) => {
                const pct = Math.round((dados.acertos / dados.total) * 100);
                const cor = pct >= 70 ? 'bg-emerald-600' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
                return (
                  <div key={assunto}>
                    <div className="flex justify-between text-xs text-stone-600 mb-1">
                      <span>{assunto}</span>
                      <span className="font-mono">{dados.acertos}/{dados.total}</span>
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${cor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setTela(origemLista === 'prova' ? 'provas-lista' : 'filtros')}
              className="w-full bg-emerald-700 text-white font-mono uppercase tracking-wider text-sm font-bold py-3 rounded-lg transition"
            >
              {origemLista === 'prova' ? 'Voltar para provas ▸' : 'Nova lista ▸'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
