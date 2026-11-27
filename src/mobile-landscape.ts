/** На узком стекле игра рассчитана на широкую сторону: портрет переворачиваем в ландшафт. */

function coarsePointer(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function rawViewport(): { width: number; height: number } {
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  return { width, height };
}

/** Портрет на пальцевом экране: кадр считаем по длинной и короткой стороне. */
export function cssViewportSize(): { width: number; height: number } {
  const { width, height } = rawViewport();
  if (!coarsePointer() || width >= height) return { width, height };
  return { width: Math.max(width, height), height: Math.min(width, height) };
}

function portraitOnCoarse(): boolean {
  if (!coarsePointer()) return false;
  const { width, height } = rawViewport();
  return width < height;
}

function syncDom(): void {
  document.documentElement.classList.toggle('force-landscape', portraitOnCoarse());
}

function tryLandscapeLock(): void {
  if (!coarsePointer()) return;
  const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
  if (!orientation?.lock) return;
  orientation.lock('landscape').catch(() => {});
}

export function initMobileLandscape(): void {
  if (typeof document === 'undefined') return;

  syncDom();
  window.addEventListener('resize', syncDom);
  window.visualViewport?.addEventListener('resize', syncDom);
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => {
      syncDom();
      window.dispatchEvent(new Event('resize'));
    });
  });
  document.addEventListener('pointerdown', tryLandscapeLock, { once: true, passive: true });
  tryLandscapeLock();
}