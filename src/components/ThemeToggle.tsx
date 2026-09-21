import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'election-lens-theme';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
      aria-pressed={dark}
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span>{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
