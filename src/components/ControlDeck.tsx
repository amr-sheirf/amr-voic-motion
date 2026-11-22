import React from "react";
import {
  VOICE_OPTIONS,
  LESSON_STYLE_PRESETS,
  type LessonChapter,
} from "../data/lessonChapters";
import { formatDuration } from "../utils/wavUtils";
import {
  Play,
  Pause,
  Download,
  Loader2,
  CheckCircle2,
  Volume2,
  Sparkles,
  Square,
} from "lucide-react";

export interface ChapterAudioState {
  status: "idle" | "generating" | "ready" | "error";
  audioUrl?: string;
  wavBytes?: Uint8Array;
  durationSec?: number;
  error?: string;
}

interface ControlDeckProps {
  chapters: LessonChapter[];
  activeChapterId: string;
  onSelectChapter: (id: string) => void;
  audioMap: Record<string, ChapterAudioState>;
  playingChapterId: string | null;
  onPlayChapter: (id: string) => void;
  onGenerateChapter: (id: string) => void;
  voiceName: string;
  onVoiceChange: (voice: string) => void;
  stylePresetId: string;
  onStylePresetChange: (presetId: string) => void;
  isBatchGenerating: boolean;
  onBatchGenerate: () => void;
  onStopBatch: () => void;
  isPlayingFullLesson: boolean;
  onToggleFullLessonPlay: () => void;
  onDownloadFullLesson: () => void;
}

export const ControlDeck: React.FC<ControlDeckProps> = ({
  chapters,
  activeChapterId,
  onSelectChapter,
  audioMap,
  playingChapterId,
  onPlayChapter,
  onGenerateChapter,
  voiceName,
  onVoiceChange,
  stylePresetId,
  onStylePresetChange,
  isBatchGenerating,
  onBatchGenerate,
  onStopBatch,
  isPlayingFullLesson,
  onToggleFullLessonPlay,
  onDownloadFullLesson,
}) => {
  const readyCount = chapters.filter(
    (c) => audioMap[c.id]?.status === "ready"
  ).length;
  const totalDuration = chapters.reduce(
    (sum, c) => sum + (audioMap[c.id]?.durationSec || 0),
    0
  );
  const progressPercent = Math.round((readyCount / chapters.length) * 100);

  return (
    <aside className="space-y-6">
      {/* Full Lesson Batch Compiler & Export */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            تجهيز الدرس الصوتي الكامل
          </h2>
          <span className="text-xs font-mono text-slate-600 tabular-nums">
            {readyCount}/{chapters.length} فصول
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-sky-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 mb-5 tabular-nums">
          <span>
            {readyCount === chapters.length
              ? "اكتمل توليد جميع فصول الدرس"
              : readyCount === 0
              ? "اضغط لتوليد الصوت للدرس بالكامل"
              : `تم تجهيز ${readyCount} من ${chapters.length} فصول`}
          </span>
          {totalDuration > 0 && (
            <span className="font-mono">المدة: {formatDuration(totalDuration)}</span>
          )}
        </div>

        <div className="space-y-2.5">
          {!isBatchGenerating ? (
            <button
              type="button"
              onClick={onBatchGenerate}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {readyCount === chapters.length
                  ? "إعادة توليد الدرس بالكامل"
                  : readyCount > 0
                  ? "استكمال توليد الفصول المتبقية"
                  : "توليد صوت الدرس بالكامل"}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStopBatch}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Square className="w-4 h-4" />
              <span>إيقاف التوليد التلقائي مؤقتًا</span>
            </button>
          )}

          {readyCount > 0 && (
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={onToggleFullLessonPlay}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {isPlayingFullLesson ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>إيقاف التشغيل</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>تشغيل متواصل</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onDownloadFullLesson}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تحميل WAV كامل</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Voice & Delivery Configuration */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-sky-600" />
            <span>إعدادات الصوت والإلقاء</span>
          </h2>
          <label
            htmlFor="voice-select"
            className="block text-xs font-medium text-slate-600 mb-1.5"
          >
            نبرة الصوت
          </label>
          <select
            id="voice-select"
            value={voiceName}
            onChange={(e) => onVoiceChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.description}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-600 mb-2">
            أسلوب المعلم
          </span>
          <div className="space-y-1.5">
            {LESSON_STYLE_PRESETS.map((preset) => {
              const active = preset.id === stylePresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onStylePresetChange(preset.id)}
                  className={`w-full text-right px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    active
                      ? "bg-sky-50 border-sky-300 text-sky-900"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chapters Playlist */}
      <div
        id="chapters"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">فصول الدرس</h2>
          <span className="text-xs text-slate-500">اختر فصلاً للمعاينة</span>
        </div>

        <div className="divide-y divide-slate-200">
          {chapters.map((chapter) => {
            const state = audioMap[chapter.id] || { status: "idle" };
            const isSelected = chapter.id === activeChapterId;
            const isPlaying = playingChapterId === chapter.id;

            return (
              <div
                key={chapter.id}
                className={`px-5 py-3.5 transition-colors flex items-center justify-between gap-3 ${
                  isSelected ? "bg-sky-50/70" : "hover:bg-slate-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChapter(chapter.id)}
                  className="flex-1 text-right min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-700">
                      {chapter.indexLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    {state.status === "ready" && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>جاهز</span>
                        {state.durationSec !== undefined && (
                          <span className="font-mono tabular-nums">
                            ({formatDuration(state.durationSec)})
                          </span>
                        )}
                      </span>
                    )}
                    {state.status === "generating" && (
                      <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جارٍ التوليد...</span>
                      </span>
                    )}
                    {state.status === "error" && (
                      <span className="text-red-700 font-medium">
                        تعذر التوليد
                      </span>
                    )}
                    {state.status === "idle" && <span>في الانتظار</span>}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                    {chapter.title}
                  </p>
                </button>

                <div className="shrink-0 flex items-center gap-1.5">
                  {state.status === "ready" ? (
                    <button
                      type="button"
                      onClick={() => onPlayChapter(chapter.id)}
                      aria-label={isPlaying ? "إيقاف الفصل" : "تشغيل الفصل"}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                        isPlaying
                          ? "bg-sky-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={state.status === "generating"}
                      onClick={() => onGenerateChapter(chapter.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {state.status === "generating" ? "جارٍ..." : "توليد"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
