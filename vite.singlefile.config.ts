// Отдельная сборка одного HTML. Обычный vite.config.ts и команды dev, build, preview её не читают.
// Готовый файл лежит в release/cabal-penetration.html и открывается двойным кликом:
// браузер не ходит за скриптом, картинками и звуками, потому что они уже внутри страницы.

import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

type Packed = readonly [string, string];

function png(relativePath: string): Packed {
  return [relativePath, 'image/png'];
}

/** Девять кадров ролика. Число совпадает с fence.frames, shortFence.frames и sandbag.frames. */
function frames(folder: string): Packed[] {
  return Array.from({ length: 9 }, (_, index) =>
    png(`${folder}/frame_${index.toString().padStart(3, '0')}.png`),
  );
}

/** Две кучи. Число совпадает с ruinVariants. */
function ruins(folder: string): Packed[] {
  return [png(`${folder}/ruin_000.png`), png(`${folder}/ruin_001.png`)];
}

// Те же пути, что игра берёт из public/. Исходные кадры пехоты в assets/enemies игра не грузит.
const packedFiles: Packed[] = [
  png('assets/soldier.png'),
  png('assets/infantry.png'),
  png('assets/hud-heart.png'),
  png('assets/hud-grenade.png'),
  png('assets/touch-grenade.png'),
  png('assets/hit-flash.png'),
  png('assets/grenade.png'),
  png('assets/explosion.png'),
  png('assets/ground-blast.png'),
  png('assets/tree-wood.png'),
  png('assets/tree-broken.png'),
  png('assets/fence/stone/fence-stone.png'),
  ...frames('assets/fence/stone/animate'),
  ...ruins('assets/fence/stone'),
  png('assets/fence/rust/fence-rust.png'),
  ...frames('assets/fence/rust/animation'),
  ...ruins('assets/fence/rust'),
  png('assets/fence/short/fence-short.png'),
  ...frames('assets/fence/short/animation'),
  ...ruins('assets/fence/short'),
  png('assets/fence/sandbag/fence-sandbag.png'),
  ...frames('assets/fence/sandbag/animation'),
  ...ruins('assets/fence/sandbag'),
  ['sounds/gun-fire-loop.wav', 'audio/wav'],
  ['sounds/grenade_throw.mp3', 'audio/mpeg'],
  ['sounds/grenade_exposion.mp3', 'audio/mpeg'],
];

// Phaser сам понимает адрес data: и не ходит за файлом.
// Подмена только в этой сборке: исходники и обычный npm run build по-прежнему грузят public/.
function inlinePackedFiles(): Plugin {
  const dataUrls = new Map<string, string>();
  let replaced = 0;

  return {
    name: 'inline-packed-files',
    apply: 'build',
    // До транспиляции TypeScript: иначе кавычки вокруг пути уже другие, и строка не находится.
    enforce: 'pre',
    buildStart() {
      replaced = 0;
      for (const [relativePath, mime] of packedFiles) {
        const filePath = path.resolve('public', relativePath);
        const base64 = fs.readFileSync(filePath).toString('base64');
        dataUrls.set(relativePath, `data:${mime};base64,${base64}`);
      }
    },
    transform(code, id) {
      if (!id.endsWith('.ts')) {
        return null;
      }

      let next = code;
      for (const [relativePath, dataUrl] of dataUrls) {
        for (const quote of ["'", '"'] as const) {
          const needle = `${quote}${relativePath}${quote}`;
          const hits = next.split(needle).length - 1;
          if (hits === 0) {
            continue;
          }
          replaced += hits;
          next = next.replaceAll(needle, `${quote}${dataUrl}${quote}`);
        }
      }

      if (next === code) {
        return null;
      }

      return next;
    },
    generateBundle() {
      if (replaced !== packedFiles.length) {
        throw new Error(
          `В сборку попало ${replaced} файлов из public/, ожидалось ${packedFiles.length}`,
        );
      }
    },
  };
}

// Live Server ищет в файле первое `</body>` и вставляет перед ним свой <script>.
// В бандле Phaser эта последовательность стоит внутри строки, не в разметке страницы.
// Вставка попадает в середину скрипта, и браузер сообщает Invalid or unexpected token.
// \u003c — тот же символ «<», но букв </body> в тексте скрипта уже нет,
// поэтому сервер доходит до настоящего закрывающего тега.
function keepLiveServerOutOfScript(html: string): string {
  const scriptOpen = '<script>';
  const openAt = html.indexOf(scriptOpen);
  const closeAt = html.lastIndexOf('</script>');
  if (openAt === -1 || closeAt < openAt) {
    return html;
  }

  const jsAt = openAt + scriptOpen.length;
  const js = html.slice(jsAt, closeAt).replace(/<\/body>/gi, (match) => `\\u003c${match.slice(1)}`);
  return html.slice(0, jsAt) + js + html.slice(closeAt);
}

// Vite называет страницу index.html по имени входного файла.
function nameReleaseHtml(): Plugin {
  const fileName = 'cabal-penetration.html';

  return {
    name: 'name-release-html',
    apply: 'build',
    closeBundle() {
      const directory = path.resolve('release');
      const from = path.join(directory, 'index.html');
      if (!fs.existsSync(from)) {
        return;
      }

      const to = path.join(directory, fileName);
      // Повторная сборка не чистит release/, и старый файл на Windows не даёт переименовать.
      if (fs.existsSync(to)) {
        fs.unlinkSync(to);
      }
      fs.renameSync(from, to);

      const html = fs.readFileSync(to, 'utf8');
      // Firefox не выполняет <script type="module"> у файла, открытого двойным кликом:
      // даже вшитый модуль он пытается загрузить по адресу file: и блокирует страницу.
      // Сборка уже один кусок без import, поэтому тег можно сделать обычным скриптом.
      const moduleTag = '<script type="module">';
      const moduleAt = html.indexOf(moduleTag);
      const classic =
        moduleAt === -1
          ? html
          : html.slice(0, moduleAt) + '<script>' + html.slice(moduleAt + moduleTag.length);
      const page = keepLiveServerOutOfScript(classic);
      const scriptOpen = '<script>';
      const scriptAt = page.indexOf(scriptOpen);
      const scriptCloseAt = page.lastIndexOf('</script>');
      const script =
        scriptAt === -1 || scriptCloseAt < scriptAt
          ? ''
          : page.slice(scriptAt + scriptOpen.length, scriptCloseAt);
      const externalScript = /<script\b[^>]*\bsrc=/i.test(page);
      const stillModule = page.includes(moduleTag);
      const looseFiles = packedFiles.some(([relativePath]) => page.includes(relativePath));
      const pngCount = page.split('data:image/png;base64,').length - 1;
      const mp3Count = page.split('data:audio/mpeg;base64,').length - 1;
      const wavCount = page.split('data:audio/wav;base64,').length - 1;
      const pngExpected = packedFiles.filter(([, mime]) => mime === 'image/png').length;
      const mp3Expected = packedFiles.filter(([, mime]) => mime === 'audio/mpeg').length;
      const wavExpected = packedFiles.filter(([, mime]) => mime === 'audio/wav').length;
      // Phaser 4.2.1 сам вшивает четыре маленьких png: логотип, белый пиксель,
      // запасную картинку и пробу холста. В packedFiles их нет.
      const phaserPng = 4;
      const bodyInsideScript = /<\/body>/i.test(script);

      if (
        moduleAt === -1 ||
        externalScript ||
        stillModule ||
        looseFiles ||
        pngCount !== pngExpected + phaserPng ||
        mp3Count !== mp3Expected ||
        wavCount !== wavExpected
      ) {
        throw new Error(
          `release/${fileName} всё ещё зависит от внешнего скрипта, картинок или звука`,
        );
      }

      if (bodyInsideScript) {
        throw new Error(
          `release/${fileName} содержит </body> внутри скрипта: Live Server вставит туда свой код и сломает страницу`,
        );
      }

      fs.writeFileSync(to, page);
    },
  };
}

export default defineConfig({
  // Картинки и звук читает плагин выше. Копировать public/ рядом с HTML не нужно:
  // иначе релиз был бы папкой, а не одним файлом.
  publicDir: false,
  base: './',
  build: {
    outDir: 'release',
    emptyOutDir: true,
    target: 'es2022',
  },
  plugins: [
    inlinePackedFiles(),
    // Скрипт страницы вшивается в сам HTML. Загрузчик модулей Vite после этого не нужен:
    // ему нечего догружать, а с диска лишний запрос всё равно бы не прошёл.
    viteSingleFile({ removeViteModuleLoader: true }),
    nameReleaseHtml(),
  ],
});
