/** Минимальная картина: 256×224 оригинала, удвоенные. Окно шире или выше — кадр дорастает. */
export const frame = {
  width: 512,
  height: 448,
} as const;

/**
 * Палитра кадра. Земля, фигуры Phaser и листы берут цвета отсюда.
 * Значения — 0xRRGGBB.
 */
export const palette = {
  black: 0x000000,
  sky: 0x7ea0c4,
  skyDeep: 0x3f6e98,
  skyLite: 0xc5dced,
  cloud: 0xe7f1f6,
  cloudShade: 0xb7c9d4,
  /** Дальные горы у горизонта: тень, свет на гребне, дальняя гряда. */
  mount: 0x6c6e76,
  mountLite: 0x9c9ea6,
  mountFar: 0x848a94,
  field: 0x6e7d45,
  grass: 0x3d8a34,
  grassDark: 0x246428,
  grassLite: 0x67ae4a,
  grassDeep: 0x173f1c,
  dirt: 0xb59c0d,
  dirtDark: 0x8d6a32,
  dirtLite: 0xe4c67c,
  pebble: 0x9a9078,
  cream: 0xe7d7b4,
  creamDark: 0xc2ae84,
  creamLite: 0xf7edd6,
  manor: 0xe8aa9c,
  manorDark: 0xc48476,
  manorLite: 0xf6d2c6,
  roof: 0xc65c2c,
  roofDark: 0x863616,
  roofLite: 0xe48c4a,
  roofWood: 0x6a4424,
  brick: 0xb4683c,
  brickDark: 0x7a4024,
  brickLite: 0xd48c5a,
  mortar: 0xdccfb4,
  wood: 0x8a5c32,
  woodDark: 0x5a3a1e,
  woodLite: 0xc49860,
  bark: 0x6b4428,
  barkDark: 0x3c2816,
  barkLite: 0x8d6240,
  /** Кроны и кусты. Свет листа ниже основной травы, иначе масса сливается с полем. */
  leaf: 0x145228,
  leafLite: 0x1e6c34,
  leafDark: 0x0c3018,
  iron: 0x6e6c66,
  ironLite: 0xc8c4b4,
  /** Синяя дверь 1-2 и дальние ангары. Плоская крыша, не черепица деревни. */
  steel: 0x3a5c9a,
  steelLite: 0x7aa4d4,
  steelDark: 0x1e3358,
  brass: 0xc6b24a,
  flower: 0xe6d25a,
  petal: 0xf4f0e6,
  bloom: 0xd45a58,
  glass: 0x243038,
  glassLite: 0xd5e6ec,
  door: 0x5a341c,
  doorLite: 0x8a5834,
  shutter: 0x5a6e64,
  shutterDark: 0x2c4038,
  line: 0x1a140e,
  wallLite: 0xd4c8b2,
  joint: 0x2a241c,
  hud: 0x675546,
  ink: 0xe7dcc4,
  soldier: 0x243044,
  aim: 0xf2e27a,
  muzzle: 0xfff6d0,
  soldierRoll: 0x3d5c82,
  wall: 0xa89880,
  wallBand: 0x6f6556,
  wallHurt: 0xd06a32,
  wallCrit: 0x8e3428,
  wallGone: 0x2c261f,
  enemyBullet: 0xff3b2e,
  enemyLane: 0xff9a2e,
  grenade: 0x2f6b3a,
  grenadeArc: 0xd5e29a,
  explosion: 0xf0c14a,
  heart: 0xd24b4b,
  blood: 0x8a2420,
  bloodDeep: 0x4c1412,
  enemy: 0x2e8f3c,
  enemyShade: 0x143d1e,
  house: 0xd8c3a2,
  houseRoof: 0x8d4632,
  barTrack: 0x3a332c,
  bush: 0x2f6a32,
  bushLeaf: 0x4e9440,
  bushHurt: 0x7d8a38,
  bushStump: 0x6a4528,
  crate: 0xc4a36a,
  crateBand: 0x8a6234,
  crateHurt: 0xa85a32,
  crateCrit: 0x6e3a28,
  rapid: 0x3c7edb,
  spread: 0xd24b3a,
  star: 0xf2c14e,
  tank: 0x5c6770,
  tankShade: 0x2a3138,
  tankTurret: 0x3d4650,
  tankBullet: 0xff6a1a,
  wheel: 0x8d97a3,
  wheelShade: 0x4a5560,
  truck: 0x9a7a48,
  truckShade: 0x5c4830,
  truckCab: 0x6e5434,
} as const;

/**
 * Доли высоты кадра. Небо держит свою долю: на высоком окне полоса растёт,
 * а не остаётся узкой шапкой. Остаток высоты забирает поле.
 */
export const bands = {
  sky: { ratio: 0.36, min: 72, max: 520 },
  /**
   * Пол, если окно не вмещает дорожку.
   * Обычная высота — wall.path, её считает кадр, не доля экрана.
   */
  track: { ratio: 0.06, min: 12, max: 20 },
  /**
   * Высота под гранату в родном размере: рисунок 34 пикселя и кромка.
   * Значки не сжимаются.
   */
  hud: { ratio: 0.1, min: 42, max: 42 },
  fieldMin: 80,
} as const;

/** Хитбокс. Лист солдата рисуется в том же прямоугольнике и правила боя не меняет. */
export const soldierBox = {
  width: 32,
  height: 44,
} as const;

/**
 * Шаг и бег, пиксели в секунду на картине шириной frame.width.
 * На широком кадре скорость умножается на ширину / frame.width,
 * поэтому пересечение дорожки занимает то же время.
 */
export const motion = {
  walk: 120,
  run: 240,
} as const;

/**
 * Веер ствола, пока зажата очередь. Три клетки по горизонтали от ног.
 * lowFromTop — доля высоты поля: ниже неё ствол смотрит в стену, выше — в поле.
 */
export const aimFan = {
  across: 0.07,
  lowFromTop: 0.58,
} as const;

/** Интервал очереди, пока левая кнопка зажата. */
export const fireIntervalMs = 70;

/** На сколько один выстрел удлиняет вспышку. Сама вспышка горит, пока зажат спуск. */
export const muzzleFlashMs = 36;

/**
 * Очередь всех стволов, файл `sounds/gun-fire-loop.wav`.
 * Повтор идёт без паузы и без щелчка.
 */
export const gunFire = {
  key: 'gun-fire',
  url: 'sounds/gun-fire-loop.wav',
} as const;

/** Бросок гранаты. На каждый бросок своя запись. Пустой запас и перекат молчат. */
export const grenadeThrow = {
  key: 'grenade-throw',
  url: 'sounds/grenade_throw.mp3',
} as const;

/** Разрыв гранаты о землю. На каждый разрыв своя запись. Сбитая в полёте молчит. */
export const grenadeBoom = {
  key: 'grenade-boom',
  url: 'sounds/grenade_exposion.mp3',
} as const;

/**
 * Вспышка попадания в кресте. Восемь кадров 92×69.
 * Кадр 25 мс: облако разгорается и рассыпается за 200 мс.
 * Пока ролик идёт, новый выстрел его не обрывает — иначе очередь видела бы только вспышку в центре.
 * На экране кадр вписан в прямоугольник креста того ствола, который выстрелил.
 */
export const hitFlash = {
  key: 'hit-flash',
  url: 'assets/hit-flash.png',
  frameWidth: 92,
  frameHeight: 69,
  frames: 8,
  frameMs: 25,
} as const;

/** Толщина штриха прерывистого квадрата. */
export const aimMark = {
  thickness: 2,
} as const;

/**
 * Три креста аркады, в пикселях кадра 512 (на экране 256 это вдвое меньше).
 * reach — половина ширины. reachY — половина высоты. Прямоугольник креста и есть попадание.
 * gap — разрыв посередине каждой стороны: туда смотрит треугольник.
 * mark — цвет четырёх треугольников. Рамка у всех одного рисунка.
 * Автомат — квадрат со стороной 16, удар 0.5. Частый — тот же квадрат и чаще, удар 1.
 * Широкий — 56 на 28, реже, удар 3: зелёный снимается залпом.
 * Оба временных держатся десять секунд и сгорают раньше, если сцена кончилась.
 * Вспышка попадания одна и та же, на экране она вписана в прямоугольник креста этого ствола.
 */
export const weapons = {
  rifle: {
    intervalMs: fireIntervalMs,
    damage: 0.5,
    reach: 8,
    reachY: 8,
    gap: 2,
    mark: palette.enemyLane,
  },
  rapid: {
    intervalMs: 34,
    damage: 1,
    reach: 8,
    reachY: 8,
    gap: 2,
    mark: palette.rapid,
  },
  spread: {
    intervalMs: 210,
    damage: 3,
    reach: 28,
    reachY: 14,
    gap: 6,
    mark: palette.spread,
  },
} as const;

export type WeaponId = keyof typeof weapons;

/** Срок частого и широкого ствола. Новый подбор начинает его заново. */
export const weaponHoldMs = 10_000;

/** Доля роста стойки. Колено — поза, колонку попадания не меняет. */
export const kneelScale = 0.62;

/**
 * Короткий кувырок. Длина — в колонках текущей дорожки.
 * Окно неуязвимости равно длительности. Успевает сменить секцию.
 */
export const rollMove = {
  short: { columns: 1.05, durationMs: 280 },
} as const;

/**
 * Передняя стена. Макушка чуть выше шлема.
 * Под низом — короткая дорожка до рамки, по ней ходит солдат.
 */
export const wall = {
  hits: 8,
  stripes: 4,
  /** Насколько забор выше кадра солдата. */
  aboveHead: 8,
  /** Земля между низом забора и рамкой. Не растёт с окном. */
  path: 20,
  seam: 4,
} as const;

/** Старт как у FRAG-57: десять гранат. Число стоит в рамке, сразу после счёта. */
export const grenade = {
  stock: 10,
  flightMs: 800,
  arcLift: 96,
  body: 8,
  /** Попадание по телу гранаты, если прицел на ней. */
  aimRadius: 22,
  /** Попадание пулей по дуге, когда граната уже оторвалась от прямой на точку. */
  hitRadius: 14,
  armT: 0.2,
  lateT: 0.8,
  explodeMs: 280,
  /** Разрыв по земле. Пачка у точки выхода входит, вся волна — нет. Рисунок садится на этот радиус. */
  blastRadius: 30,
  /** Сколько жизней ящика снимает разрыв. Куст в радиусе кончается сразу. */
  propHits: 3,
} as const;

/**
 * Летящая граната. Кадр 48×48, тело внутри примерно 20×35.
 * На экране кадр вдвое мельче: граната читается и не закрывает солдата.
 * Дальше по полю мельчает так же, как остальные фигуры.
 */
export const grenadeFly = {
  key: 'grenade-fly',
  url: 'assets/grenade.png',
  frame: 48,
  /** Сторона кадра у нижнего края поля. */
  display: 24,
  /** Полных оборотов за полёт, в сторону броска. */
  turns: 2,
} as const;

/**
 * Ролик разрыва гранаты. Один переключатель.
 * `ring` — старый круг. `ground` — вспышка с земли.
 */
export const grenadeBlast: 'ring' | 'ground' = 'ground';

/** Падение на дорожку — твин. Подбор телом, когда предмет уже лёг. */
export const pickup = {
  fallMs: 480,
  size: 18,
  /** Одна граната к текущему запасу. Потолка нет: между сценами гранаты копятся. */
  grenades: 1,
  /** Ниже середины хитбокса, к ступням. */
  feet: 10,
} as const;

export type DropKind = 'grenades' | 'rapid' | 'spread' | 'star' | 'bonus' | 'medal' | 'ton';

/** Звезда — отдельный номинал, не очки за сам объект. */
export const star = {
  score: 2000,
} as const;

/** Табличка 500. Очки приходят, когда солдат на неё наступает. */
export const bonus = {
  score: 500,
} as const;

/** Табличка 1000. Очки приходят, когда солдат на неё наступает. */
export const medal = {
  score: 1000,
} as const;

/** Табличка 100. Очки приходят, когда солдат на неё наступает. */
export const ton = {
  score: 100,
} as const;

/**
 * Куст и ящик. Несколько стадий, потом дроп.
 * Куст рисуется пикселями, ящик — цветным ящиком. Хитбокс со стадией не сжимается.
 * Очки за объект выше зелёного.
 */
export const scenery = {
  bush: { hp: 4, stages: 3, width: 64, height: 52, score: 500 },
  crate: { hp: 6, stages: 3, width: 48, height: 40, score: 1000 },
} as const;

/** Лист передней стены. Жизни колонки прежние: когда они кончаются, играет ролик. */
export const fence = {
  width: 96,
  height: 48,
  frames: 9,
  frameRate: 12,
} as const;

/**
 * Короткий кирпич на траве. Кадр ниже передней стены: 96×32, кладка внутри.
 * Очки как за крупный предмет. Гранаты снимает сразу, очередь колет.
 */
export const shortFence = {
  width: 96,
  height: 32,
  frames: 9,
  frameRate: 12,
  hp: 6,
  score: 1000,
  ink: { x: 20, y: 5, w: 57, h: 21 },
} as const;

/**
 * Одна секция мешков. Кадр 96×32, три мешка в ряд.
 * Очередь колет, граната снимает секцию сразу.
 * Очки секции — в момент разрушения. Бонус задаёт картинка.
 */
export const sandbag = {
  width: 96,
  height: 32,
  frames: 9,
  frameRate: 12,
  hp: 6,
  score: 500,
  ink: { x: 24, y: 11, w: 48, h: 16 },
} as const;

/**
 * Жерди вдоль дороги. Очередь колет, граната снимает забор сразу.
 * Сломанный остаётся стоять. Очки — в момент слома. Бонус задаёт картинка.
 */
export const railFence = {
  hp: 8,
  score: 500,
} as const;

/**
 * Штакетник. Очередь колет секцию, граната снимает её сразу.
 * Секция — пролёт от толстого столба. Сломанная остаётся стоять.
 * Очки — в момент слома. Бонус задаёт картинка.
 * height — доски у подошвы, до сжатия маленького окна.
 */
export const picket = {
  height: 28,
  hp: 6,
  score: 500,
} as const;

/**
 * Бочка на поле. Очередь колет, граната снимает сразу.
 * Слом сыплет щепой. Остаётся нижняя половина. Очки — в момент слома.
 * Бонус задаёт картинка. width и height — пиксели у ближнего края, до глубины.
 */
export const barrel = {
  hp: 6,
  score: 500,
  width: 20,
  height: 28,
} as const;

/**
 * Дерево на поле. Очередь колет, граната валит сразу.
 * Щепки с места удара. У живого ещё листья и куча по ширине кроны.
 * Ствол не пропадает. Сухое и живое ставят один лист: пень на месте ствола, крона лежит рядом.
 * Сторона падения зеркалится. У живого куча остаётся.
 * Очки — в момент слома. Бонус задаёт картинка.
 */
export const tree = {
  hp: 8,
  score: 1000,
} as const;

/**
 * Кирпичная печь. Очередь колет, разрыв снимает `grenade.propHits`.
 * Четыре гранаты роняют: печь трясётся и уходит в землю, пыль стоит у подошвы, лом остаётся, с кучи идут дым и огонь.
 * Попадание сыплет кирпичом с места удара. Очки — в момент обрушения.
 * Бонус берётся из списка картинки. Пустая полоска печь не трогает и бонус не даёт.
 * radius — радиус купола на опорном кадре, до сжатия маленького окна.
 * scrap — доля высоты купола у лома.
 */
export const kiln = {
  blasts: 4,
  score: 1000,
  scrap: 0.34,
  collapseMs: 2000,
  radius: 30,
} as const;

/**
 * Камень на газоне. Очередь колет, граната разбивает сразу.
 * Попадание сыплет каменной крошкой с места удара. Слом оставляет низкую кучу.
 * Очки — в момент слома. Бонус берётся из списка картинки.
 * width и height — пиксели у ближнего края, до глубины.
 * ruin — доля высоты валуна у кучи.
 */
export const rock = {
  hp: 8,
  score: 500,
  width: 64,
  height: 44,
  ruin: 0.42,
} as const;

/**
 * Дом на поле. Очередь колет, разрыв снимает `grenade.propHits`.
 * Попадание сыплет ошметками с места удара. Четыре гранаты роняют: дом трясётся и уходит в землю, пыль стоит у цоколя лома.
 * Лом остаётся, с кучи идут дым и огонь. Очки — в момент обрушения.
 * Обрушение от игрока берёт один бонус из списка картинки. Пустая полоска дом не трогает и бонус не даёт.
 * scrap — доля высоты фасада у лома. plinth — нижняя доля лома, там клубы.
 */
export const house = {
  blasts: 4,
  score: 2000,
  scrap: 0.34,
  plinth: 0.42,
  collapseMs: 2000,
} as const;

export type PropKind = keyof typeof scenery;

/**
 * Один выстрел зелёного, не очередь. Замах запирает колонку.
 * Пуля выходит из солдата и летит со своей скоростью: дальше — дольше.
 * Между выстрелами пауза, чтобы следующая не сливалась с той, что ещё в воздухе.
 */
export const volley = {
  leadMs: 320,
  /** Пиксели в секунду на картине шириной frame.width. */
  speed: 220,
  minTravelMs: 280,
  recoverMs: 900,
  thickness: 5,
  length: 12,
} as const;

/**
 * Зелёный. Фигура — прямоугольник этого хитбокса.
 * Масштаб берётся из глубины точки на поле.
 */
export const green = {
  hp: 2,
  width: 30,
  height: 40,
  /** Выбег к игроку, доля высоты поля. */
  run: 0.12,
  /** Веер пачки, доля ширины поля на шаг от середины. */
  spread: 0.07,
  runMs: 560,
  /** Стоит и ещё не целится. Вся пачка успевает выйти, пока первый не открыл огонь. */
  holdMs: 880,
  /** Пауза между зелёными одной точки. */
  gapMs: 300,
  score: 210,
} as const;

/**
 * Гусеничный танк. Встаёт, даёт один залп и едет дальше.
 * Медленнее колёсного. Много пуль или одна граната, 5000 очков.
 * Уехал целым — сегмент сходит с полоски без очков.
 */
export const tank = {
  hp: 28,
  width: 104,
  height: 48,
  holdMs: 520,
  score: 5000,
  /** Доля ширины поля в секунду. */
  speed: 0.28,
} as const;

/**
 * Колёсный танк. Тот же залп и те же очки, но едет быстрее и стоит меньше.
 */
export const wheel = {
  hp: tank.hp,
  width: 100,
  height: 44,
  holdMs: 240,
  score: tank.score,
  speed: 0.62,
} as const;

/**
 * Грузовик. Едет поперёк поля, встаёт, высаживает зелёных и уходит.
 * Очередь его колет, граната снимает сразу — и тех, кто ещё в кузове.
 * Уехал целым: очков нет, его сегмент и оставшиеся в кузове сходят с полоски.
 */
export const truck = {
  hp: 16,
  width: 96,
  height: 36,
  score: 3000,
  driveMs: 1100,
  riders: 4,
  dropGapMs: 360,
  pauseMs: 280,
} as const;

/** Залп танка. Шесть тяжёлых пуль из танка в запертую колонку. */
export const tankVolley = {
  leadMs: 260,
  burst: 6,
  gapMs: 90,
  speed: 640,
} as const;

/** Чем выше на поле, тем мельче фигура. Низ поля — полный хитбокс. */
export const depth = {
  far: 0.62,
  near: 1,
} as const;

/**
 * Пехота. Бежит по дальней половине поля, останавливается, стреляет одной пулей
 * и снова выбирает сторону. На сцене не больше cap живых.
 * width и height — коробка постановки у ближнего края, до глубины.
 * Клетка листа рисуется своими пикселями от ступни этой коробки.
 */
export const infantry = {
  hp: green.hp,
  width: 32,
  height: 36,
  score: green.score,
  cap: 6,
  /** Доля ширины поля в секунду. */
  speed: 0.22,
  /** Длина перебежки, доля ширины. Не весь переход, часть пути. */
  leg: { min: 0.16, max: 0.42 },
  /** Край поля, за который нога не заступает. */
  edge: 0.04,
  holdMs: 200,
  /** Кадр вспышки у дула. Наводка длиннее и остаётся стойкой. */
  muzzleMs: 80,
  /** Труп и лужа под ним. Потом пропадают. */
  corpseMs: 3000,
} as const;

/** Полоска ENEMY в рамке. Один сегмент — одно убийство волны. */
export const enemyBar = {
  width: 156,
  height: 12,
  gap: 3,
} as const;

export const hud = {
  lives: 5,
  continues: 3,
  scoreDigits: 6,
  hurtMs: 1000,
  blinkMs: 80,
  /** Пустая полоска ещё секунду не глушит кадр: вспышка и щепа доигрывают. */
  victoryStunMs: 1000,
  /** Замерший кадр держит слово, затем следующая картинка. */
  victoryMs: 3000,
} as const;

/**
 * Палец. Доли радиуса стика, 1 — палец упёрт в край.
 * Колено — узкая колонка вниз. Перекат — второе нажатие в ту же сторону за doubleMs.
 * aimGain — ход креста к ходу пальца. 1 значит столько же, сколько палец проехал по стеклу.
 */
export const touch = {
  dead: 0.22,
  run: 0.82,
  kneelX: 0.34,
  kneelY: 0.4,
  /** Два нажатия стика в одну сторону ближе этого — короткий перекат. */
  doubleMs: 300,
  aimGain: 1.45,
} as const;

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
