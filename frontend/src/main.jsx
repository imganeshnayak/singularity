import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PublicCommuterPage from './PublicCommuterPage.jsx'

function RootRouter() {
  const getIsPublic = () => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return (
      path.includes('/public') ||
      path.includes('/commute') ||
      hash.includes('public') ||
      hash.includes('commute') ||
      search.includes('view=public')
    );
  };

  const [isPublic, setIsPublic] = useState(getIsPublic);

  useEffect(() => {
    const handlePopState = () => setIsPublic(getIsPublic());
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  return isPublic ? <PublicCommuterPage /> : <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
)
