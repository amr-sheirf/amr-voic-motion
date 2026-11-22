import type { MotionCue, MotionCardItem } from "./syncEngine";

export interface BreadcrumbItem {
  id: string;
  title: string;
}

const PALETTE = {
  creamBg: "#FAF6EE",
  creamCard: "#FFFFFF",
  creamBorder: "rgba(249, 115, 22, 0.25)",
  darkBg: "#1B1F27",
  darkBgAlt: "#222731",
  darkCard: "#262B36",
  darkChip: "#2C323F",
  orange: "#FF6B1A",
  orangeSoft: "rgba(255, 107, 26, 0.16)",
  orangeBorder: "rgba(255, 107, 26, 0.55)",
  inkDark: "#1C1F26",
  inkMutedDark: "#64748B",
  inkLight: "#F8FAFC",
  inkMutedLight: "#94A3B8",
  emerald: "#10B981",
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapArabicLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitSingleLineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 3 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

function drawDotMatrix(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cols: number,
  rows: number,
  gap: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.beginPath();
      ctx.arc(x + c * gap, y + r * gap, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCreamDecorations(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeSec: number
) {
  drawDotMatrix(ctx, w * 0.08, h * 0.62, 4, 4, 13, "rgba(28, 31, 38, 0.14)");
  drawDotMatrix(ctx, w * 0.84, h * 0.24, 4, 3, 13, "rgba(255, 107, 26, 0.2)");

  ctx.save();
  ctx.strokeStyle = "rgba(255, 107, 26, 0.45)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, h * 0.44);
  ctx.quadraticCurveTo(w * 0.18, h * 0.42, w * 0.24, h * 0.34);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w, h * 0.34);
  ctx.quadraticCurveTo(w * 0.84, h * 0.38, w * 0.78, h * 0.46);
  ctx.stroke();

  const bob = Math.sin(timeSec * 2.2) * 5;
  ctx.fillStyle = PALETTE.orange;
  ctx.beginPath();
  ctx.arc(w * 0.88, h * 0.41 + bob, 6.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 107, 26, 0.35)";
  ctx.beginPath();
  ctx.arc(w * 0.13, h * 0.36 - bob, 4.5, 0, Math.PI * 2);
  ctx.fill();

  drawRoundedRect(ctx, w * 0.06, h * 0.045, 36, 36, 10);
  ctx.fillStyle = "rgba(255, 107, 26, 0.12)";
  ctx.fill();
  ctx.fillStyle = PALETTE.orange;
  ctx.beginPath();
  ctx.moveTo(w * 0.06 + 14, h * 0.045 + 11);
  ctx.lineTo(w * 0.06 + 26, h * 0.045 + 18);
  ctx.lineTo(w * 0.06 + 14, h * 0.045 + 25);
  ctx.closePath();
  ctx.fill();

  drawRoundedRect(ctx, w * 0.76, h * 0.048, w * 0.18, 28, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = PALETTE.creamBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = PALETTE.orange;
  ctx.beginPath();
  ctx.arc(w * 0.76 + 16, h * 0.048 + 14, 4, 0, Math.PI * 2);
  ctx.fill();

  drawRoundedRect(ctx, w * 0.76 + 28, h * 0.048 + 11, w * 0.18 - 42, 6, 3);
  ctx.fillStyle = "rgba(28, 31, 38, 0.18)";
  ctx.fill();

  ctx.restore();
}

function drawDarkDecorations(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeSec: number
) {
  const grad = ctx.createRadialGradient(
    w * 0.5,
    h * 0.35,
    40,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.75
  );
  grad.addColorStop(0, PALETTE.darkBgAlt);
  grad.addColorStop(1, PALETTE.darkBg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.fillStyle = "rgba(255, 107, 26, 0.16)";
  const drift = Math.sin(timeSec * 1.4) * 6;
  ctx.beginPath();
  ctx.arc(w * 0.12, h * 0.28 + drift, 3, 0, Math.PI * 2);
  ctx.arc(w * 0.89, h * 0.72 - drift, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTopBreadcrumbStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  items: BreadcrumbItem[],
  activeChapterId: string
) {
  if (items.length === 0) return;

  ctx.save();
  ctx.direction = "rtl";
  ctx.font = '600 13px "IBM Plex Sans Arabic", sans-serif';
  ctx.textBaseline = "middle";

  const labels = items.slice(0, 6).map((ch) => ({
    id: ch.id,
    label: ch.title.split(":")[0].slice(0, 16),
  }));

  const chipWidths = labels.map(
    (item) => ctx.measureText(item.label).width + 24
  );
  const gap = 8;
  const totalWidth =
    chipWidths.reduce((a, b) => a + b, 0) + gap * (labels.length - 1);

  const scale = totalWidth > w * 0.92 ? (w * 0.92) / totalWidth : 1;
  ctx.translate(w / 2, y + 14);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -(y + 14));

  let cursorX = w / 2 + totalWidth / 2;

  labels.forEach((item, idx) => {
    const cw = chipWidths[idx];
    const x = cursorX - cw;
    const isActive = item.id === activeChapterId;

    drawRoundedRect(ctx, x, y, cw, 28, 14);
    ctx.fillStyle = isActive ? PALETTE.orange : PALETTE.darkChip;
    ctx.fill();

    ctx.fillStyle = isActive ? "#FFFFFF" : PALETTE.inkMutedLight;
    ctx.textAlign = "center";
    ctx.fillText(item.label, x + cw / 2, y + 14);

    cursorX = x - gap;
  });

  ctx.restore();
}

function drawHighlightedHeadline(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  canvasWidth: number,
  prefix: string,
  highlight: string,
  suffix: string,
  isDark: boolean,
  scaleFactor = 1
) {
  ctx.save();
  ctx.direction = "rtl";
  let fontSize = Math.round(38 * scaleFactor);
  ctx.font = `800 ${fontSize}px "Cairo", sans-serif`;
  ctx.textBaseline = "middle";

  const parts = [
    { text: prefix, isHighlight: false },
    { text: highlight, isHighlight: true },
    { text: suffix, isHighlight: false },
  ].filter((p) => p.text.trim().length > 0);

  const maxW = canvasWidth * 0.88;
  const measureTotal = () => {
    const spaceW = ctx.measureText(" ").width;
    const widths = parts.map((p) => ctx.measureText(p.text).width);
    const total =
      widths.reduce((a, b) => a + b, 0) +
      spaceW * Math.max(0, parts.length - 1);
    return { spaceW, widths, total };
  };

  let measured = measureTotal();
  while (measured.total > maxW && fontSize > 20) {
    fontSize -= 2;
    ctx.font = `800 ${fontSize}px "Cairo", sans-serif`;
    measured = measureTotal();
  }

  let cursorX = centerX + measured.total / 2;

  parts.forEach((part, i) => {
    const pw = measured.widths[i];
    const partCenterX = cursorX - pw / 2;

    ctx.textAlign = "center";
    ctx.fillStyle = part.isHighlight
      ? PALETTE.orange
      : isDark
      ? PALETTE.inkLight
      : PALETTE.inkDark;
    ctx.fillText(part.text, partCenterX, y);

    if (part.isHighlight) {
      ctx.fillStyle = PALETTE.orange;
      drawRoundedRect(ctx, cursorX - pw, y + fontSize * 0.56, pw, 4, 2);
      ctx.fill();
    }

    cursorX -= pw + measured.spaceW;
  });

  ctx.restore();
}

function drawIntroPreviewWindow(
  ctx: CanvasRenderingContext2D,
  w: number,
  y: number,
  boxW: number,
  boxH: number,
  progress01: number,
  headerLabel: string,
  previewTags: string[]
) {
  const x = (w - boxW) / 2;

  ctx.save();
  ctx.direction = "rtl";
  ctx.shadowColor = "rgba(28, 31, 38, 0.1)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;

  drawRoundedRect(ctx, x, y, boxW, boxH, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = PALETTE.creamBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = PALETTE.orange;
  ctx.beginPath();
  ctx.arc(x + boxW - 24, y + 22, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '700 14px "Cairo", sans-serif';
  ctx.fillStyle = PALETTE.inkDark;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(
    fitSingleLineText(ctx, headerLabel, boxW - 64),
    x + boxW - 38,
    y + 22
  );

  const innerX = x + 18;
  const innerY = y + 44;
  const innerW = boxW - 36;
  const innerH = boxH - 110;

  drawRoundedRect(ctx, innerX, innerY, innerW, innerH, 14);
  ctx.fillStyle = PALETTE.darkBg;
  ctx.fill();

  const tags =
    previewTags.length > 0 ? previewTags.slice(0, 3) : ["٠١", "٠٢", "٠٣"];
  const blockW = (innerW - 52 - 12 * (tags.length - 1)) / tags.length;
  const blockH = innerH * 0.46;
  const blockY = innerY + innerH * 0.34;

  tags.forEach((tag, idx) => {
    const bx = innerX + 26 + idx * (blockW + 12);
    const delay = idx * 0.15;
    const pop = easeOutBack((progress01 - delay) * 2.5);

    ctx.save();
    ctx.globalAlpha = clamp01(pop);
    drawRoundedRect(ctx, bx, blockY, blockW, blockH, 8);
    ctx.fillStyle = PALETTE.darkCard;
    ctx.fill();
    ctx.strokeStyle = PALETTE.orangeBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Animated waveform bar inside preview card
    const barCount = 5;
    for (let b = 0; b < barCount; b++) {
      const wave =
        0.3 +
        0.65 *
          Math.abs(Math.sin(progress01 * Math.PI * 4 + idx * 1.3 + b * 0.8));
      const bw = Math.max(4, (blockW - 24) / (barCount * 1.7));
      const bh = Math.max(8, (blockH - 22) * wave);
      const barX =
        bx +
        blockW / 2 -
        ((barCount - 1) * bw * 1.6) / 2 +
        b * bw * 1.6 -
        bw / 2;
      const barY = blockY + blockH / 2 - bh / 2;
      drawRoundedRect(ctx, barX, barY, bw, bh, 2);
      ctx.fillStyle =
        b === 2 ? PALETTE.orange : "rgba(255, 107, 26, 0.42)";
      ctx.fill();
    }

    drawRoundedRect(ctx, bx + blockW * 0.12, blockY - 24, blockW * 0.76, 20, 6);
    ctx.fillStyle = PALETTE.orange;
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = '700 11px "Cairo", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      fitSingleLineText(ctx, tag, blockW * 0.68),
      bx + blockW / 2,
      blockY - 14
    );
    ctx.restore();
  });

  // Filmstrip timeline bar at bottom of preview card
  const stripY = y + boxH - 52;
  const stripH = 34;
  drawRoundedRect(ctx, innerX, stripY, innerW, stripH, 8);
  ctx.fillStyle = "#F8FAFC";
  ctx.fill();
  ctx.strokeStyle = "rgba(28, 31, 38, 0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const tw = (innerW - 25) / 4;
    const tx = innerX + 5 + i * (tw + 5);
    drawRoundedRect(ctx, tx, stripY + 5, tw, stripH - 10, 4);
    ctx.fillStyle = i === 1 ? PALETTE.orangeSoft : "#1E293B";
    ctx.fill();
  }

  const playheadX = innerX + 12 + (innerW - 24) * clamp01(progress01);
  ctx.strokeStyle = PALETTE.orange;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(playheadX, stripY - 4);
  ctx.lineTo(playheadX, stripY + stripH + 4);
  ctx.stroke();

  ctx.fillStyle = PALETTE.orange;
  ctx.beginPath();
  ctx.arc(playheadX, stripY - 4, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCardIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  icon: MotionCardItem["icon"],
  isDarkBg: boolean
) {
  ctx.save();
  ctx.strokeStyle = isDarkBg ? "#FFFFFF" : PALETTE.orange;
  ctx.fillStyle = isDarkBg ? "#FFFFFF" : PALETTE.orange;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (icon === "rect") {
    ctx.strokeRect(cx - 11, cy - 8, 22, 16);
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 8);
    ctx.lineTo(cx - 2, cy + 8);
    ctx.stroke();
  } else if (icon === "divide") {
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - 7, 2.5, 0, Math.PI * 2);
    ctx.arc(cx, cy + 7, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === "multiply") {
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 7);
    ctx.lineTo(cx + 7, cy + 7);
    ctx.moveTo(cx + 7, cy - 7);
    ctx.lineTo(cx - 7, cy + 7);
    ctx.stroke();
  } else if (icon === "subtract") {
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.stroke();
  } else if (icon === "sum") {
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy);
    ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx, cy + 9);
    ctx.stroke();
  } else if (icon === "spark") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 2.5, cy - 2.5);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx + 2.5, cy + 2.5);
    ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 2.5, cy + 2.5);
    ctx.lineTo(cx - 10, cy);
    ctx.lineTo(cx - 2.5, cy - 2.5);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy + 1);
    ctx.lineTo(cx - 2, cy + 6);
    ctx.lineTo(cx + 8, cy - 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNumberedCardsScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cue: MotionCue,
  elapsedInCue: number,
  isPortrait: boolean
) {
  const cards = cue.cards || [];
  if (cards.length === 0) return;

  const activeIdx = cue.activeItemIndex ?? 0;
  const cols = isPortrait ? Math.min(2, cards.length) : cards.length;
  const areaW = isPortrait ? w * 0.86 : w * 0.88;
  const gap = isPortrait ? 16 : 18;
  const cardW = (areaW - gap * (cols - 1)) / cols;
  const cardH = isPortrait ? Math.min(165, h * 0.155) : Math.min(220, h * 0.34);

  const startY = isPortrait ? h * 0.32 : h * 0.38;

  cards.forEach((card, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const rtlCol = cols - 1 - col;
    const cx = (w - areaW) / 2 + rtlCol * (cardW + gap);
    const cy = startY + row * (cardH + gap);

    const isActive = idx <= activeIdx;
    const isCurrent = idx === activeIdx;
    const anim = easeOutBack(clamp01((elapsedInCue + 0.2 - idx * 0.05) * 2.5));
    const scale = isCurrent ? 1.03 : 0.96 + 0.04 * anim;

    ctx.save();
    ctx.direction = "rtl";
    ctx.translate(cx + cardW / 2, cy + cardH / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(cx + cardW / 2), -(cy + cardH / 2));

    drawRoundedRect(ctx, cx, cy, cardW, cardH, 18);
    ctx.fillStyle = isCurrent ? "#2C3340" : PALETTE.darkCard;
    ctx.fill();
    ctx.strokeStyle = isCurrent
      ? PALETTE.orange
      : isActive
      ? PALETTE.orangeBorder
      : "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = isCurrent ? 2.5 : 1.5;
    ctx.stroke();

    ctx.font = '700 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = isActive ? PALETTE.orange : PALETTE.inkMutedLight;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(card.number, cx + 16, cy + 14);

    const tileSize = isPortrait ? 46 : 56;
    const tileX = cx + cardW / 2 - tileSize / 2;
    const tileY = cy + cardH * 0.24;
    const useOrangeTile = idx % 2 === 0;

    drawRoundedRect(ctx, tileX, tileY, tileSize, tileSize, 14);
    ctx.fillStyle = useOrangeTile ? PALETTE.orange : "#FFF7ED";
    ctx.fill();

    drawCardIcon(
      ctx,
      tileX + tileSize / 2,
      tileY + tileSize / 2,
      card.icon,
      useOrangeTile
    );

    ctx.font = `700 ${isPortrait ? 15 : 17}px "Cairo", sans-serif`;
    ctx.fillStyle = isActive ? PALETTE.inkLight : PALETTE.inkMutedLight;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      fitSingleLineText(ctx, card.label, cardW - 22),
      cx + cardW / 2,
      cy + cardH - 16
    );

    ctx.restore();
  });
}

function drawChecklistScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cue: MotionCue,
  elapsedInCue: number,
  isPortrait: boolean
) {
  const items = cue.checklistItems || [];
  const activeIdx = cue.activeItemIndex ?? 0;

  if (cue.badgeText) {
    ctx.save();
    ctx.direction = "rtl";
    ctx.font = '700 15px "Cairo", sans-serif';
    const bw = Math.min(w * 0.8, ctx.measureText(cue.badgeText).width + 38);
    const bx = w / 2 - bw / 2;
    const by = isPortrait ? h * 0.24 : h * 0.27;
    drawRoundedRect(ctx, bx, by, bw, 34, 17);
    ctx.fillStyle = PALETTE.orange;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fitSingleLineText(ctx, cue.badgeText, bw - 24), w / 2, by + 17);
    ctx.restore();
  }

  const rowW = isPortrait ? w * 0.86 : w * 0.68;
  const rowH = isPortrait ? 72 : 64;
  const gap = 14;
  const startY = isPortrait ? h * 0.31 : h * 0.36;

  items.forEach((item, idx) => {
    const ry = startY + idx * (rowH + gap);
    const rx = (w - rowW) / 2;
    const slide = easeOutCubic(clamp01((elapsedInCue + 0.35 - idx * 0.08) * 2.5));
    const isCompleted = idx <= activeIdx;
    const isCurrent = idx === activeIdx;

    ctx.save();
    ctx.direction = "rtl";
    ctx.globalAlpha = 0.25 + 0.75 * slide;
    ctx.translate(0, (1 - slide) * 14);

    drawRoundedRect(ctx, rx, ry, rowW, rowH, 14);
    ctx.fillStyle = isCurrent ? "#2C3340" : PALETTE.darkCard;
    ctx.fill();
    ctx.strokeStyle = isCurrent
      ? PALETTE.orange
      : isCompleted
      ? PALETTE.orangeBorder
      : "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = isCurrent ? 2 : 1.5;
    ctx.stroke();

    const circleX = rx + rowW - 32;
    const circleY = ry + rowH / 2;
    ctx.beginPath();
    ctx.arc(circleX, circleY, 13, 0, Math.PI * 2);
    ctx.fillStyle = isCompleted ? PALETTE.orange : "rgba(148, 163, 184, 0.2)";
    ctx.fill();

    if (isCompleted) {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(circleX - 5, circleY);
      ctx.lineTo(circleX - 1, circleY + 4);
      ctx.lineTo(circleX + 6, circleY - 4);
      ctx.stroke();
    }

    ctx.font = `600 ${isPortrait ? 17 : 19}px "IBM Plex Sans Arabic", sans-serif`;
    ctx.fillStyle = isCompleted ? PALETTE.inkLight : PALETTE.inkMutedLight;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(
      fitSingleLineText(ctx, item, rowW - 84),
      circleX - 24,
      circleY
    );

    ctx.restore();
  });
}

function drawHighlightStatScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cue: MotionCue,
  elapsedInCue: number,
  isPortrait: boolean
) {
  const cardW = isPortrait ? w * 0.86 : w * 0.7;
  const cardX = (w - cardW) / 2;
  const cardY = isPortrait ? h * 0.25 : h * 0.27;
  const cardH = isPortrait ? h * 0.22 : h * 0.26;

  const pop = easeOutBack(clamp01(elapsedInCue * 2.5 + 0.15));

  ctx.save();
  ctx.direction = "rtl";
  ctx.translate(w / 2, cardY + cardH / 2);
  ctx.scale(0.92 + 0.08 * pop, 0.92 + 0.08 * pop);
  ctx.translate(-w / 2, -(cardY + cardH / 2));

  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fillStyle = PALETTE.darkCard;
  ctx.fill();
  ctx.strokeStyle = PALETTE.orange;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Accent bar on right edge
  drawRoundedRect(ctx, cardX + cardW - 10, cardY + 20, 6, cardH - 40, 3);
  ctx.fillStyle = PALETTE.orange;
  ctx.fill();

  const statText = cue.statValue || cue.headlineHighlight || cue.chapterTitle;
  let statSize = isPortrait ? 44 : 50;
  ctx.font = `800 ${statSize}px "Cairo", sans-serif`;
  while (ctx.measureText(statText).width > cardW - 60 && statSize > 24) {
    statSize -= 2;
    ctx.font = `800 ${statSize}px "Cairo", sans-serif`;
  }

  ctx.fillStyle = PALETTE.orange;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(statText, w / 2, cardY + cardH * 0.42);

  if (cue.statLabel) {
    ctx.font = `600 ${isPortrait ? 18 : 20}px "IBM Plex Sans Arabic", sans-serif`;
    ctx.fillStyle = PALETTE.inkLight;
    ctx.fillText(
      fitSingleLineText(ctx, cue.statLabel, cardW - 56),
      w / 2,
      cardY + cardH * 0.74
    );
  }
  ctx.restore();

  // Supporting bullet chips below focal card
  const bullets = (cue.checklistItems || []).slice(0, 3);
  const activeIdx = cue.activeItemIndex ?? 0;
  const rowW = cardW;
  const rowH = isPortrait ? 58 : 52;
  const gap = 12;
  const startY = cardY + cardH + 22;

  bullets.forEach((b, idx) => {
    const ry = startY + idx * (rowH + gap);
    const isCurrent = idx === activeIdx;
    const isDone = idx <= activeIdx;

    ctx.save();
    ctx.direction = "rtl";
    drawRoundedRect(ctx, cardX, ry, rowW, rowH, 12);
    ctx.fillStyle = isCurrent ? "#2C3340" : "rgba(38, 43, 54, 0.7)";
    ctx.fill();
    ctx.strokeStyle = isCurrent
      ? PALETTE.orange
      : isDone
      ? PALETTE.orangeBorder
      : "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = isCurrent ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = isDone ? PALETTE.orange : PALETTE.inkMutedLight;
    ctx.beginPath();
    ctx.arc(cardX + rowW - 24, ry + rowH / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `600 ${isPortrait ? 16 : 18}px "IBM Plex Sans Arabic", sans-serif`;
    ctx.fillStyle = isDone ? PALETTE.inkLight : PALETTE.inkMutedLight;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(
      fitSingleLineText(ctx, b, rowW - 60),
      cardX + rowW - 42,
      ry + rowH / 2
    );
    ctx.restore();
  });
}

function drawAreaModelMotionScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cue: MotionCue,
  elapsedInCue: number,
  isPortrait: boolean
) {
  const problem = cue.problem;
  if (!problem) return;

  const revealedCount = cue.revealedStepsCount ?? problem.steps.length;

  ctx.save();
  ctx.direction = "ltr";
  ctx.font = '700 16px "IBM Plex Mono", monospace';
  const eqText = `${problem.dividend} ÷ ${problem.divisor} = ${
    revealedCount === problem.steps.length ? problem.quotient : "..."
  }`;
  const pw = ctx.measureText(eqText).width + 36;
  const py = isPortrait ? h * 0.265 : h * 0.275;
  drawRoundedRect(ctx, w / 2 - pw / 2, py, pw, 34, 17);
  ctx.fillStyle = PALETTE.orangeSoft;
  ctx.fill();
  ctx.strokeStyle = PALETTE.orangeBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = PALETTE.orange;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(eqText, w / 2, py + 17);
  ctx.restore();

  const containerW = isPortrait ? w * 0.88 : w * 0.78;
  const containerX = (w - containerW) / 2;
  const rectY = isPortrait ? h * 0.37 : h * 0.39;
  const rectH = isPortrait ? h * 0.25 : h * 0.29;

  const divisorColW = isPortrait ? 68 : 88;
  const stepsAreaX = containerX + divisorColW + 16;
  const stepsAreaW = containerW - divisorColW - 16;
  const stepGap = 12;
  const colW =
    (stepsAreaW - stepGap * (problem.steps.length - 1)) / problem.steps.length;

  ctx.save();
  ctx.direction = "ltr";
  drawRoundedRect(
    ctx,
    containerX,
    rectY + rectH / 2 - divisorColW / 2,
    divisorColW,
    divisorColW,
    14
  );
  ctx.fillStyle = PALETTE.orange;
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${isPortrait ? 24 : 30}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    String(problem.divisor),
    containerX + divisorColW / 2,
    rectY + rectH / 2
  );

  ctx.direction = "rtl";
  ctx.font = '600 12px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillStyle = PALETTE.inkMutedLight;
  ctx.fillText(
    "المقسوم عليه",
    containerX + divisorColW / 2,
    rectY + rectH / 2 + divisorColW / 2 + 16
  );
  ctx.restore();

  problem.steps.forEach((step, idx) => {
    const sx = stepsAreaX + idx * (colW + stepGap);
    const isRevealed = idx < revealedCount;
    const pop = isRevealed ? easeOutBack(clamp01(elapsedInCue * 3 + 0.4)) : 0;

    ctx.save();
    ctx.direction = "ltr";
    const chipW = Math.min(colW * 0.82, 92);
    const chipH = 34;
    const chipX = sx + colW / 2 - chipW / 2;
    const chipY = rectY - chipH - 12;

    drawRoundedRect(ctx, chipX, chipY, chipW, chipH, 10);
    if (isRevealed) {
      ctx.fillStyle = PALETTE.orange;
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = '700 18px "IBM Plex Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(step.quotientPart), sx + colW / 2, chipY + chipH / 2);
    } else {
      ctx.fillStyle = PALETTE.darkCard;
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = PALETTE.inkMutedLight;
      ctx.font = '700 18px "IBM Plex Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", sx + colW / 2, chipY + chipH / 2);
    }

    drawRoundedRect(ctx, sx, rectY, colW, rectH, 14);
    ctx.fillStyle = isRevealed ? PALETTE.darkCard : "rgba(38, 43, 54, 0.45)";
    ctx.fill();
    ctx.strokeStyle = isRevealed
      ? idx === revealedCount - 1
        ? PALETTE.orange
        : PALETTE.orangeBorder
      : "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = idx === revealedCount - 1 ? 2.5 : 1.5;
    ctx.stroke();

    if (isRevealed) {
      ctx.globalAlpha = 0.2 + 0.8 * pop;
      const monoSize = isPortrait ? 18 : 22;
      ctx.font = `700 ${monoSize}px "IBM Plex Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = PALETTE.inkLight;
      ctx.fillText(
        String(step.remainingBefore),
        sx + colW / 2,
        rectY + rectH * 0.25
      );

      ctx.fillStyle = PALETTE.orange;
      ctx.fillText(`- ${step.product}`, sx + colW / 2, rectY + rectH * 0.5);

      ctx.strokeStyle = "rgba(248, 250, 252, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + 16, rectY + rectH * 0.64);
      ctx.lineTo(sx + colW - 16, rectY + rectH * 0.64);
      ctx.stroke();

      ctx.fillStyle =
        step.remainingAfter === 0 ? PALETTE.emerald : PALETTE.inkLight;
      ctx.fillText(
        String(step.remainingAfter),
        sx + colW / 2,
        rectY + rectH * 0.8
      );
    }
    ctx.restore();
  });

  const revealedSteps = problem.steps.slice(0, revealedCount);
  const partialSum = revealedSteps.reduce((s, st) => s + st.quotientPart, 0);
  const sumStr = `${revealedSteps.map((s) => s.quotientPart).join(" + ")} = ${partialSum}`;

  ctx.save();
  ctx.direction = "ltr";
  const sumY = rectY + rectH + 34;
  ctx.font = `700 ${isPortrait ? 18 : 22}px "IBM Plex Mono", monospace`;
  ctx.fillStyle = PALETTE.inkLight;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sumStr, w / 2, sumY);

  if (revealedCount === problem.steps.length) {
    ctx.direction = "rtl";
    ctx.font = '700 15px "Cairo", sans-serif';
    ctx.fillStyle = problem.remainder > 0 ? PALETTE.orange : PALETTE.emerald;
    const summaryText =
      problem.remainder > 0
        ? `خارج القسمة = ${problem.quotient} والباقي = ${problem.remainder}`
        : `خارج القسمة = ${problem.quotient} (بدون باقٍ)`;
    ctx.fillText(summaryText, w / 2, sumY + 30);
  }
  ctx.restore();
}

function drawSyncedSubtitleBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cue: MotionCue,
  currentTimeSec: number,
  totalDurationSec: number,
  isDark: boolean,
  isPortrait: boolean
) {
  ctx.save();
  ctx.direction = "rtl";
  const barW = w * 0.88;
  const barX = (w - barW) / 2;
  const fontSize = isPortrait ? 20 : 22;
  ctx.font = `600 ${fontSize}px "IBM Plex Sans Arabic", sans-serif`;

  const lines = wrapArabicLines(ctx, cue.text, barW - 44).slice(0, 3);
  const lineHeight = fontSize * 1.55;
  const boxH = Math.max(66, lines.length * lineHeight + 28);
  const boxY = h - boxH - (isPortrait ? 44 : 34);

  drawRoundedRect(ctx, barX, boxY, barW, boxH, 16);
  ctx.fillStyle = isDark
    ? "rgba(15, 23, 42, 0.88)"
    : "rgba(255, 255, 255, 0.95)";
  ctx.fill();
  ctx.strokeStyle = isDark
    ? "rgba(255, 107, 26, 0.4)"
    : "rgba(255, 107, 26, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = isDark ? PALETTE.inkLight : PALETTE.inkDark;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const textStartY =
    boxY + boxH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, w / 2, textStartY + idx * lineHeight);
  });

  // Global bottom timeline progress bar
  const trackY = h - 22;
  const trackW = w * 0.82;
  const trackX = (w - trackW) / 2;
  const ratio =
    totalDurationSec > 0 ? clamp01(currentTimeSec / totalDurationSec) : 0;

  drawRoundedRect(ctx, trackX, trackY, trackW, 5, 2.5);
  ctx.fillStyle = isDark
    ? "rgba(255, 255, 255, 0.16)"
    : "rgba(28, 31, 38, 0.12)";
  ctx.fill();

  const activeW = Math.max(8, trackW * ratio);
  drawRoundedRect(ctx, trackX, trackY, activeW, 5, 2.5);
  ctx.fillStyle = PALETTE.orange;
  ctx.fill();

  ctx.fillStyle = PALETTE.orange;
  ctx.beginPath();
  ctx.arc(trackX + activeW, trackY + 2.5, 6.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function renderMotionFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  currentTimeSec: number,
  totalDurationSec: number,
  cues: MotionCue[],
  breadcrumbs: BreadcrumbItem[]
) {
  const isPortrait = height > width;
  const activeIdx = cues.findIndex(
    (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
  );
  const resolvedIdx = activeIdx >= 0 ? activeIdx : cues.length - 1;
  const activeCue = cues[resolvedIdx] || null;
  const prevCue = resolvedIdx > 0 ? cues[resolvedIdx - 1] : null;

  if (!activeCue) {
    ctx.fillStyle = PALETTE.darkBg;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const isCream =
    activeCue.sceneType === "intro-cream" ||
    activeCue.sceneType === "outro-cream";
  const isDark = !isCream;
  const elapsedInCue = Math.max(0, currentTimeSec - activeCue.startSec);

  const isSceneSwitch =
    !prevCue ||
    prevCue.sceneType !== activeCue.sceneType ||
    prevCue.chapterId !== activeCue.chapterId;
  const sceneTransition = isSceneSwitch
    ? easeOutCubic(clamp01(elapsedInCue / 0.42))
    : 1;
  const captionFade = easeOutCubic(clamp01(elapsedInCue / 0.2));

  // 1. Background
  if (isCream) {
    ctx.fillStyle = PALETTE.creamBg;
    ctx.fillRect(0, 0, width, height);
    drawCreamDecorations(ctx, width, height, currentTimeSec);
  } else {
    drawDarkDecorations(ctx, width, height, currentTimeSec);
    drawTopBreadcrumbStrip(
      ctx,
      width,
      isPortrait ? height * 0.048 : height * 0.06,
      breadcrumbs,
      activeCue.chapterId
    );
  }

  if (isSceneSwitch && prevCue && sceneTransition < 1) {
    const prevWasCream =
      prevCue.sceneType === "intro-cream" ||
      prevCue.sceneType === "outro-cream";
    if (prevWasCream !== isCream) {
      ctx.save();
      ctx.globalAlpha = 1 - sceneTransition;
      ctx.fillStyle = prevWasCream ? PALETTE.creamBg : PALETTE.darkBg;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  // 2. Scene Headline + Body Content
  ctx.save();
  ctx.globalAlpha = sceneTransition;
  ctx.translate(0, (1 - sceneTransition) * 24);

  const headlineY = isCream
    ? isPortrait
      ? height * 0.17
      : height * 0.18
    : isPortrait
    ? height * 0.145
    : height * 0.17;

  drawHighlightedHeadline(
    ctx,
    width / 2,
    headlineY,
    width,
    activeCue.headlinePrefix || "",
    activeCue.headlineHighlight || activeCue.chapterTitle,
    activeCue.headlineSuffix || "",
    isDark,
    isPortrait ? 0.92 : 1.05
  );

  // 3. Scene Body Content
  if (isCream) {
    if (activeCue.badgeText) {
      ctx.save();
      ctx.direction = "rtl";
      ctx.font = '600 15px "IBM Plex Sans Arabic", sans-serif';
      const bw = Math.min(width * 0.86, ctx.measureText(activeCue.badgeText).width + 44);
      const bx = width / 2 - bw / 2;
      const by = headlineY + 46;
      drawRoundedRect(ctx, bx, by, bw, 34, 17);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = PALETTE.creamBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = PALETTE.orange;
      ctx.beginPath();
      ctx.arc(bx + bw - 16, by + 17, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.inkDark;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        fitSingleLineText(ctx, activeCue.badgeText, bw - 36),
        width / 2 - 4,
        by + 17
      );
      ctx.restore();
    }

    const previewW = isPortrait ? width * 0.8 : width * 0.56;
    const previewH = isPortrait ? height * 0.4 : height * 0.44;
    const previewY = isPortrait ? height * 0.31 : height * 0.33;
    const cueDur = Math.max(0.5, activeCue.endSec - activeCue.startSec);

    const previewHeader =
      activeCue.badgeText || activeCue.chapterTitle || "استوديو الموشن الصوتي";
    const previewTags =
      activeCue.previewTags ||
      breadcrumbs.slice(0, 3).map((b) => b.title.slice(0, 14));

    drawIntroPreviewWindow(
      ctx,
      width,
      previewY,
      previewW,
      previewH,
      (elapsedInCue / cueDur) * 0.85 + 0.15,
      previewHeader,
      previewTags
    );
  } else if (activeCue.sceneType === "numbered-steps") {
    drawNumberedCardsScene(
      ctx,
      width,
      height,
      activeCue,
      elapsedInCue,
      isPortrait
    );
  } else if (activeCue.sceneType === "area-model") {
    drawAreaModelMotionScene(
      ctx,
      width,
      height,
      activeCue,
      elapsedInCue,
      isPortrait
    );
  } else if (activeCue.sceneType === "highlight-stat") {
    drawHighlightStatScene(
      ctx,
      width,
      height,
      activeCue,
      elapsedInCue,
      isPortrait
    );
  } else {
    drawChecklistScene(
      ctx,
      width,
      height,
      activeCue,
      elapsedInCue,
      isPortrait
    );
  }

  ctx.restore();

  // 4. Synchronized Bottom Subtitle & Timeline Scrubber
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.65 * captionFade;
  drawSyncedSubtitleBar(
    ctx,
    width,
    height,
    activeCue,
    currentTimeSec,
    totalDurationSec,
    isDark,
    isPortrait
  );
  ctx.restore();
}
