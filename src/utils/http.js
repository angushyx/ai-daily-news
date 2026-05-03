// Lightweight fetch wrapper: retries + UA + timeout
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchText(url, { timeoutMs = 15000, retries = 2, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'user-agent': DEFAULT_UA, accept: '*/*', ...headers },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export function withinHours(date, hours) {
  if (!date) return true; // unknown date → keep, let later dedup handle it
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return true;
  return Date.now() - d <= hours * 3600 * 1000;
}
