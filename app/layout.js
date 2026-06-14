import './globals.css';

export const metadata = {
  title: 'Questões IF',
  description: 'Banco de questões de Institutos Federais',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
