import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';

export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-bg text-text-primary font-sans antialiased selection:bg-brand-100 selection:text-brand-900">
      <Header />
      <main className="flex-1 w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
}
