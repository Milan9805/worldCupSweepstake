import fs from 'fs';
import path from 'path';
import vm from 'vm';

const swSource = fs.readFileSync(
  path.join(__dirname, '../../../public/sw.js'),
  'utf8'
);

const CACHE = 'sweepstake-v1';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const keyOf = (req) => (typeof req === 'string' ? req : req.url);

// Build a sandbox with mocked ServiceWorker globals, run sw.js inside it, and
// hand back the captured event listeners plus the cache state for assertions.
function setup(options = {}) {
  const listeners = {};
  const stores = new Map(); // cacheName -> Map(key -> response)

  const makeCache = (store) => ({
    addAll: async (urls) => {
      urls.forEach((url) => store.set(url, { shell: url }));
    },
    put: async (req, res) => {
      store.set(keyOf(req), res);
    },
    match: async (req) => store.get(keyOf(req)),
  });

  const caches = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return makeCache(stores.get(name));
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name) => stores.delete(name),
    match: async (req) => {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(req));
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting: jest.fn(async () => {}),
    clients: { claim: jest.fn(async () => {}) },
  };

  const defaultFetch = async () => ({ ok: true, clone: () => ({ cloned: true }) });
  const fetchMock = jest.fn(options.fetchImpl || defaultFetch);

  const context = { self, caches, fetch: fetchMock, console };
  vm.createContext(context);
  vm.runInContext(swSource, context);

  return { listeners, stores, self, fetchMock };
}

describe('service worker (sw.js)', () => {
  it('pre-caches the app shell and skips waiting on install', async () => {
    const { listeners, stores, self } = setup();
    const event = {};
    event.waitUntil = (p) => {
      event.promise = p;
    };

    listeners.install(event);
    await event.promise;

    const shell = stores.get(CACHE);
    expect(shell.has('/')).toBe(true);
    expect(shell.has('/index.html')).toBe(true);
    expect(shell.has('/manifest.webmanifest')).toBe(true);
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it('purges stale caches and claims clients on activate', async () => {
    const { listeners, stores, self } = setup();
    stores.set('sweepstake-v0', new Map([['/stale', {}]]));
    stores.set(CACHE, new Map());
    const event = {};
    event.waitUntil = (p) => {
      event.promise = p;
    };

    listeners.activate(event);
    await event.promise;

    expect(stores.has('sweepstake-v0')).toBe(false);
    expect(stores.has(CACHE)).toBe(true);
    expect(self.clients.claim).toHaveBeenCalled();
  });

  it('serves from the network first and caches a copy', async () => {
    const netResponse = { ok: true, clone: () => ({ cloned: true }) };
    const { listeners, stores, fetchMock } = setup({
      fetchImpl: async () => netResponse,
    });
    const request = { url: '/dashboard.html', method: 'GET' };
    const event = { request };
    event.respondWith = (p) => {
      event.response = p;
    };

    listeners.fetch(event);
    const result = await event.response;

    expect(result).toBe(netResponse);
    expect(fetchMock).toHaveBeenCalledWith(request);
    await flush(); // let the fire-and-forget cache write settle
    expect(stores.get(CACHE).get('/dashboard.html')).toEqual({ cloned: true });
  });

  it('falls back to the cached request when the network fails', async () => {
    const cached = { shell: '/dashboard.html' };
    const { listeners, stores } = setup({
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    stores.set(CACHE, new Map([['/dashboard.html', cached]]));
    const event = { request: { url: '/dashboard.html', method: 'GET' } };
    event.respondWith = (p) => {
      event.response = p;
    };

    listeners.fetch(event);
    expect(await event.response).toBe(cached);
  });

  it('falls back to the cached index shell when offline and uncached', async () => {
    const indexShell = { shell: '/index.html' };
    const { listeners, stores } = setup({
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    stores.set(CACHE, new Map([['/index.html', indexShell]]));
    const event = { request: { url: '/never-cached.html', method: 'GET' } };
    event.respondWith = (p) => {
      event.response = p;
    };

    listeners.fetch(event);
    expect(await event.response).toBe(indexShell);
  });

  it('ignores non-GET requests', () => {
    const { listeners, fetchMock } = setup();
    let responded = false;
    const event = {
      request: { url: '/api/admin/login', method: 'POST' },
      respondWith: () => {
        responded = true;
      },
    };

    listeners.fetch(event);

    expect(responded).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
