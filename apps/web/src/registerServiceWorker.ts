export function registerServiceWorker() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {
        // Development should keep rendering even if cleanup is blocked.
      });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app must keep working even if the browser blocks service workers.
    });
  });
}
