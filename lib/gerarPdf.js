const LETRAS = ['A', 'B', 'C', 'D'];

export async function gerarPdfQuestoes(lista, incluirGabarito) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();

  const margin = 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  function quebraPagina(minimo = 12) {
    if (y > pageHeight - minimo) {
      doc.addPage();
      y = margin;
    }
  }

  doc.setFontSize(16);
  doc.text('Lista de Questões - Questões IF', margin, y);
  y += 10;

  lista.forEach((q, idx) => {
    doc.setFontSize(10);
    quebraPagina(20);
    doc.setFont(undefined, 'bold');
    const cabecalho = `${idx + 1}. ${q.instituto} ${q.ano} · ${q.disciplina} · ${q.assunto}`;
    doc.text(cabecalho, margin, y);
    y += 6;

    doc.setFont(undefined, 'normal');
    const enunciadoLinhas = doc.splitTextToSize(q.enunciado, maxWidth);
    enunciadoLinhas.forEach((linha) => {
      quebraPagina();
      doc.text(linha, margin, y);
      y += 5;
    });

    q.opcoes.forEach((opcao, i) => {
      const linhas = doc.splitTextToSize(`${LETRAS[i]}) ${opcao}`, maxWidth - 5);
      linhas.forEach((linha) => {
        quebraPagina();
        doc.text(linha, margin + 5, y);
        y += 5;
      });
    });

    y += 4;
  });

  if (incluirGabarito) {
    doc.addPage();
    y = margin;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Gabarito', margin, y);
    y += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    lista.forEach((q, idx) => {
      quebraPagina();
      doc.text(`${idx + 1}. ${q.correta}`, margin, y);
      y += 6;
    });
  }

  doc.save('lista-questoes-if.pdf');
}
