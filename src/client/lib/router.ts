import { useSyncExternalStore } from 'react';

/** Three screens, addressed by URL hash so the phone's Back button just works. */
export type Route = { name: 'home' } | { name: 'scan' } | { name: 'card'; id: string };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'scan') return { name: 'scan' };
  if (parts[0] === 'card' && parts[1]) return { name: 'card', id: decodeURIComponent(parts[1]) };
  return { name: 'home' };
}

function toHash(route: Route): string {
  if (route.name === 'scan') return '#/scan';
  if (route.name === 'card') return `#/card/${encodeURIComponent(route.id)}`;
  return '#/';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  const hash = toHash(route);
  if (options.replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
  window.scrollTo(0, 0);
}
