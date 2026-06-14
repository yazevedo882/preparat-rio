import './globals.css';
import { AuthProvider } from './AuthProvider';

export const metadata = {
  title: 'Questões IF',
  description: 'Banco de questões de Institutos Federais',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
