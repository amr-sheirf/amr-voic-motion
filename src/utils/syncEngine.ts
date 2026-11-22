import type { AreaModelProblem, LessonChapter } from "../data/lessonChapters";

export type MotionSceneType =
  | "intro-cream"
  | "numbered-steps"
  | "checklist"
  | "highlight-stat"
  | "area-model"
  | "outro-cream";

export interface MotionCardItem {
  number: string;
  label: string;
  icon: "rect" | "divide" | "multiply" | "subtract" | "sum" | "spark" | "check";
}

export interface StoryboardScene {
  id: string;
  indexLabel: string;
  title: string;
  sceneType: MotionSceneType;
  headlinePrefix?: string;
  headlineHighlight: string;
  headlineSuffix?: string;
  badgeText?: string;
  spokenLines: string[];
  cards?: MotionCardItem[];
  checklistItems?: string[];
  statValue?: string;
  statLabel?: string;
  previewTags?: string[];
  problem?: AreaModelProblem;
}

export interface MotionCue {
  id: string;
  index: number;
  chapterId: string;
  chapterTitle: string;
  chapterIndexLabel: string;
  text: string;
  startSec: number;
  endSec: number;
  sceneType: MotionSceneType;
  headlinePrefix?: string;
  headlineHighlight?: string;
  headlineSuffix?: string;
  badgeText?: string;
  cards?: MotionCardItem[];
  checklistItems?: string[];
  activeItemIndex?: number;
  statValue?: string;
  statLabel?: string;
  previewTags?: string[];
  problem?: AreaModelProblem;
  revealedStepsCount?: number;
}

const INTRO_STEPS_CARDS: MotionCardItem[] = [
  { number: "1", label: "ارسم مستطيل", icon: "rect" },
  { number: "2", label: "اكتب المقسوم", icon: "divide" },
  { number: "3", label: "اختر مضاعف", icon: "multiply" },
  { number: "4", label: "اضرب واطرح", icon: "subtract" },
  { number: "5", label: "اجمع الناتج", icon: "sum" },
];

const OUTRO_CHECKLIST: string[] = [
  "رسم المستطيل وكتابة المقسوم والمقسوم عليه",
  "اختيار مضاعفات مناسبة للعدد المقسوم عليه",
  "الضرب والطرح المتكرر حتى الصفر أو الباقي",
  "جمع الأعداد فوق المستطيل لإيجاد خارج القسمة",
];

const ARABIC_INDEX_LABELS = [
  "٠١",
  "٠٢",
  "٠٣",
  "٠٤",
  "٠٥",
  "٠٦",
  "٠٧",
  "٠٨",
  "٠٩",
  "١٠",
  "١١",
  "١٢",
];

function toIndexLabel(idx: number): string {
  return ARABIC_INDEX_LABELS[idx] || String(idx + 1).padStart(2, "0");
}

function splitTextIntoLines(text: string): string[] {
  const rawLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // If user pasted a single long paragraph without line breaks, split cleanly by sentences
  const expanded: string[] = [];
  for (const line of rawLines) {
    if (line.length > 95) {
      const parts = line
        .split(/(?<=[.!?؟،])\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        expanded.push(...parts);
        continue;
      }
    }
    expanded.push(line);
  }
  return expanded;
}

function getLineSpeechWeight(line: string): number {
  const clean = line.replace(/[.,،!؟:()\-*]/g, "").trim();
  const baseWeight = Math.max(4, clean.length);
  const pauseBonus = (line.match(/[،.!؟:]/g) || []).length * 3;
  return baseWeight + pauseBonus;
}

/**
 * Computes RMS energy envelope of an AudioBuffer in 50ms windows
 * to find natural pause valleys for tighter subtitle & scene alignment.
 */
export function detectSilenceValleys(
  audioBuffer: AudioBuffer,
  windowMs = 50
): number[] {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
  const energies: number[] = [];

  for (let i = 0; i < channel.length; i += windowSize) {
    let sumSq = 0;
    const end = Math.min(channel.length, i + windowSize);
    for (let j = i; j < end; j++) {
      sumSq += channel[j] * channel[j];
    }
    energies.push(Math.sqrt(sumSq / (end - i)));
  }

  const sorted = [...energies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] || 0.01;
  const threshold = Math.max(0.004, median * 0.28);

  const valleys: number[] = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (
      energies[i] < threshold &&
      energies[i] <= energies[i - 1] &&
      energies[i] <= energies[i + 1]
    ) {
      valleys.push((i * windowMs) / 1000);
    }
  }
  return valleys;
}

function snapToNearestValley(
  targetSec: number,
  valleys: number[],
  maxSnapSec = 0.45
): number {
  let best = targetSec;
  let bestDist = maxSnapSec;
  for (const v of valleys) {
    const dist = Math.abs(v - targetSec);
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  return best;
}

function extractShortLabel(line: string, maxLen = 26): string {
  const clean = line.replace(/[.,،!؟:"«»()\-*#]/g, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(" ").filter(Boolean);
  let out = "";
  for (const w of words) {
    if ((out ? `${out} ${w}` : w).length <= maxLen) {
      out = out ? `${out} ${w}` : w;
    } else {
      break;
    }
  }
  return out || clean.slice(0, maxLen);
}

/**
 * Deterministic smart fallback storyboard builder for any user script
 * when AI structuring is skipped or unavailable.
 */
export function buildFallbackStoryboardFromScript(
  script: string,
  title: string,
  presenter = ""
): StoryboardScene[] {
  const cleanTitle = title.trim() || "عرض موشن جرافيك";
  const paragraphs = script
    .split(/\n{2,}|^---$/m)
    .map((p) => splitTextIntoLines(p))
    .filter((lines) => lines.length > 0);

  let blocks: string[][] = [];
  if (paragraphs.length >= 3) {
    blocks = paragraphs;
  } else {
    const allLines = splitTextIntoLines(script);
    if (allLines.length <= 3) {
      blocks = allLines.map((l) => [l]);
    } else {
      const targetScenes = Math.min(6, Math.max(3, Math.ceil(allLines.length / 3)));
      const perScene = Math.ceil(allLines.length / targetScenes);
      for (let i = 0; i < allLines.length; i += perScene) {
        blocks.push(allLines.slice(i, i + perScene));
      }
    }
  }

  if (blocks.length === 0) {
    return [];
  }

  const iconCycle: MotionCardItem["icon"][] = [
    "spark",
    "rect",
    "divide",
    "multiply",
    "check",
  ];

  return blocks.map((lines, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === blocks.length - 1 && blocks.length > 1;
    const midPattern: MotionSceneType[] = [
      "numbered-steps",
      "checklist",
      "highlight-stat",
    ];
    const sceneType: MotionSceneType = isFirst
      ? "intro-cream"
      : isLast
      ? "outro-cream"
      : midPattern[(idx - 1) % midPattern.length];

    const firstLineTitle = extractShortLabel(lines[0], 28);
    const numMatch = lines.join(" ").match(/\d+(?:[.,]\d+)?%?/);
    const statValue = numMatch ? numMatch[0] : extractShortLabel(lines[0], 14);
    const checklistItems = lines.slice(0, 4).map((l) => extractShortLabel(l, 48));

    const cards: MotionCardItem[] = lines.slice(0, 4).map((l, cIdx) => ({
      number: String(cIdx + 1),
      label: extractShortLabel(l, 22),
      icon: iconCycle[(idx + cIdx) % iconCycle.length],
    }));

    const previewTags = blocks
      .slice(0, 3)
      .map((b, bIdx) => `${toIndexLabel(bIdx)} ${extractShortLabel(b[0], 12)}`);

    return {
      id: `scene-${idx + 1}`,
      indexLabel: toIndexLabel(idx),
      title: isFirst ? cleanTitle : isLast ? "الخلاصة" : firstLineTitle,
      sceneType,
      headlinePrefix: isFirst ? "عرض" : isLast ? "خلاصة" : "محور",
      headlineHighlight: isFirst ? cleanTitle : firstLineTitle,
      headlineSuffix: presenter && isFirst ? `· ${presenter}` : "",
      badgeText: presenter
        ? `${presenter} · ${cleanTitle}`
        : `${cleanTitle} · مشهد ${idx + 1}`,
      spokenLines: lines,
      cards,
      checklistItems,
      statValue,
      statLabel: extractShortLabel(lines[lines.length - 1] || lines[0], 40),
      previewTags,
    };
  });
}

/**
 * Converts a StoryboardScene[] + total audio duration + silence valleys
 * into frame-accurate MotionCue[] for canvas rendering & export.
 */
export function buildSynchronizedCuesFromStoryboard(
  scenes: StoryboardScene[],
  fullDurationSec: number,
  valleys: number[] = []
): MotionCue[] {
  const flatItems: Array<{
    scene: StoryboardScene;
    line: string;
    lineIdxInScene: number;
    totalLinesInScene: number;
    weight: number;
  }> = [];

  for (const scene of scenes) {
    const lines = scene.spokenLines.filter((l) => l.trim().length > 0);
    lines.forEach((line, lIdx) => {
      flatItems.push({
        scene,
        line,
        lineIdxInScene: lIdx,
        totalLinesInScene: lines.length,
        weight: getLineSpeechWeight(line),
      });
    });
  }

  if (flatItems.length === 0) return [];

  const totalWeight = flatItems.reduce((sum, item) => sum + item.weight, 0) || 1;
  const cues: MotionCue[] = [];
  let cursor = 0;

  flatItems.forEach((item, globalIdx) => {
    const share = (item.weight / totalWeight) * fullDurationSec;
    let endSec =
      globalIdx === flatItems.length - 1 ? fullDurationSec : cursor + share;

    if (globalIdx < flatItems.length - 1 && valleys.length > 0) {
      const snapped = snapToNearestValley(
        endSec,
        valleys,
        Math.min(0.45, share * 0.38)
      );
      if (snapped > cursor + 0.35 && snapped < fullDurationSec - 0.25) {
        endSec = snapped;
      }
    }

    const { scene, line, lineIdxInScene, totalLinesInScene } = item;
    const progressInScene =
      totalLinesInScene > 1 ? lineIdxInScene / (totalLinesInScene - 1) : 0;

    const itemCount =
      scene.sceneType === "numbered-steps"
        ? scene.cards?.length || 1
        : scene.checklistItems?.length || 1;
    const activeItemIndex = Math.min(
      itemCount - 1,
      Math.floor(progressInScene * itemCount)
    );

    const revealedStepsCount = scene.problem
      ? Math.max(
          1,
          Math.min(
            scene.problem.steps.length,
            Math.ceil(progressInScene * scene.problem.steps.length + 0.15)
          )
        )
      : undefined;

    cues.push({
      id: `${scene.id}-cue-${globalIdx}`,
      index: globalIdx,
      chapterId: scene.id,
      chapterTitle: scene.title,
      chapterIndexLabel: scene.indexLabel,
      text: line,
      startSec: cursor,
      endSec,
      sceneType: scene.sceneType,
      headlinePrefix: scene.headlinePrefix,
      headlineHighlight: scene.headlineHighlight,
      headlineSuffix: scene.headlineSuffix,
      badgeText: scene.badgeText,
      cards: scene.cards,
      checklistItems: scene.checklistItems,
      activeItemIndex,
      statValue: scene.statValue,
      statLabel: scene.statLabel,
      previewTags: scene.previewTags,
      problem: scene.problem,
      revealedStepsCount,
    });

    cursor = endSec;
  });

  return cues;
}

function determineSceneMeta(
  chapter: LessonChapter,
  lineIdx: number,
  totalLinesInChapter: number
): Partial<MotionCue> {
  const progress =
    totalLinesInChapter > 1 ? lineIdx / (totalLinesInChapter - 1) : 0;

  if (chapter.id === "intro") {
    if (lineIdx <= 4) {
      return {
        sceneType: "intro-cream",
        headlinePrefix: "نموذج مساحة",
        headlineHighlight: "المستطيل",
        headlineSuffix: "في القسمة",
        badgeText: "الأستاذ عمرو شريف · دليل عملي",
        previewTags: ["100", "20", "5"],
      };
    }
    const activeCardIdx = Math.min(
      INTRO_STEPS_CARDS.length - 1,
      Math.floor(
        ((lineIdx - 5) / Math.max(1, totalLinesInChapter - 5)) *
          INTRO_STEPS_CARDS.length
      )
    );
    return {
      sceneType: "numbered-steps",
      headlinePrefix: "الطريقة الشاطرة =",
      headlineHighlight: "{5}",
      headlineSuffix: "خطوات",
      cards: INTRO_STEPS_CARDS,
      activeItemIndex: Math.max(0, activeCardIdx),
    };
  }

  if (chapter.id === "outro") {
    if (lineIdx >= totalLinesInChapter - 3) {
      return {
        sceneType: "outro-cream",
        headlinePrefix: "كان معاكم",
        headlineHighlight: "الأستاذ عمرو",
        headlineSuffix: "مدرسة قرية 7",
        badgeText: "نهاية الدرس · بالتوفيق يا أبطال",
        previewTags: ["100", "20", "5"],
      };
    }
    const activeCheckIdx = Math.min(
      OUTRO_CHECKLIST.length - 1,
      Math.floor(
        (lineIdx / Math.max(1, totalLinesInChapter - 3)) * OUTRO_CHECKLIST.length
      )
    );
    return {
      sceneType: "checklist",
      headlinePrefix: "تذكّر أهم",
      headlineHighlight: "الخطوات",
      headlineSuffix: "في الحل",
      badgeText: "ملخص الدرس",
      checklistItems: OUTRO_CHECKLIST,
      activeItemIndex: activeCheckIdx,
    };
  }

  if (chapter.problem) {
    const stepCount = chapter.problem.steps.length;
    const revealed = Math.max(
      1,
      Math.min(stepCount, Math.ceil(progress * stepCount + 0.15))
    );
    return {
      sceneType: "area-model",
      problem: chapter.problem,
      revealedStepsCount: revealed,
      headlinePrefix: chapter.problem.label,
      headlineHighlight: `${chapter.problem.dividend} ÷ ${chapter.problem.divisor}`,
      badgeText: `الناتج = ${chapter.problem.quotient}${
        chapter.problem.remainder > 0
          ? ` · الباقي ${chapter.problem.remainder}`
          : ""
      }`,
    };
  }

  return {
    sceneType: lineIdx === 0 ? "intro-cream" : "checklist",
    headlinePrefix: "شرح",
    headlineHighlight: chapter.title,
    badgeText: "درس صوتي متزامن",
  };
}

export function buildSynchronizedCuesForChapters(
  chaptersWithAudio: Array<{
    chapter: LessonChapter;
    durationSec: number;
    valleys?: number[];
  }>
): MotionCue[] {
  const cues: MotionCue[] = [];
  let cursorSec = 0;
  let globalIdx = 0;

  chaptersWithAudio.forEach(({ chapter, durationSec, valleys = [] }, chIdx) => {
    const lines = splitTextIntoLines(chapter.text);
    if (lines.length === 0) return;

    const weights = lines.map(getLineSpeechWeight);
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

    let localStart = 0;
    lines.forEach((line, lineIdx) => {
      const share = (weights[lineIdx] / totalWeight) * durationSec;
      let localEnd = localStart + share;

      if (lineIdx === lines.length - 1) {
        localEnd = durationSec;
      } else if (valleys.length > 0) {
        const snapped = snapToNearestValley(
          localEnd,
          valleys,
          Math.min(0.4, share * 0.35)
        );
        if (snapped > localStart + 0.35 && snapped < durationSec - 0.25) {
          localEnd = snapped;
        }
      }

      const meta = determineSceneMeta(chapter, lineIdx, lines.length);

      cues.push({
        id: `${chapter.id}-${lineIdx}`,
        index: globalIdx++,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterIndexLabel: chapter.indexLabel,
        text: line,
        startSec: cursorSec + localStart,
        endSec: cursorSec + localEnd,
        sceneType: meta.sceneType || "checklist",
        ...meta,
      });

      localStart = localEnd;
    });

    const pauseGap = chIdx < chaptersWithAudio.length - 1 ? 0.35 : 0;
    cursorSec += durationSec + pauseGap;
  });

  return cues;
}

export function buildSynchronizedCuesForCustomText(
  text: string,
  title: string,
  durationSec: number,
  valleys: number[] = []
): MotionCue[] {
  const storyboard = buildFallbackStoryboardFromScript(text, title);
  return buildSynchronizedCuesFromStoryboard(storyboard, durationSec, valleys);
}
