// Lazy-loads CodeMirror only when a view actually needs the code editor
// (Log Session, and Journal entries that have stored code), instead of
// paying for it on every page view. Injected once and memoized.
const VERSION = "5.65.16";
const BASE = `https://cdnjs.cloudflare.com/ajax/libs/codemirror/${VERSION}`;

let loadPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadStyle(href) {
  return new Promise((resolve, reject) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = resolve;
    l.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(l);
  });
}

export function loadCodeMirror() {
  if (window.CodeMirror) return Promise.resolve(window.CodeMirror);
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all([
    loadStyle(`${BASE}/codemirror.min.css`),
    loadScript(`${BASE}/codemirror.min.js`),
  ])
    .then(() =>
      Promise.all([
        loadScript(`${BASE}/mode/clike/clike.min.js`),
        loadScript(`${BASE}/mode/python/python.min.js`),
        loadScript(`${BASE}/mode/javascript/javascript.min.js`),
      ])
    )
    .then(() => window.CodeMirror);
  return loadPromise;
}

export const CODE_MODES = {
  cpp: { mode: "text/x-c++src", label: "C++" },
  python: { mode: "text/x-python", label: "Python" },
  javascript: { mode: "javascript", label: "JavaScript" },
  java: { mode: "text/x-java", label: "Java" },
};
