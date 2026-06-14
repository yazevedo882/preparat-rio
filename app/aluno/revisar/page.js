'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function RevisarQuestoes() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [questoes, setQuestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    const verificarAcesso = async () => {
      const { data } = await supabase.auth.getSession();
      const role = data?.session?.user?.user_metadata?.role;
      
      if (!data?.session || role === 'professor') {
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

  async function gerarPDF() {
    setGerando(true);
    try {
      const element = document.getElementById('conteudo-pdf');
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let yPos = 10;
      let heightLeft = imgHeight;
      
      while (yPos < heightLeft) {
        pdf.addImage(imgData, 'PNG', 10, yPos, imgWidth, imgHeight);
        yPos += 277;
        if (heightLeft > yPos) pdf.addPage();
      }
      
      pdf.save(`questoes-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error('Erro ao gerar PDF:', e);
      alert('Erro ao gerar PDF');
    }
    setGerando(false);
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
          <h1 className="font-mono text-2xl font-bold text-slate-900">QUESTÕES IF - REVISAR</h1>
          <div className="flex items-center gap-4">
            <Link href="/aluno/questoes" className="text-xs text-stone-400 font-mono underline">
              ◂ Voltar
            </Link>
            <button
              onClick={gerarPDF}
              disabled={gerando || questoes.length === 0}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-mono rounded-lg hover:bg-blue-700 disabled:bg-stone-300"
            >
              {gerando ? 'Gerando PDF...' : '📥 Download PDF'}
            </button>
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
        <div id="conteudo-pdf" className="bg-white p-8 space-y-6">
          <div className="text-center mb-8">
            <h2 className="font-mono text-2xl font-bold text-slate-900">LISTA DE QUESTÕES</h2>
            <p className="text-xs text-stone-500 mt-2">{usuario?.user_metadata?.nome} • {new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          {questoes.map((q, idx) => (
            <div key={q.id} className="border-b-2 border-stone-300 pb-6">
              <div className="mb-3">
                <p className="text-xs font-mono text-stone-500">Questão {idx + 1} • {q.instituto} ({q.ano}) • {q.disciplina}</p>
                <p className="font-mono font-bold text-slate-900">Assunto: {q.assunto}</p>
              </div>

              <div className="bg-stone-50 p-4 rounded-lg mb-3">
                <p className="text-sm text-slate-900 mb-3">{q.enunciado}</p>
                {q.imagem_url && (
                  <img src={q.imagem_url} alt="Questão" className="max-w-xs rounded-lg" />
                )}
              </div>

              <div className="space-y-1">
                {q.opcoes.map((opcao, i) => (
                  <p key={i} className="text-sm text-slate-700">
                    <span className="font-mono font-bold">{String.fromCharCode(65 + i)})</span> {opcao}
                  </p>
                ))}
              </div>

              <div className="mt-3">
                <p className="text-xs text-stone-600">
                  <span className="font-mono font-bold">Resposta correta:</span> {q.correta}
                </p>
                {q.explicacao && (
                  <p className="text-xs text-stone-600 mt-1">
                    <span className="font-mono font-bold">Explicação:</span> {q.explicacao}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
