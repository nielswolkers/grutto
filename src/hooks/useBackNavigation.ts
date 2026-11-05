import { useNavigate } from 'react-router-dom';

export function useBackNavigation(fallback = '/dashboard') {
  const navigate = useNavigate();
  return () => {
    if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}