/**
 * faceAnim.ts — Биофизический движок анимации лица
 *
 * Все функции чистые: (time, dt, state) → результат.
 * Никаких привязок к фиксированному FPS — всё строго на delta-time.
 *
 * Модули:
 *  1. BlinkEngine  — асимметричная кинематика моргания (Human Blink Physics)
 *  2. SaccadeEngine — саккады, микро-дрейф, тремор зрачков
 *  3. MouthEngine   — spring/damping артикуляция + idle breathing
 */

// ──────────────────────────────────────────────────────────────────────
//  Утилиты
// ──────────────────────────────────────────────────────────────────────

/** Сидированный рандом для вариативности (не crypto, достаточно для анимации) */
function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Линейная интерполяция */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

/** Ease-out cubic — быстрое начало, плавное торможение (закрытие века) */
function easeOutCubic(t: number): number {
  const t1 = 1 - t
  return 1 - t1 * t1 * t1
}

/** Ease-in-out quad — плавное ускорение и торможение (открытие века) */
function easeInOutQuad(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : 1 - (-2 * t + 2) ** 2 / 2
}

/** Clamp */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// ──────────────────────────────────────────────────────────────────────
//  1. BLINK ENGINE — Реалистичная кинематика моргания
// ──────────────────────────────────────────────────────────────────────
//
//  Физика человеческого моргания:
//  - Закрытие: ~80-100 мс, ease-out (orbicularis oculi — быстрое сокращение)
//  - Открытие: ~140-180 мс, ease-in-out (levator palpebrae — плавнее)
//  - Асимметрия: micro-delay 10-20 мс между глазами
//  - Двойное моргание: ~25% шанс, пауза 120-180 мс
//  - Микро-моргания: очень быстрые, неполные (blink_level 0.3-0.6)
//

/** Фаза одного моргания */
export type BlinkPhase =
  | 'idle'           // глаза открыты, ждём следующего моргания
  | 'closing'        // веко опускается (быстро, ~90 мс)
  | 'closed'         // веко закрыто (очень кратко, ~20-40 мс)
  | 'opening'        // веко поднимается (медленнее, ~160 мс)
  | 'double_pause'   // пауза между двойными морганиями (~150 мс)
  | 'double_closing' // второе закрытие (двойное моргание)
  | 'double_closed'  // второе закрытие полностью
  | 'double_opening' // второе открытие

export interface BlinkState {
  // Таймеры
  phase: BlinkPhase
  phaseTime: number       // время в текущей фазе (сек)
  nextBlinkAt: number     // через сколько секунд следующее моргание
  blinkCount: number      // количество морганий (для чередования)

  // Тип текущего моргания
  isDoubleBlink: boolean  // двойное моргание?
  isMicroBlink: boolean   // микро-моргание (неполное)?
  microBlinkDepth: number // глубина микро-моргания (0.3..0.6)

  // Результирующие уровни закрытости (0 = открыт, 1 = закрыт)
  leftLevel: number
  rightLevel: number

  // Межглазная задержка (для живости)
  interEyeDelay: number   // текущая задержка (10-20 мс)
  rightPhaseTime: number  // фазовое время правого глаза (= phaseTime - delay)

  // Микро-джиттер век
  leftJitter: number
  rightJitter: number
  jitterTimer: number

  // Параметры длительностей текущего моргания (генерируются при старте)
  closeDur: number  // ~0.08..0.10 сек
  closedDur: number // ~0.02..0.04 сек
  openDur: number   // ~0.14..0.18 сек
}

/** Базовый интервал между морганиями (сек) */
const BLINK_BASE_INTERVAL = 3.5
/** Разброс интервала (±) */
const BLINK_INTERVAL_JITTER = 1.8
/** Шанс двойного моргания */
const DOUBLE_BLINK_CHANCE = 0.22
/** Шанс микро-моргания */
const MICRO_BLINK_CHANCE = 0.12
/** Длительность паузы между двойными морганиями */
const DOUBLE_PAUSE_DUR = 0.15

export function createBlinkState(): BlinkState {
  return {
    phase: 'idle',
    phaseTime: 0,
    nextBlinkAt: rnd(1.5, 3.0), // первое моргание через 1.5-3 сек
    blinkCount: 0,

    isDoubleBlink: false,
    isMicroBlink: false,
    microBlinkDepth: 0,

    leftLevel: 0,
    rightLevel: 0,

    interEyeDelay: 0,
    rightPhaseTime: 0,

    leftJitter: 0,
    rightJitter: 0,
    jitterTimer: 0,

    closeDur: 0.09,
    closedDur: 0.03,
    openDur: 0.16,
  }
}

/**
 * Генерирует случайные параметры нового моргания.
 * Вызывается при переходе idle→closing.
 */
function initBlinkParams(s: BlinkState): void {
  // Длительности с вариацией
  s.closeDur = rnd(0.075, 0.105)   // 75-105 мс закрытие
  s.closedDur = rnd(0.020, 0.045)  // 20-45 мс закрытое
  s.openDur = rnd(0.135, 0.185)    // 135-185 мс открытие

  // Межглазная задержка
  s.interEyeDelay = rnd(0.008, 0.022)  // 8-22 мс

  // Тип моргания
  s.isDoubleBlink = Math.random() < DOUBLE_BLINK_CHANCE
  s.isMicroBlink = !s.isDoubleBlink && Math.random() < MICRO_BLINK_CHANCE
  s.microBlinkDepth = s.isMicroBlink ? rnd(0.3, 0.6) : 1.0
}

/**
 * Вычисляет уровень закрытости одного глаза по фазе и прогрессу.
 * @param phase   текущая фаза
 * @param t       нормализованный прогресс фазы (0..1)
 * @param maxDepth максимальная глубина (1.0 для обычного, 0.3-0.6 для микро)
 */
function computeEyeLevel(phase: BlinkPhase, t: number, maxDepth: number): number {
  switch (phase) {
    case 'idle':
      return 0

    case 'closing':
    case 'double_closing':
      // Ease-out cubic: быстрое ускорение в начале, замедление к закрытию
      return easeOutCubic(t) * maxDepth

    case 'closed':
    case 'double_closed':
      return maxDepth

    case 'opening':
    case 'double_opening':
      // Ease-in-out quad: плавный старт и плавная остановка
      return maxDepth * (1 - easeInOutQuad(t))

    case 'double_pause':
      // Глаза чуть приоткрыты в паузе между двойным морганием
      return maxDepth * 0.15

    default:
      return 0
  }
}

/**
 * Основная функция обновления моргания. Чистая по логике (мутирует только state).
 * @param s    состояние моргания
 * @param dt   дельта-тайм (сек)
 * @param enabled  включено ли моргание
 * @param baseInterval  базовый интервал из параметров
 * @param baseDuration  базовая длительность из параметров
 */
export function updateBlink(
  s: BlinkState,
  dt: number,
  enabled: boolean,
  baseInterval: number,
  _baseDuration: number,
): void {
  if (!enabled) {
    s.leftLevel = 0
    s.rightLevel = 0
    s.phase = 'idle'
    s.phaseTime = 0
    return
  }

  // Микро-джиттер век (едва заметное дрожание)
  s.jitterTimer += dt
  if (s.jitterTimer > 0.07) {
    s.jitterTimer = 0
    s.leftJitter = rnd(-0.008, 0.008)
    s.rightJitter = rnd(-0.008, 0.008)
  }

  s.phaseTime += dt

  switch (s.phase) {
    case 'idle': {
      s.nextBlinkAt -= dt
      if (s.nextBlinkAt <= 0) {
        // Начинаем новое моргание
        s.phase = 'closing'
        s.phaseTime = 0
        s.blinkCount++
        initBlinkParams(s)
        // Следующий интервал
        const base = Math.max(0.5, baseInterval || BLINK_BASE_INTERVAL)
        s.nextBlinkAt = base + rnd(-BLINK_INTERVAL_JITTER, BLINK_INTERVAL_JITTER)
      }
      break
    }

    case 'closing': {
      if (s.phaseTime >= s.closeDur) {
        s.phase = 'closed'
        s.phaseTime = 0
      }
      break
    }

    case 'closed': {
      if (s.phaseTime >= s.closedDur) {
        s.phase = 'opening'
        s.phaseTime = 0
      }
      break
    }

    case 'opening': {
      if (s.phaseTime >= s.openDur) {
        if (s.isDoubleBlink) {
          // Переходим к паузе двойного моргания
          s.phase = 'double_pause'
          s.phaseTime = 0
        } else {
          s.phase = 'idle'
          s.phaseTime = 0
        }
      }
      break
    }

    case 'double_pause': {
      if (s.phaseTime >= DOUBLE_PAUSE_DUR) {
        s.phase = 'double_closing'
        s.phaseTime = 0
        // Второе моргание чуть быстрее
        s.closeDur *= 0.85
        s.openDur *= 0.9
      }
      break
    }

    case 'double_closing': {
      if (s.phaseTime >= s.closeDur) {
        s.phase = 'double_closed'
        s.phaseTime = 0
      }
      break
    }

    case 'double_closed': {
      if (s.phaseTime >= s.closedDur) {
        s.phase = 'double_opening'
        s.phaseTime = 0
      }
      break
    }

    case 'double_opening': {
      if (s.phaseTime >= s.openDur) {
        s.phase = 'idle'
        s.phaseTime = 0
        s.isDoubleBlink = false
      }
      break
    }
  }

  // Вычисляем уровни для каждого глаза
  const dur = (() => {
    switch (s.phase) {
      case 'closing':
      case 'double_closing':
        return s.closeDur
      case 'closed':
      case 'double_closed':
        return s.closedDur
      case 'opening':
      case 'double_opening':
        return s.openDur
      case 'double_pause':
        return DOUBLE_PAUSE_DUR
      default:
        return 1
    }
  })()

  const tLeft = clamp(s.phaseTime / Math.max(0.001, dur), 0, 1)
  // Правый глаз задерживается на interEyeDelay
  const rightTime = Math.max(0, s.phaseTime - s.interEyeDelay)
  const tRight = clamp(rightTime / Math.max(0.001, dur), 0, 1)

  const depth = s.isMicroBlink ? s.microBlinkDepth : 1.0
  s.leftLevel = clamp(computeEyeLevel(s.phase, tLeft, depth) + s.leftJitter, 0, 1)
  s.rightLevel = clamp(computeEyeLevel(s.phase, tRight, depth) + s.rightJitter, 0, 1)
}

/**
 * Возвращает максимальный уровень закрытости (для совместимости со старым blink_state).
 * 0 = полностью открыт, 1 = полностью закрыт.
 */
export function blinkLevel(s: BlinkState): number {
  return Math.max(s.leftLevel, s.rightLevel)
}


// ──────────────────────────────────────────────────────────────────────
//  2. SACCADE ENGINE — Саккады, микро-дрейф, тремор зрачков
// ──────────────────────────────────────────────────────────────────────
//
//  Физиология движения глаз:
//  - Саккада: быстрый скачок в новую точку фиксации (30-50 мс)
//  - Фиксация: удержание взгляда (200-600 мс)
//  - Дрейф: медленное непроизвольное смещение (0.1-0.5°/с)
//  - Тремор: высокочастотное микро-колебание (70-90 Гц, ~0.01° амплитуда)
//  - Реакция века: при взгляде вниз верхнее веко чуть опускается
//

export type SaccadePhase = 'fixation' | 'saccade'

export interface SaccadeState {
  phase: SaccadePhase

  // Текущая позиция зрачков (смещение от центра глаза)
  currentX: number
  currentY: number

  // Целевая позиция (куда перемещается взгляд)
  targetX: number
  targetY: number

  // Позиция на старте саккады (для интерполяции)
  startX: number
  startY: number

  // Таймеры
  phaseTime: number
  saccadeDur: number    // длительность текущей саккады (0.03-0.05 сек)
  fixationDur: number   // длительность текущей фиксации (0.2-0.6 сек)

  // Дрейф во время фиксации
  driftX: number
  driftY: number
  driftAngle: number    // направление дрейфа (медленно вращается)

  // Тремор
  tremorPhase: number   // фаза тремора (0..2π)

  // Реакция века на направление взгляда
  lidDroop: number      // 0..~0.15, добавляется к blink level при взгляде вниз
}

/** Максимальное смещение зрачка от центра (в клетках сетки) */
const MAX_PUPIL_OFFSET = 2.5
/** Амплитуда дрейфа */
const DRIFT_AMP = 0.08
/** Скорость дрейфа */
const DRIFT_SPEED = 0.4
/** Амплитуда тремора */
const TREMOR_AMP = 0.025
/** Частота тремора (Гц) */
const TREMOR_FREQ = 80

export function createSaccadeState(): SaccadeState {
  return {
    phase: 'fixation',
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
    startX: 0,
    startY: 0,
    phaseTime: 0,
    saccadeDur: 0.04,
    fixationDur: rnd(0.3, 0.8),
    driftX: 0,
    driftY: 0,
    driftAngle: rnd(0, Math.PI * 2),
    tremorPhase: 0,
    lidDroop: 0,
  }
}

/**
 * Ease-out-quint для сверхбыстрого начала саккады с плавным торможением.
 * Имитирует баллистическую траекторию глазного яблока.
 */
function saccadeEasing(t: number): number {
  return 1 - (1 - t) ** 5
}

/**
 * Обновляет состояние саккад и микро-движений зрачков.
 * @param s      состояние
 * @param dt     дельта-тайм
 * @param move   включено ли движение зрачков
 * @param scale  масштаб смещения (зависит от размера глаз модели)
 */
export function updateSaccade(
  s: SaccadeState,
  dt: number,
  move: boolean,
  scale: number = 1,
): void {
  if (!move) {
    s.currentX = 0
    s.currentY = 0
    s.lidDroop = 0
    return
  }

  const maxOff = MAX_PUPIL_OFFSET * scale

  s.phaseTime += dt

  // Тремор — высокочастотное микро-колебание (непрерывно)
  s.tremorPhase += dt * TREMOR_FREQ * Math.PI * 2
  if (s.tremorPhase > Math.PI * 200) s.tremorPhase -= Math.PI * 200 // предотвращаем overflow
  const tremorX = Math.sin(s.tremorPhase) * TREMOR_AMP * scale
  const tremorY = Math.cos(s.tremorPhase * 1.3) * TREMOR_AMP * scale * 0.7

  switch (s.phase) {
    case 'fixation': {
      // Медленный дрейф
      s.driftAngle += dt * DRIFT_SPEED * rnd(0.7, 1.3)
      s.driftX += Math.cos(s.driftAngle) * DRIFT_AMP * dt * scale
      s.driftY += Math.sin(s.driftAngle) * DRIFT_AMP * dt * scale
      // Ограничиваем дрейф
      const driftMag = Math.sqrt(s.driftX * s.driftX + s.driftY * s.driftY)
      if (driftMag > 0.3 * scale) {
        s.driftX *= 0.95
        s.driftY *= 0.95
      }

      // Конец фиксации → начинаем новую саккаду
      if (s.phaseTime >= s.fixationDur) {
        s.phase = 'saccade'
        s.phaseTime = 0
        s.startX = s.currentX
        s.startY = s.currentY
        // Новая случайная точка фиксации
        // Тенденция возвращаться ближе к центру (natural gaze bias)
        const bias = 0.3
        s.targetX = rnd(-maxOff, maxOff) * (1 - bias) + 0 * bias
        s.targetY = rnd(-maxOff * 0.6, maxOff * 0.6) * (1 - bias) + 0 * bias
        s.saccadeDur = rnd(0.028, 0.052)
        s.driftX = 0
        s.driftY = 0
        s.driftAngle = rnd(0, Math.PI * 2)
      }

      // Применяем дрейф + тремор поверх текущей позиции
      // (позиция остаётся та, что установилась в конце последней саккады)
      break
    }

    case 'saccade': {
      const t = clamp(s.phaseTime / Math.max(0.001, s.saccadeDur), 0, 1)
      const ease = saccadeEasing(t)
      s.currentX = lerp(s.startX, s.targetX, ease)
      s.currentY = lerp(s.startY, s.targetY, ease)

      if (t >= 1) {
        s.phase = 'fixation'
        s.phaseTime = 0
        s.currentX = s.targetX
        s.currentY = s.targetY
        s.fixationDur = rnd(0.25, 0.7)
      }
      break
    }
  }

  // Финальные координаты с дрейфом и тремором
  const rawX = s.currentX + s.driftX + tremorX
  const rawY = s.currentY + s.driftY + tremorY
  // Clamping в пределах глаза
  s.currentX = clamp(rawX, -maxOff, maxOff)
  s.currentY = clamp(rawY, -maxOff * 0.6, maxOff * 0.6)

  // Реакция века на направление взгляда:
  // при взгляде вниз верхнее веко слегка приспускается
  const yNorm = s.currentY / Math.max(0.01, maxOff * 0.6) // -1..1, + = вниз
  s.lidDroop = yNorm > 0 ? yNorm * 0.12 : 0
}

/**
 * Возвращает смещение зрачка для конкретного глаза.
 * Оба глаза смотрят координированно (сопряжённое движение).
 */
export function getPupilOffset(s: SaccadeState): { x: number; y: number } {
  return { x: s.currentX, y: s.currentY }
}


// ──────────────────────────────────────────────────────────────────────
//  3. MOUTH ENGINE — Органическая артикуляция рта
// ──────────────────────────────────────────────────────────────────────
//
//  Физика рта:
//  - Spring/damping система для инерции мышечной массы губ
//  - Idle breathing: едва заметные микро-движения в покое (3.5-4.5 сек)
//  - Плавная интерполяция открытости с нелинейным откликом
//  - Адаптация формы: округление при средней открытости, растяжение при широком открытии
//

export interface MouthState {
  // Текущая открытость (0..1)
  openness: number
  // Скорость изменения (для spring/damping)
  velocity: number
  // Целевая открытость
  target: number

  // Idle breathing
  breathPhase: number      // фаза дыхания (рад)
  breathPeriod: number     // текущий период дыхания (3.5-4.5 сек)
  breathAmplitude: number  // амплитуда дыхательных микро-движений

  // Smoothed amplitude для lip-sync (EMA фильтр)
  smoothAmplitude: number

  // Адаптивная форма рта
  widthFactor: number      // множитель ширины (>1 для «smile/wide»)
  roundness: number        // 0 = плоский, 1 = округлый (при средней открытости)
}

/** Spring stiffness (жёсткость пружины) */
const MOUTH_STIFFNESS = 45.0
/** Damping coefficient (коэффициент затухания) */
const MOUTH_DAMPING = 9.0
/** Минимальная открытость для idle breathing */
const BREATH_MIN = -0.005
/** Максимальная открытость для idle breathing */
const BREATH_MAX = 0.025

export function createMouthState(): MouthState {
  return {
    openness: 0,
    velocity: 0,
    target: 0,
    breathPhase: rnd(0, Math.PI * 2),
    breathPeriod: rnd(3.5, 4.5),
    breathAmplitude: rnd(0.008, 0.018),
    smoothAmplitude: 0,
    widthFactor: 1,
    roundness: 0,
  }
}

/**
 * Обновляет артикуляцию рта.
 * Использует spring/damping физику для натуральной инерции.
 *
 * @param s          состояние рта
 * @param dt         дельта-тайм
 * @param isPlaying  играет ли аудио
 * @param amplitude  текущая амплитуда аудио (0..1)
 * @param amp        множитель амплитуды из параметров
 * @param speedMul   множитель скорости из параметров
 */
export function updateMouth(
  s: MouthState,
  dt: number,
  isPlaying: boolean,
  amplitude: number,
  amp: number,
  speedMul: number,
): void {
  // EMA сглаживание амплитуды (убирает дрожание от raw FFT)
  const emaAlpha = 1 - Math.exp(-dt * 18 * speedMul) // быстрый отклик, но сглаженный
  s.smoothAmplitude += (amplitude - s.smoothAmplitude) * emaAlpha

  if (isPlaying && s.smoothAmplitude > 0.005) {
    // Lip-sync: целевая открытость = нелинейная функция от амплитуды
    // Квадратный корень даёт лучший динамический диапазон:
    // тихие звуки ≈ приоткрыт, громкие ≈ широко
    const raw = Math.sqrt(s.smoothAmplitude) * 2.8 * amp
    s.target = clamp(raw, 0, 1)
  } else {
    s.target = 0
  }

  // Spring/damping simulation
  // F = -k*(x-target) - b*v   (пружина + демпфер)
  const stiffness = MOUTH_STIFFNESS * speedMul
  const damping = MOUTH_DAMPING * Math.sqrt(speedMul)
  const force = -stiffness * (s.openness - s.target) - damping * s.velocity
  s.velocity += force * dt
  s.openness += s.velocity * dt

  // Idle breathing (когда рот закрыт / не говорит)
  if (!isPlaying || s.smoothAmplitude < 0.01) {
    s.breathPhase += dt * (Math.PI * 2 / s.breathPeriod)
    if (s.breathPhase > Math.PI * 20) {
      s.breathPhase -= Math.PI * 20
      // Слегка варьируем период дыхания
      s.breathPeriod = rnd(3.5, 4.5)
      s.breathAmplitude = rnd(0.008, 0.018)
    }
    // Составная волна: основная синусоида + обертон для естественности
    const breath =
      Math.sin(s.breathPhase) * s.breathAmplitude +
      Math.sin(s.breathPhase * 2.3) * s.breathAmplitude * 0.3
    s.openness = lerp(s.openness, clamp(breath, BREATH_MIN, BREATH_MAX), dt * 3)
    s.velocity *= 0.5 // гасим spring velocity в idle
  }

  // Clamp финальный результат
  s.openness = clamp(s.openness, 0, 1)

  // Адаптивная форма рта
  // При средней открытости (0.3-0.6) рот более округлый
  // При широком (>0.7) рот растягивается по ширине
  if (s.openness > 0.65) {
    s.widthFactor = lerp(s.widthFactor, 1.0 + (s.openness - 0.65) * 0.4, dt * 8)
    s.roundness = lerp(s.roundness, 0.3, dt * 8)
  } else if (s.openness > 0.2) {
    s.widthFactor = lerp(s.widthFactor, 1.0, dt * 8)
    s.roundness = lerp(s.roundness, 0.8, dt * 8)
  } else {
    s.widthFactor = lerp(s.widthFactor, 1.0, dt * 8)
    s.roundness = lerp(s.roundness, 0, dt * 8)
  }
}


// ──────────────────────────────────────────────────────────────────────
//  4. COMPOSITE — Объединённое состояние анимации лица
// ──────────────────────────────────────────────────────────────────────

export interface FaceAnimState {
  blink: BlinkState
  saccade: SaccadeState
  mouth: MouthState
}

export function createFaceAnimState(): FaceAnimState {
  return {
    blink: createBlinkState(),
    saccade: createSaccadeState(),
    mouth: createMouthState(),
  }
}

/**
 * Полное обновление всей анимации лица за один кадр.
 */
export function updateFaceAnim(
  state: FaceAnimState,
  dt: number,
  opts: {
    blinkEnabled: boolean
    blinkInterval: number
    blinkDuration: number
    pupilMove: boolean
    pupilScale: number
    isPlaying: boolean
    amplitude: number
    mouthAmp: number
    mouthSpeed: number
  },
): void {
  updateBlink(
    state.blink,
    dt,
    opts.blinkEnabled,
    opts.blinkInterval,
    opts.blinkDuration,
  )

  updateSaccade(
    state.saccade,
    dt,
    opts.pupilMove,
    opts.pupilScale,
  )

  updateMouth(
    state.mouth,
    dt,
    opts.isPlaying,
    opts.amplitude,
    opts.mouthAmp,
    opts.mouthSpeed,
  )
}

/**
 * Возвращает эффективные уровни закрытости для каждого глаза,
 * с учётом реакции века на направление взгляда (lid droop).
 */
export function getEffectiveBlinkLevels(state: FaceAnimState): { left: number; right: number } {
  const droop = state.saccade.lidDroop
  return {
    left: clamp(state.blink.leftLevel + droop, 0, 1),
    right: clamp(state.blink.rightLevel + droop, 0, 1),
  }
}
