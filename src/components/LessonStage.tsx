import React, { useState } from "react";
import type { LessonChapter } from "../data/lessonChapters";
import type { ChapterAudioState } from "./ControlDeck";
import { AreaModelDiagram } from "./AreaModelDiagram";
import { formatDuration } from "../utils/wavUtils";
import {
  Play,
  Pause,
  Download,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Edit3,
  AlertCircle,
  Volume2,
} from "lucide-react";

interface LessonStageProps {
  chapter: LessonChapter;
  audioState: ChapterAudioState;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onGenerate: () => void;
  onUpdateText: (newText: string) => void;
  onDownloadChapter: () => void;
}

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.25];

export const LessonStage: React.FC<LessonStageProps> = ({
  chapter,
  audioState,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  onPlaybackRateChange,
  onSeek,
  onTogglePlay,
  onGenerate,
  onUpdateText,
  onDownloadChapter,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chapter.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const wordCount = chapter.text.trim().split(/\s+/).filter(Boolean).length;
  const effectiveDuration = duration || audioState.durationSec || 0;
  const progressRatio =
    effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  return (
    <div id="stage" className="space-y-6">
      {/* Primary Audio Player & Chapter Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-sky-700">
                الفصل {chapter.indexLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span>{chapter.subtitle}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{wordCount} كلمة</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mt-1.5">
              {chapter.title}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {audioState.status === "ready" && (
              <button
                type="button"
                onClick={onDownloadChapter}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل المقطع</span>
              </button>
            )}

            <button
              type="button"
              disabled={audioState.status === "generating"}
              onClick={onGenerate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {audioState.status === "generating" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جارٍ التحويل لصوت...</span>
                </>
              ) : audioState.status === "ready" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة التوليد</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>تحويل هذا الفصل لصوت</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Audio Player Bar */}
        <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
          {audioState.status === "error" && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{audioState.error || "حدث خطأ أثناء توليد الصوت."}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={audioState.status !== "ready"}
              onClick={onTogglePlay}
              aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل الصوت"}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                audioState.status === "ready"
                  ? "bg-sky-600 hover:bg-sky-700 text-white"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 translate-x-[1px]" />
              )}
            </button>

            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5 font-mono tabular-nums">
                <span>{formatDuration(currentTime)}</span>
                <span className="font-sans text-slate-500">
                  {audioState.status === "ready"
                    ? isPlaying
                      ? "قيد التشغيل"
                      : "جاهز للتشغيل"
                    : audioState.status === "generating"
                    ? "يتم الآن توليد الصوت..."
                    : "اضغط «تحويل هذا الفصل لصوت» للاستماع"}
                </span>
                <span>{formatDuration(effectiveDuration)}</span>
              </div>

              <input
                type="range"
                min={0}
                max={effectiveDuration || 100}
                step={0.1}
                value={currentTime}
                disabled={audioState.status !== "ready"}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label="شريط التقدم الصوتي"
                className="w-full accent-sky-600 cursor-pointer disabled:opacity-40"
                style={{
                  background: `linear-gradient(to left, #0284c7 ${
                    progressRatio * 100
                  }%, #e2e8f0 ${progressRatio * 100}%)`,
                }}
              />
            </div>

            {/* Playback Speed Controls */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg">
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => onPlaybackRateChange(rate)}
                  className={`px-2 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer tabular-nums ${
                    playbackRate === rate
                      ? "bg-slate-900 text-white font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Script Viewer / Editor */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-900">
              نص الشرح الصوتي للفصل
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ النص</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  isEditing
                    ? "bg-sky-50 text-sky-800 border border-sky-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? "إنهاء التعديل" : "تعديل النص"}</span>
              </button>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={chapter.text}
                onChange={(e) => onUpdateText(e.target.value)}
                rows={12}
                className="w-full rounded-xl border border-slate-300 bg-white p-4 text-base leading-8 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-xs text-slate-500">
                بعد تعديل النص، اضغط «إعادة التوليد» لتحديث الصوت وفق النص الجديد.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50/70 border border-slate-200 p-5 text-[16px] leading-[1.95] text-slate-800 whitespace-pre-line">
              {chapter.text}
            </div>
          )}
        </div>
      </section>

      {/* Interactive Area Model Visualizer when this chapter covers a division problem */}
      {chapter.problem && <AreaModelDiagram problem={chapter.problem} />}
    </div>
  );
};
