import Phaser from 'phaser';
import { cssColor, enemyBar, hud, palette, type WeaponId } from '../../constants';
import { gameVersion } from '../../version';
import { difficulties } from '../../difficulty';
import type { FrameLayout, Rect } from '../../layout';

const fontFamily = 'Consolas, "Courier New", monospace';
/** Размер цифр в пикселях кадра. На экран их рисует DOM, не холст. */
const figurePx = 22;

type HudFigures = {
  root: HTMLDivElement;
  lives: HTMLSpanElement;
  score: HTMLSpanElement;
  grenades: HTMLSpanElement;
};

type PicturePick = (index: number) => void;

type PauseMenu = {
  /** Снять паузу. */
  resume: () => void;
  /** Первый кадр, счёт, жизни и гранаты со старта. */
  restart: () => void;
};

/**
 * Значки PixelLab 48×48, в рамке пиксель в пиксель.
 * right и bottom — край непрозрачных пикселей, не включая его.
 */
export const hudIcons = {
  heart: 'hud-heart',
  grenade: 'hud-grenade',
  heartUrl: 'assets/hud-heart.png',
  grenadeUrl: 'assets/hud-grenade.png',
  heartTrim: { left: 9, top: 12, right: 39, bottom: 38 },
  grenadeTrim: { left: 14, top: 7, right: 37, bottom: 41 },
} as const;

type IconTrim = { left: number; top: number; right: number; bottom: number };

/** Рамка снизу: сердце, жизни, счёт, запас гранат, полоска ENEMY. На паузе — «В бой» и «Новая игра». Новая игра спрашивает сложность. */
export class Hud {
  private lives: number = hud.lives;
  private score = 0;
  private grenades = 0;
  private quota = 0;
  private slain = 0;
  private hurtTimer = 0;
  private frameWidth = 0;
  private band: Rect | null = null;
  private readonly scene: Phaser.Scene;
  private readonly figures: HudFigures;
  private readonly heart: Phaser.GameObjects.Image;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly grenade: Phaser.GameObjects.Image;
  private readonly grenadeText: Phaser.GameObjects.Text;
  private readonly enemyLabel: Phaser.GameObjects.Text;
  private readonly barGfx: Phaser.GameObjects.Graphics;
  private readonly weaponGfx: Phaser.GameObjects.Graphics;
  private weapon: WeaponId = 'rifle';
  private readonly pauseVeil: Phaser.GameObjects.Graphics;
  private readonly pauseLabel: Phaser.GameObjects.Text;
  private readonly deathLabel: Phaser.GameObjects.Text;
  private readonly edge: Phaser.GameObjects.Graphics;
  private readonly versionText: Phaser.GameObjects.Text;
  private pictureButtons: HTMLButtonElement[] = [];
  private onPicture: PicturePick | null = null;
  private pauseActions: PauseMenu | null = null;
  private difficultyPick: ((id: string) => void) | null = null;
  private readonly pauseMenu: HTMLDivElement;
  private readonly pauseTitle: HTMLParagraphElement;
  private readonly pauseButtons: HTMLButtonElement[];
  private readonly difficultyMenu: HTMLDivElement;
  private readonly difficultyTitle: HTMLParagraphElement;
  private readonly difficultyButtons: HTMLButtonElement[];
  private readonly continueButton: HTMLButtonElement;
  private onContinue: (() => void) | null = null;
  private helpCloseAction: (() => void) | null = null;
  /** Первые миллисекунды после открытия щелчок сквозь кнопку не закрывает диалог. */
  private helpGuard = 0;
  private readonly helpDialog: HTMLDivElement;
  private readonly helpCard: HTMLDivElement;
  private readonly helpTitle: HTMLParagraphElement;
  private readonly helpNote: HTMLParagraphElement;
  private readonly helpList: HTMLDivElement;
  private readonly helpClose: HTMLButtonElement;
  private frameHeight = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Container) {
    this.scene = scene;
    const font = inkFont(`${figurePx}px`);
    this.figures = mountFigures(scene);
    const pause = mountPauseMenu(this.figures.root, (kind) => {
      if (kind === 'resume') this.pauseActions?.resume();
      else this.pauseActions?.restart();
    });
    this.pauseMenu = pause.menu;
    this.pauseTitle = pause.title;
    this.pauseButtons = pause.buttons;
    const difficulty = mountDifficultyMenu(this.figures.root, (id) => this.difficultyPick?.(id));
    this.difficultyMenu = difficulty.menu;
    this.difficultyTitle = difficulty.title;
    this.difficultyButtons = difficulty.buttons;
    this.continueButton = mountContinueButton(this.figures.root, () => this.onContinue?.());
    const help = mountHelpDialog(
      this.figures.root,
      () => this.helpCloseAction?.(),
      () => performance.now() >= this.helpGuard,
    );
    this.helpDialog = help.dialog;
    this.helpCard = help.card;
    this.helpTitle = help.title;
    this.helpNote = help.note;
    this.helpList = help.list;
    this.helpClose = help.close;
    this.heart = hudIcon(scene, hudIcons.heart);
    this.livesText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5).setVisible(false);
    this.scoreText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5).setVisible(false);
    this.grenade = hudIcon(scene, hudIcons.grenade);
    this.grenadeText = scene.add.text(0, 0, '', font).setOrigin(0, 0.5).setVisible(false);
    this.enemyLabel = scene.add.text(0, 0, 'ENEMY', inkFont('18px')).setOrigin(0, 0.5).setVisible(false);
    this.barGfx = scene.add.graphics();
    this.weaponGfx = scene.add.graphics();
    this.pauseVeil = scene.add.graphics().setVisible(false);
    this.pauseLabel = scene.add
      .text(0, 0, 'ПАУЗА', {
        fontFamily,
        fontSize: '32px',
        color: cssColor(palette.ink),
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.deathLabel = scene.add
      .text(0, 0, 'ПОГИБ', {
        fontFamily,
        fontSize: '32px',
        color: cssColor(palette.ink),
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.edge = scene.add.graphics();
    this.versionText = scene.add
      .text(0, 0, `v${gameVersion}`, {
        fontFamily,
        fontSize: '12px',
        color: cssColor(palette.wallBand),
      })
      .setOrigin(0, 1);
    layer.add(this.heart);
    layer.add(this.livesText);
    layer.add(this.scoreText);
    layer.add(this.grenade);
    layer.add(this.grenadeText);
    layer.add(this.enemyLabel);
    layer.add(this.barGfx);
    layer.add(this.weaponGfx);
    layer.add(this.pauseVeil);
    layer.add(this.pauseLabel);
    layer.add(this.deathLabel);
    layer.add(this.edge);
    layer.add(this.versionText);
  }

  get hurt(): boolean {
    return this.hurtTimer > 0;
  }

  get livesLeft(): number {
    return this.lives;
  }

  get points(): number {
    return this.score;
  }

  /**
   * Подписи картинок справа в рамке. Щелчок зовёт pick.
   * Текущая подчёркнута. Кнопка не забирает фокус, пробел её не жмёт.
   */
  setPictures(ids: readonly string[], current: number, pick: PicturePick): void {
    this.onPicture = pick;
    for (const button of this.pictureButtons) button.remove();
    this.pictureButtons = ids.map((id, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === current ? 'hud-picture is-current' : 'hud-picture';
      button.textContent = id;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.onPicture?.(index);
      });
      this.figures.root.append(button);
      return button;
    });
  }

  /** Кнопки на завесе паузы. На экране смерти их нет. */
  setPauseMenu(actions: PauseMenu): void {
    this.pauseActions = actions;
  }

  /** Кнопки сложности. Подписи берутся из списка уровней. */
  setDifficultyMenu(pick: (id: string) => void): void {
    this.difficultyPick = pick;
  }

  /** «ДАЛЬШЕ» на нуле жизней. Enter эту кнопку не жмёт. */
  setContinue(go: () => void): void {
    this.onContinue = go;
  }

  /** Крестик, Esc и щелчок по затемнению. */
  setHelpMenu(close: () => void): void {
    this.helpCloseAction = close;
  }

  /** Подсказка. finger — жесты телефона, иначе клавиши и мышь. */
  setHelp(open: boolean, finger: boolean): void {
    this.helpNote.textContent = finger ? 'Палец' : 'Клавиатура и мышь';
    fillHelpRows(this.helpList, finger ? fingerHints : keyHints);
    this.helpDialog.classList.toggle('is-open', open);
    this.pauseMenu.style.visibility = open ? 'hidden' : '';
    this.difficultyMenu.style.visibility = open ? 'hidden' : '';
    this.helpGuard = open ? performance.now() + 400 : 0;
    if (open) this.placeHelp();
  }

  /** Заход или континуэ. Полоска сцены при этом не трогается. */
  carry(score: number, lives: number): void {
    this.score = Math.max(0, score);
    this.lives = Math.max(0, lives);
    this.livesText.setText(String(this.lives));
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
    this.syncFigures();
  }

  /**
   * true — сердец не осталось. amount — сколько снять за это попадание.
   * blink включает мигание сразу: пока окно идёт, пули не берут.
   */
  hurtSoldier(amount = 1, blink = true): boolean {
    const loss = Math.max(0, Math.round(amount));
    this.lives = Math.max(0, this.lives - loss);
    if (loss > 0 && blink) this.hurtTimer = hud.hurtMs;
    this.livesText.setText(String(this.lives));
    this.syncFigures();
    return this.lives === 0;
  }

  /** Окно после подъёма. Пока оно идёт, тело мигает и пули его не берут. */
  startBlink(): void {
    this.hurtTimer = hud.hurtMs;
  }

  setQuota(quota: number): void {
    this.quota = quota;
    this.paintBar();
  }

  note(): { slain: number; quota: number; hurt: number } {
    return { slain: this.slain, quota: this.quota, hurt: this.hurtTimer };
  }

  /** Полоска и мигание после ранения. Счёт и жизни сцена уже принесла заходом. */
  recall(slain: number, quota: number, hurt: number): void {
    if (quota >= 0) this.quota = Math.floor(quota);
    this.slain = Math.max(0, Math.min(this.quota, Math.floor(slain)));
    this.hurtTimer = Math.max(0, hurt);
    this.paintBar();
  }

  addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
    this.syncFigures();
  }

  /** Запас в нижней рамке, сразу после счёта. */
  setGrenades(count: number): void {
    this.grenades = Math.max(0, Math.floor(count));
    if (!this.band) return;
    this.paintGrenades();
    this.paintBar();
    this.syncFigures();
  }

  /** Автомат в рамке не рисуется: он и есть отсутствие ствола. Временный виден десять секунд. */
  setWeapon(kind: WeaponId): void {
    this.weapon = kind;
    this.paintWeapon();
  }

  /** Сегмент снят. true — полоска пуста, кадр кончается. */
  eat(): boolean {
    if (this.quota <= 0 || this.slain >= this.quota) return this.slain >= this.quota && this.quota > 0;
    this.slain += 1;
    this.paintBar();
    return this.slain >= this.quota;
  }

  /** Уехали, не убиты. Сегменты сходят без очков. true — полоска от этого пуста. */
  release(count: number): boolean {
    if (count <= 0 || this.quota <= 0) return false;
    this.quota = Math.max(this.slain, this.quota - count);
    this.paintBar();
    return this.slain >= this.quota && this.quota > 0;
  }

  /** Доля непрозрачности тела: мигание, пока держится окно после ранения. */
  stepHurt(delta: number): number {
    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    const blink = this.hurtTimer > 0 && Math.floor(this.hurtTimer / hud.blinkMs) % 2 === 0;
    return blink ? 0.3 : 1;
  }

  setHold(hold: 'pause' | 'continue' | 'over' | 'difficulty' | null, continuesLeft = 0): void {
    const visible = hold !== null;
    const dead = hold === 'continue' || hold === 'over';
    this.pauseVeil.setVisible(visible);
    this.pauseLabel.setVisible(dead);
    this.deathLabel.setVisible(dead);
    this.pauseMenu.classList.toggle('is-open', hold === 'pause');
    this.difficultyMenu.classList.toggle('is-open', hold === 'difficulty');
    this.continueButton.classList.toggle('is-open', dead);
    if (dead) this.pauseLabel.setText(`ОСТАЛОСЬ ПОПЫТОК  ${continuesLeft}`);
    if (this.frameWidth > 0) this.placeDeathCopy(this.frameWidth, this.frameHeight);
    if (hold === 'pause') this.placeOverlay(this.pauseMenu, this.pauseTitle, this.pauseButtons);
    if (hold === 'difficulty') this.placeOverlay(this.difficultyMenu, this.difficultyTitle, this.difficultyButtons);
  }

  draw(view: FrameLayout, width: number, height: number): void {
    const band = view.hud;
    this.band = band;
    this.frameWidth = width;
    this.frameHeight = height;
    const mid = band.y + Math.round(band.height / 2);
    const heartRight = this.placeIcon(this.heart, 10, mid, hudIcons.heartTrim);
    this.livesText.setPosition(heartRight + 8, mid);
    this.livesText.setText(String(this.lives));
    this.scoreText.setPosition(this.livesText.x + 36, mid);
    this.scoreText.setText(String(this.score).padStart(hud.scoreDigits, '0'));
    this.paintGrenades();
    this.paintBar();
    this.paintWeapon();

    this.pauseVeil.clear();
    this.pauseVeil.fillStyle(palette.black, 0.55);
    this.pauseVeil.fillRect(0, 0, width, height);
    this.placeDeathCopy(width, height);

    this.edge.clear();
    this.edge.fillStyle(palette.ink, 1);
    this.edge.fillRect(0, 0, width, 1);
    this.edge.fillRect(0, height - 1, width, 1);
    this.edge.fillRect(0, 0, 1, height);
    this.edge.fillRect(width - 1, 0, 1, height);
    this.versionText.setPosition(6, band.y + band.height - 3);
    this.syncFigures();
  }

  /**
   * Цифры стоят на тех же местах, что скрытый текст холста,
   * но в пикселях окна: увеличение кадра их не режет.
   */
  private syncFigures(): void {
    if (!this.band) return;
    const canvas = this.scene.game.canvas;
    if (canvas.width === 0 || canvas.height === 0) return;
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    const fontPx = figurePx * scaleY;
    this.placeFigure(this.figures.lives, this.livesText, scaleX, scaleY, fontPx);
    this.placeFigure(this.figures.score, this.scoreText, scaleX, scaleY, fontPx);
    this.placeFigure(this.figures.grenades, this.grenadeText, scaleX, scaleY, fontPx);
    this.placePictures(scaleX, scaleY, fontPx);
    if (this.pauseMenu.classList.contains('is-open')) {
      this.placeOverlay(this.pauseMenu, this.pauseTitle, this.pauseButtons);
    }
    if (this.difficultyMenu.classList.contains('is-open')) {
      this.placeOverlay(this.difficultyMenu, this.difficultyTitle, this.difficultyButtons);
    }
    if (this.continueButton.classList.contains('is-open')) this.placeContinue();
    if (this.helpDialog.classList.contains('is-open')) this.placeHelp();
  }

  /** «ПОГИБ» над строкой попыток. Длинная строка мельчает, чтобы влезть в кадр. */
  private placeDeathCopy(width: number, height: number): void {
    if (this.pauseLabel.visible) {
      const letters = Math.max(1, this.pauseLabel.text.length);
      const size = Math.max(16, Math.min(32, Math.floor((width - 32) / (letters * 0.6))));
      this.pauseLabel.setFontSize(`${size}px`);
    }
    this.pauseLabel.setPosition(width / 2, height / 2);
    this.deathLabel.setPosition(width / 2, height / 2 - this.pauseLabel.height / 2 - 16);
    if (this.continueButton.classList.contains('is-open')) this.placeContinue();
  }

  /** Кнопка под строкой попыток. Середина кадра — её середина. */
  private placeContinue(): void {
    const canvas = this.scene.game.canvas;
    if (canvas.width === 0 || canvas.height === 0) return;
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    const button = this.continueButton;
    button.style.fontSize = `${26 * scaleY}px`;
    button.style.padding = `${10 * scaleY}px ${22 * scaleX}px`;
    button.style.borderWidth = `${Math.max(2, Math.round(2 * scaleY))}px`;
    const below = this.pauseLabel.y + this.pauseLabel.height / 2 + 28;
    button.style.left = `${canvas.offsetLeft + (canvas.width / 2) * scaleX}px`;
    button.style.top = `${canvas.offsetTop + below * scaleY}px`;
  }

  /** Слово и кнопки — один столбец. Его середина совпадает с серединой кадра. */
  private placeOverlay(menu: HTMLElement, title: HTMLElement, buttons: readonly HTMLButtonElement[]): void {
    const canvas = this.scene.game.canvas;
    if (canvas.width === 0 || canvas.height === 0) return;
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    const fontPx = 26 * scaleY;
    title.style.fontSize = `${32 * scaleY}px`;
    menu.style.gap = `${18 * scaleY}px`;
    for (const button of buttons) {
      button.style.fontSize = `${fontPx}px`;
      button.style.padding = `${10 * scaleY}px ${18 * scaleX}px`;
      button.style.borderWidth = `${Math.max(2, Math.round(2 * scaleY))}px`;
    }
    menu.style.left = `${canvas.offsetLeft + (canvas.width / 2) * scaleX}px`;
    menu.style.top = `${canvas.offsetTop + (canvas.height / 2) * scaleY}px`;
  }

  /** Карточка по центру кадра. На низком окне строки встают в две колонки. */
  private placeHelp(): void {
    const canvas = this.scene.game.canvas;
    if (canvas.width === 0 || canvas.height === 0) return;
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    const card = this.helpCard;
    const short = canvas.clientHeight < 520;
    this.helpList.classList.toggle('is-grid', short);
    card.style.left = `${canvas.offsetLeft + (canvas.width / 2) * scaleX}px`;
    card.style.top = `${canvas.offsetTop + (canvas.height / 2) * scaleY}px`;
    card.style.width = `${Math.min(canvas.clientWidth * 0.92, 460 * scaleX)}px`;
    const cross = Math.max(28, Math.round(32 * scaleY));
    card.style.gap = `${10 * scaleY}px`;
    card.style.padding = `${cross}px ${16 * scaleX}px ${14 * scaleY}px`;
    card.style.borderWidth = `${Math.max(2, Math.round(2 * scaleY))}px`;
    this.helpTitle.style.fontSize = `${28 * scaleY}px`;
    this.helpNote.style.fontSize = `${16 * scaleY}px`;
    const rowPx = `${(short ? 15 : 18) * scaleY}px`;
    const rowGap = `${(short ? 8 : 14) * scaleX}px`;
    for (const row of this.helpList.querySelectorAll<HTMLElement>('.help-row')) {
      row.style.fontSize = rowPx;
      row.style.gap = short ? `${2 * scaleY}px` : rowGap;
    }
    this.helpList.style.gap = `${8 * scaleY}px`;
    this.helpClose.style.width = `${cross}px`;
    this.helpClose.style.height = `${cross}px`;
    this.helpClose.style.fontSize = `${Math.round(cross * 0.72)}px`;
  }

  /** Справа в рамке, от правого края. Текущая картинка уже помечена классом. */
  private placePictures(scaleX: number, scaleY: number, fontPx: number): void {
    const band = this.band;
    if (!band || this.pictureButtons.length === 0) return;
    const canvas = this.scene.game.canvas;
    const mid = band.y + band.height / 2;
    let cursor = canvas.offsetLeft + (band.x + band.width - 12) * scaleX;
    const gap = 6 * scaleX;
    for (let i = this.pictureButtons.length - 1; i >= 0; i -= 1) {
      const button = this.pictureButtons[i]!;
      button.style.fontSize = `${fontPx}px`;
      cursor -= button.offsetWidth;
      button.style.left = `${cursor}px`;
      button.style.top = `${canvas.offsetTop + mid * scaleY}px`;
      cursor -= gap;
    }
  }

  private placeFigure(
    el: HTMLSpanElement,
    text: Phaser.GameObjects.Text,
    scaleX: number,
    scaleY: number,
    fontPx: number,
  ): void {
    const canvas = this.scene.game.canvas;
    const color = text.style.color;
    el.textContent = text.text;
    el.style.color = typeof color === 'string' ? color : cssColor(palette.ink);
    el.style.fontSize = `${fontPx}px`;
    el.style.left = `${canvas.offsetLeft + text.x * scaleX}px`;
    el.style.top = `${canvas.offsetTop + text.y * scaleY}px`;
  }

  private paintBar(): void {
    const band = this.band;
    this.enemyLabel.setVisible(this.quota > 0);
    if (!band || this.frameWidth <= 0 || this.quota <= 0) return;
    const labelW = this.enemyLabel.width;
    const groupW = labelW + 8 + enemyBar.width;
    let x = Math.round((this.frameWidth - groupW) / 2);
    const grenadeRight = this.grenadeText.x + this.grenadeText.width + 16;
    if (x < grenadeRight) x = Math.round(grenadeRight);
    const mid = band.y + Math.round(band.height / 2);
    this.enemyLabel.setPosition(x, mid);
    const barX = x + labelW + 8;
    const barY = mid - enemyBar.height / 2;
    let segGap: number = enemyBar.gap;
    let segW = (enemyBar.width - segGap * (this.quota - 1)) / this.quota;
    if (this.quota > 1 && segW < 3) {
      segGap = 1;
      segW = (enemyBar.width - segGap * (this.quota - 1)) / this.quota;
    }
    if (this.quota > 1 && segW < 1) {
      segGap = 0;
      segW = enemyBar.width / this.quota;
    }
    const remaining = this.quota - this.slain;
    this.barGfx.clear();
    for (let i = 0; i < this.quota; i += 1) {
      this.barGfx.fillStyle(i < remaining ? palette.enemy : palette.barTrack, 1);
      this.barGfx.fillRect(
        Math.round(barX + i * (segW + segGap)),
        Math.round(barY),
        Math.max(1, Math.floor(segW)),
        enemyBar.height,
      );
    }
  }

  private paintWeapon(): void {
    const band = this.band;
    this.weaponGfx.clear();
    if (!band || this.weapon === 'rifle' || this.frameWidth <= 0) return;
    const mid = band.y + Math.round(band.height / 2);
    const reserve = this.pictureButtons.length > 1 ? 150 : 0;
    const x = this.frameWidth - 36 - reserve;
    if (this.weapon === 'rapid') {
      this.weaponGfx.fillStyle(palette.rapid, 1);
      for (let i = 0; i < 3; i += 1) this.weaponGfx.fillRect(x + i * 5, mid - 8, 3, 16);
      return;
    }
    this.weaponGfx.fillStyle(palette.spread, 1);
    this.weaponGfx.fillRect(x - 2, mid - 4, 22, 8);
  }

  private paintGrenades(): void {
    const band = this.band;
    if (!band) return;
    const mid = band.y + Math.round(band.height / 2);
    const left = Math.round(this.scoreText.x + this.scoreText.width + 12);
    const grenadeRight = this.placeIcon(this.grenade, left, mid, hudIcons.grenadeTrim);
    this.grenadeText.setText(String(this.grenades));
    this.grenadeText.setColor(cssColor(this.grenades > 0 ? palette.ink : palette.wallCrit));
    this.grenadeText.setPosition(grenadeRight + 6, mid);
  }

  /**
   * Левый край непрозрачных пикселей встаёт в visualLeft, середина рисунка — на mid.
   * Возвращает правый край рисунка.
   */
  private placeIcon(image: Phaser.GameObjects.Image, visualLeft: number, mid: number, trim: IconTrim): number {
    const contentMid = (trim.top + trim.bottom) / 2;
    image.setScale(1);
    image.setPosition(Math.round(visualLeft - trim.left), Math.round(mid - contentMid));
    return Math.round(image.x + trim.right);
  }
}

function hudIcon(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  return scene.add.image(0, 0, key).setOrigin(0, 0);
}

function mountFigures(scene: Phaser.Scene): HudFigures {
  const root = document.createElement('div');
  root.className = 'hud-figures';
  const lives = document.createElement('span');
  const score = document.createElement('span');
  const grenades = document.createElement('span');
  lives.className = 'hud-figure';
  score.className = 'hud-figure';
  grenades.className = 'hud-figure';
  root.append(lives, score, grenades);
  scene.game.canvas.parentElement?.querySelector('.hud-figures')?.remove();
  scene.game.canvas.insertAdjacentElement('afterend', root);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => root.remove());
  return { root, lives, score, grenades };
}

function mountPauseMenu(
  root: HTMLElement,
  pick: (kind: 'resume' | 'restart') => void,
): { menu: HTMLDivElement; title: HTMLParagraphElement; buttons: HTMLButtonElement[] } {
  const menu = document.createElement('div');
  menu.className = 'pause-menu';
  const title = document.createElement('p');
  title.className = 'pause-title';
  title.textContent = 'ПАУЗА';
  menu.append(title);
  const rows: { label: string; kind: 'resume' | 'restart' }[] = [
    { label: 'В бой', kind: 'resume' },
    { label: 'Новая игра', kind: 'restart' },
  ];
  const buttons = rows.map((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pause-action';
    button.textContent = row.label;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      button.blur();
      pick(row.kind);
    });
    menu.append(button);
    return button;
  });
  root.append(menu);
  return { menu, title, buttons };
}

function mountContinueButton(root: HTMLElement, go: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pause-action continue-action';
  button.textContent = 'ДАЛЬШЕ';
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    button.blur();
    go();
  });
  root.append(button);
  return button;
}

function mountDifficultyMenu(
  root: HTMLElement,
  pick: (id: string) => void,
): { menu: HTMLDivElement; title: HTMLParagraphElement; buttons: HTMLButtonElement[] } {
  const menu = document.createElement('div');
  menu.className = 'pause-menu';
  const title = document.createElement('p');
  title.className = 'pause-title';
  title.textContent = 'НОВАЯ ИГРА';
  menu.append(title);
  const buttons = difficulties.map((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pause-action';
    button.textContent = row.label;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      button.blur();
      pick(row.id);
    });
    menu.append(button);
    return button;
  });
  root.append(menu);
  return { menu, title, buttons };
}

const keyHints: { key: string; act: string }[] = [
  { key: 'Мышь', act: 'Прицел' },
  { key: 'Левая кнопка', act: 'Очередь, ноги стоят' },
  { key: 'Правая, G', act: 'Граната' },
  { key: 'A, D, стрелки', act: 'Шаг' },
  { key: 'Shift и направление', act: 'Бег' },
  { key: 'S, стрелка вниз', act: 'Колено' },
  { key: 'Ctrl и направление', act: 'Перекат' },
  { key: 'Esc', act: 'Пауза' },
  { key: 'Наступить', act: 'Подбор' },
];

const fingerHints: { key: string; act: string }[] = [
  { key: 'Стик вбок', act: 'Шаг' },
  { key: 'Стик к краю', act: 'Бег' },
  { key: 'Стик вниз', act: 'Колено' },
  { key: 'Дважды в сторону', act: 'Перекат' },
  { key: 'Палец справа', act: 'Прицел и огонь стоя' },
  { key: 'Круг над стиком', act: 'Граната' },
  { key: 'Кнопка в углу', act: 'Пауза' },
  { key: 'Наступить', act: 'Подбор' },
];

function fillHelpRows(list: HTMLElement, rows: readonly { key: string; act: string }[]): void {
  list.replaceChildren();
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'help-row';
    const key = document.createElement('span');
    key.className = 'help-key';
    key.textContent = row.key;
    const act = document.createElement('span');
    act.className = 'help-act';
    act.textContent = row.act;
    line.append(key, act);
    list.append(line);
  }
}

function mountHelpDialog(
  root: HTMLElement,
  close: () => void,
  scrimReady: () => boolean,
): {
  dialog: HTMLDivElement;
  card: HTMLDivElement;
  title: HTMLParagraphElement;
  note: HTMLParagraphElement;
  list: HTMLDivElement;
  close: HTMLButtonElement;
} {
  const dialog = document.createElement('div');
  dialog.className = 'help-dialog';
  const card = document.createElement('div');
  card.className = 'help-card';
  const title = document.createElement('p');
  title.className = 'pause-title';
  title.textContent = 'УПРАВЛЕНИЕ';
  const note = document.createElement('p');
  note.className = 'help-note';
  const list = document.createElement('div');
  list.className = 'help-list';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-x';
  button.textContent = '×';
  button.setAttribute('aria-label', 'Закрыть');
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.blur();
    close();
  });
  card.append(title, note, list, button);
  dialog.append(card);
  dialog.addEventListener('mousedown', (event) => event.preventDefault());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || !scrimReady()) return;
    close();
  });
  root.append(dialog);
  return { dialog, card, title, note, list, close: button };
}

function inkFont(size: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily,
    fontSize: size,
    color: cssColor(palette.ink),
  };
}
