// Манифест и service worker только для обычной сборки.
// Один dist открывается и с корня GitHub Pages, и из /0.1/: адреса относительные.
// Воркер корня не перехватывает папки версий — у них свой sw.js и свой кэш.
// Одиночный HTML этот плагин не видит: vite.singlefile.config.ts его не подключает.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { HtmlTagDescriptor, Plugin, ResolvedConfig } from 'vite';

const theme = '#000000';

const icons = [
  'icons/favicon.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
] as const;

export function cabalPwa(): Plugin {
  let config: ResolvedConfig;
  let emitted: string[] = [];

  return {
    name: 'cabal-pwa',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      emitted = Object.keys(bundle);
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        if (!config.publicDir) return;
        const tags: HtmlTagDescriptor[] = [
          { tag: 'link', attrs: { rel: 'manifest', href: './manifest.json' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'theme-color', content: theme }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Cabal' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'icon', href: './icons/favicon.png', type: 'image/png' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }, injectTo: 'head' },
          { tag: 'script', attrs: {}, injectTo: 'head', children: registerScript },
        ];
        return tags;
      },
    },
    closeBundle() {
      if (!config.publicDir) return;
      writePwa(config, emitted);
    },
  };
}

const registerScript = `if ('serviceWorker' in navigator) {
  var reloadForSw = false;
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloadForSw) return;
    reloadForSw = true;
    window.location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function (reg) {
      function checkUpdate() {
        reg.update().catch(function () {});
      }
      checkUpdate();
      window.addEventListener('pageshow', checkUpdate);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') checkUpdate();
      });
    }).catch(function () {});
  });
}`;

function writePwa(config: ResolvedConfig, emitted: readonly string[]): void {
  const outDir = path.resolve(config.root, config.build.outDir);
  const publicDir = config.publicDir;
  for (const icon of icons) {
    if (!fs.existsSync(path.join(publicDir, icon))) {
      throw new Error(`Нет ${icon}. Собери значки: python tools/draw_icon.py`);
    }
  }

  const files = new Map<string, Buffer>();
  for (const relative of walk(publicDir)) {
    files.set(relative, fs.readFileSync(path.join(publicDir, relative)));
  }
  for (const relative of emitted) {
    const name = relative.split('\\').join('/');
    files.set(name, fs.readFileSync(path.join(outDir, name)));
  }

  // Страницу в generateBundle ещё не видно: её дописывает плагин HTML позже.
  // К этому моменту файл уже лежит в dist, и без него офлайн не открывает игру.
  const indexPath = path.join(outDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('Сборка не написала index.html');
  }
  files.set('index.html', fs.readFileSync(indexPath));

  const manifest = manifestJson();
  // manifest.json, не .webmanifest: GitHub Pages отдаёт json как application/json.
  // Так Chrome соглашается поставить игру. octet-stream у .webmanifest ему не подходит.
  files.set('manifest.json', Buffer.from(manifest));

  const names = [...files.keys()].filter((name) => name !== 'sw.js').sort();
  const hash = createHash('sha256');
  for (const name of names) {
    hash.update(name);
    hash.update(files.get(name)!);
  }
  const version = hash.digest('hex').slice(0, 8);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(outDir, 'sw.js'), serviceWorker(names.map(toUrl), version));
}

function walk(directory: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...walk(path.join(directory, entry.name), relative));
      continue;
    }
    found.push(relative.split('\\').join('/'));
  }
  return found;
}

function toUrl(relative: string): string {
  return `./${relative.split('/').map(encodeURIComponent).join('/')}`;
}

function manifestJson(): string {
  return `${JSON.stringify(
    {
      name: 'Cabal',
      short_name: 'Cabal',
      description: 'Ремейк Cabal',
      lang: 'ru',
      start_url: './index.html',
      scope: './',
      display: 'standalone',
      orientation: 'landscape',
      background_color: theme,
      theme_color: theme,
      categories: ['games'],
      icons: [
        { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    null,
    2,
  )}\n`;
}

function serviceWorker(urls: readonly string[], version: string): string {
  return `// Кэш этой папки. Корень сайта и /0.1/ — один origin, поэтому имя кэша
// включает scope: обновление корня не стирает кэш старой версии.
const version = ${JSON.stringify(version)};
const prefix = 'cabal-' + self.registration.scope + '-';
const cacheName = prefix + version;
const files = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(files)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  const path = url.pathname.slice(scopePath.length);
  if (path === 'sw.js') return;
  // Папка версии лежит внутри scope корня. Её отдаёт её собственный воркер.
  if (/^[0-9]+(\\.[0-9]+)*(\\/|$)/.test(path)) return;

  event.respondWith(load(request));
});

async function load(request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
    }
    throw error;
  }
}
`;
}
