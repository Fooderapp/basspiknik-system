// Next.js instrumentation hook — runs before the app starts in Node.js context.
// Node 25+ exposes a global `localStorage` that is partially implemented (requires
// --localstorage-file flag). Libraries like next-themes check
// `typeof localStorage !== 'undefined'` which now passes on Node 25 even during
// SSR, then crash when they try to call .getItem(). We patch it here with a
// safe no-op implementation so SSR renders cleanly.
export async function register() {
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem !== "function") {
    const noop = () => null;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: noop,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: noop,
      },
      writable: true,
      configurable: true,
    });
  }
}
