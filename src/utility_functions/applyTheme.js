export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function getCachedTheme() {
  if (typeof document === 'undefined') return 'light';
  
  try {
    const cached = localStorage.getItem('nua-theme');
    return cached || 'light';
  } catch (e) {
    // In case of localStorage error (e.g. Safari private mode), default to light
    return 'light';
  }
}

export function cacheTheme(theme) {
  if (typeof document === 'undefined') return;
  
  try {
    localStorage.setItem('nua-theme', theme);
  } catch (e) {
    // Ignore localStorage errors
  }
}