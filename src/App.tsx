import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  INITIAL_LESSON_CHAPTERS,
  LESSON_STYLE_PRESETS,
  DEFAULT_CLONED_VOICE_PROFILE,
  type LessonChapter,
  type VoiceCloneProfile,
} from "./data/lessonChapters";
import { ControlDeck, type ChapterAudioState } from "./components/ControlDeck";
import { LessonStage } from "./components/LessonStage";
import { ScriptToVideoStudio } from "./components/ScriptToVideoStudio";
import { MotionVideoStudio } from "./components/MotionVideoStudio";
import {
  base64ToUint8Array,
  ensureWavBytes,
  getWavDurationSeconds,
  stitchWavBuffers,
} from "./utils/wavUtils";
import {
  buildAudioCacheKey,
  loadAllCachedAudio,
  saveCachedAudio,
} from "./utils/audioCache";
import { Volume2, Loader2, Square, AlertCircle, X, Wand2 } from "lucide-react";

type WorkspaceTab = "script" | "lesson" | "motion";

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("script");
  const [chapters, setChapters] = useState<LessonChapter[]>(
    INITIAL_LESSON_CHAPTERS
  );
  const [activeChapterId, setActiveChapterId] = useState<string>(
    INITIAL_LESSON_CHAPTERS[0].id
  );
  const [audioMap, setAudioMap] = useState<Record<string, ChapterAudioState>>(
    {}
  );

  const [voiceName, setVoiceName] = useState<string>("Charon");
  const [stylePresetId, setStylePresetId] = useState<string>("cloned");
  const [clonedProfile, setClonedProfile] = useState<VoiceCloneProfile>(
    DEFAULT_CLONED_VOICE_PROFILE
  );
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const [playingChapterId, setPlayingChapterId] = useState<string | null>(null);
  const [isPlayingFullLesson, setIsPlayingFullLesson] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isBatchGenerating, setIsBatchGenerating] = useState<boolean>(false);
  const [quotaBanner, setQuotaBanner] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const batchCancelRef = useRef<boolean>(false);
  const audioMapRef = useRef<Record<string, ChapterAudioState>>({});
  const isPlayingFullLessonRef = useRef<boolean>(false);
  const playingChapterIdRef = useRef<string | null>(null);
  const isSwitchingTrackRef = useRef<boolean>(false);

  useEffect(() => {
    audioMapRef.current = audioMap;
  }, [audioMap]);

  useEffect(() => {
    isPlayingFullLessonRef.current = isPlayingFullLesson;
  }, [isPlayingFullLesson]);

  useEffect(() => {
    playingChapterIdRef.current = playingChapterId;
  }, [playingChapterId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Hydrate cached WAV clips from IndexedDB on mount
  useEffect(() => {
    let active = true;
    void loadAllCachedAudio().then((clips) => {
      if (!active || clips.length === 0) return;
      setAudioMap((prev) => {
        const next = { ...prev };
        for (const clip of clips) {
          const ch = INITIAL_LESSON_CHAPTERS.find((c) => c.id === clip.chapterId);
          if (!ch) continue;
          const effectiveStyleKey =
            stylePresetId === "cloned"
              ? `cloned:${clonedProfile.stylePrompt.slice(0, 48)}`
              : stylePresetId;
          const expectedKey = buildAudioCacheKey(
            ch.id,
            voiceName,
            effectiveStyleKey,
            ch.text
          );
          if (clip.key === expectedKey && next[ch.id]?.status !== "ready") {
            const blob = new Blob([clip.wavBytes.buffer as ArrayBuffer], {
              type: "audio/wav",
            });
            next[ch.id] = {
              status: "ready",
              audioUrl: URL.createObjectURL(blob),
              wavBytes: clip.wavBytes,
              durationSec: clip.durationSec,
            };
          }
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [voiceName, stylePresetId, clonedProfile.stylePrompt]);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(audioMapRef.current).forEach((item) => {
        if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      });
    };
  }, []);

  const generateChapterAudio = useCallback(
    async (
      chapterId: string
    ): Promise<{ ok: boolean; isQuotaError?: boolean; error?: string }> => {
      const target = chapters.find((c) => c.id === chapterId);
      if (!target) return { ok: false };

      setQuotaBanner(null);
      setAudioMap((prev) => ({
        ...prev,
        [chapterId]: {
          ...prev[chapterId],
          status: "generating",
          error: undefined,
        },
      }));

      try {
        const isClonedStyle = stylePresetId === "cloned";
        const stylePrompt = isClonedStyle
          ? clonedProfile.stylePrompt
          : LESSON_STYLE_PRESETS.find((p) => p.id === stylePresetId)?.prompt ||
            LESSON_STYLE_PRESETS[0].prompt;

        const res = await fetch("/api/tts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: target.text,
            voiceName,
            style: stylePrompt,
            useVoiceDesign: isClonedStyle,
          }),
        });

        const data = (await res.json()) as {
          audioBase64?: string;
          mimeType?: string;
          error?: string;
          code?: string;
        };

        if (!res.ok || !data.audioBase64) {
          const errMsg = data.error || "تعذر تحويل النص إلى صوت.";
          const isQuota =
            res.status === 429 ||
            data.code === "DAILY_QUOTA_EXHAUSTED" ||
            data.code === "RATE_LIMITED";
          if (isQuota) {
            setQuotaBanner(errMsg);
          }
          setAudioMap((prev) => ({
            ...prev,
            [chapterId]: {
              ...prev[chapterId],
              status: "error",
              error: errMsg,
            },
          }));
          return { ok: false, isQuotaError: isQuota, error: errMsg };
        }

        const wavBytes = ensureWavBytes(base64ToUint8Array(data.audioBase64));
        const durationSec = getWavDurationSeconds(wavBytes);
        const blob = new Blob([wavBytes.buffer as ArrayBuffer], {
          type: data.mimeType || "audio/wav",
        });
        const newUrl = URL.createObjectURL(blob);

        const effectiveStyleKey =
          stylePresetId === "cloned"
            ? `cloned:${clonedProfile.stylePrompt.slice(0, 48)}`
            : stylePresetId;
        const cacheKey = buildAudioCacheKey(
          target.id,
          voiceName,
          effectiveStyleKey,
          target.text
        );
        void saveCachedAudio({
          key: cacheKey,
          chapterId: target.id,
          voiceName,
          stylePresetId: effectiveStyleKey,
          text: target.text,
          wavBytes,
          durationSec,
          createdAt: Date.now(),
        });

        setAudioMap((prev) => {
          const oldUrl = prev[chapterId]?.audioUrl;
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          return {
            ...prev,
            [chapterId]: {
              status: "ready",
              audioUrl: newUrl,
              wavBytes,
              durationSec,
            },
          };
        });

        return { ok: true };
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "حدث خطأ غير متوقع أثناء توليد الصوت.";
        setAudioMap((prev) => ({
          ...prev,
          [chapterId]: {
            ...prev[chapterId],
            status: "error",
            error: message,
          },
        }));
        return { ok: false, error: message };
      }
    },
    [chapters, stylePresetId, voiceName, clonedProfile.stylePrompt]
  );

  const playChapterById = useCallback(
    (chapterId: string, continueFullLesson = false) => {
      const state = audioMapRef.current[chapterId];
      const audio = audioRef.current;
      if (!state?.audioUrl || !audio) return;

      setActiveChapterId(chapterId);
      setIsPlayingFullLesson(continueFullLesson);

      if (playingChapterIdRef.current === chapterId && !audio.paused) {
        audio.pause();
        setPlayingChapterId(null);
        setIsPlayingFullLesson(false);
        return;
      }

      if (audio.src !== state.audioUrl) {
        isSwitchingTrackRef.current = true;
        audio.src = state.audioUrl;
        setCurrentTime(0);
      }
      audio.playbackRate = playbackRate;
      setPlayingChapterId(chapterId);
      void audio.play().catch(() => {
        isSwitchingTrackRef.current = false;
        setPlayingChapterId(null);
        setIsPlayingFullLesson(false);
      });
    },
    [playbackRate]
  );

  const handleAudioEnded = () => {
    const currentId = playingChapterIdRef.current;
    if (isPlayingFullLessonRef.current && currentId) {
      const currentIdx = chapters.findIndex((c) => c.id === currentId);
      for (let i = currentIdx + 1; i < chapters.length; i++) {
        const nextChapter = chapters[i];
        if (audioMapRef.current[nextChapter.id]?.status === "ready") {
          playChapterById(nextChapter.id, true);
          return;
        }
      }
    }
    setPlayingChapterId(null);
    setIsPlayingFullLesson(false);
  };

  const handleBatchGenerate = async () => {
    if (activeTab === "script") {
      setActiveTab("lesson");
    }
    batchCancelRef.current = false;
    setQuotaBanner(null);
    setIsBatchGenerating(true);

    const allReady = chapters.every(
      (c) => audioMapRef.current[c.id]?.status === "ready"
    );

    const queue = allReady
      ? chapters
      : chapters.filter((c) => audioMapRef.current[c.id]?.status !== "ready");

    for (const chapter of queue) {
      if (batchCancelRef.current) break;
      setActiveChapterId(chapter.id);
      const result = await generateChapterAudio(chapter.id);
      if (result.isQuotaError) {
        break;
      }
    }

    setIsBatchGenerating(false);
  };

  const handleStopBatch = () => {
    batchCancelRef.current = true;
    setIsBatchGenerating(false);
  };

  const handleToggleFullLessonPlay = () => {
    if (isPlayingFullLesson && playingChapterId) {
      audioRef.current?.pause();
      setPlayingChapterId(null);
      setIsPlayingFullLesson(false);
      return;
    }

    const firstReady = chapters.find(
      (c) => audioMap[c.id]?.status === "ready"
    );
    if (firstReady) {
      playChapterById(firstReady.id, true);
    }
  };

  const handleDownloadChapter = (chapterId: string) => {
    const state = audioMap[chapterId];
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!state?.audioUrl || !chapter) return;

    const link = document.createElement("a");
    link.href = state.audioUrl;
    link.download = `lesson-${chapter.indexLabel}-${chapter.id}.wav`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownloadFullLesson = () => {
    const readyBuffers: Uint8Array[] = [];
    for (const chapter of chapters) {
      const bytes = audioMap[chapter.id]?.wavBytes;
      if (bytes) readyBuffers.push(bytes);
    }
    if (readyBuffers.length === 0) return;

    const stitchedBlob = stitchWavBuffers(readyBuffers);
    const url = URL.createObjectURL(stitchedBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "amr-sherif-area-model-lesson.wav";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const activeChapter =
    chapters.find((c) => c.id === activeChapterId) || chapters[0];
  const activeAudioState: ChapterAudioState = audioMap[activeChapter.id] || {
    status: "idle",
  };

  const handleSelectChapter = (id: string) => {
    setActiveTab("lesson");
    setActiveChapterId(id);
    if (audioRef.current && playingChapterId !== id) {
      audioRef.current.pause();
      setPlayingChapterId(null);
      setIsPlayingFullLesson(false);
      setCurrentTime(0);
      setDuration(audioMap[id]?.durationSec || 0);
    }
  };

  const handleUpdateChapterText = (newText: string) => {
    setChapters((prev) =>
      prev.map((c) =>
        c.id === activeChapter.id ? { ...c, text: newText } : c
      )
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Hidden Shared Audio Element */}
      <audio
        ref={audioRef}
        onPlay={() => {
          isSwitchingTrackRef.current = false;
        }}
        onEnded={handleAudioEnded}
        onPause={() => {
          if (isSwitchingTrackRef.current || audioRef.current?.ended) return;
          setPlayingChapterId(null);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration);
          }
        }}
      />

      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#script-studio"
            onClick={() => setActiveTab("script")}
            className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            استوديو السكربت والموشن
          </a>

          <nav
            aria-label="التنقل الرئيسي"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <a
              href="#script-studio"
              onClick={() => {
                audioRef.current?.pause();
                setPlayingChapterId(null);
                setIsPlayingFullLesson(false);
                setActiveTab("script");
              }}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              تحويل السكربت لصوت وفيديو
            </a>
            <a
              href="#stage"
              onClick={() => setActiveTab("lesson")}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              الدرس التفاعلي (٨ فصول)
            </a>
            <a
              href="#motion-studio"
              onClick={() => {
                audioRef.current?.pause();
                setPlayingChapterId(null);
                setIsPlayingFullLesson(false);
                setActiveTab("motion");
              }}
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              موشن الدرس الكامل
            </a>
          </nav>

          <div className="shrink-0">
            {activeTab === "script" ? (
              <button
                type="button"
                onClick={() => setActiveTab("lesson")}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-sky-600" />
                <span>الدرس التفاعلي</span>
              </button>
            ) : !isBatchGenerating ? (
              <button
                type="button"
                onClick={handleBatchGenerate}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>تحويل الفصول لصوت</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopBatch}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>إيقاف التوليد</span>
                <Square className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Hero Header */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 mb-2">
              <span>توليد الصوت بالذكاء الاصطناعي</span>
              <span aria-hidden="true">·</span>
              <span>مزامنة تلقائية للمشاهد</span>
              <span aria-hidden="true">·</span>
              <span>تصدير WAV + فيديو موشن جرافيك</span>
            </div>
            <h1 className="text-[clamp(1.65rem,3vw,2.35rem)] font-extrabold text-slate-900 leading-tight [text-wrap:balance]">
              من السكربت إلى الصوت وفيديو الموشن جرافيك الكامل
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
              أضف أي سكربت ليقوم الاستوديو تلقائياً بتوليد الملف الصوتي (WAV)، وتقسيم النص لمشاهد بصرية متزامنة مع نبضات الصوت، وإخراج فيديو الموشن جرافيك الكامل جاهزاً للتحميل.
            </p>
          </div>

          {/* Segmented Mode Switch */}
          <div
            role="tablist"
            aria-label="وضع الاستوديو"
            className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start lg:self-end shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "script"}
              onClick={() => {
                audioRef.current?.pause();
                setPlayingChapterId(null);
                setIsPlayingFullLesson(false);
                setActiveTab("script");
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === "script"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              استوديو السكربت الكامل
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "lesson"}
              onClick={() => setActiveTab("lesson")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === "lesson"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              الدرس التفاعلي (٨ فصول)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "motion"}
              onClick={() => {
                audioRef.current?.pause();
                setPlayingChapterId(null);
                setIsPlayingFullLesson(false);
                setActiveTab("motion");
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === "motion"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              موشن الدرس
            </button>
          </div>
        </section>

        {quotaBanner && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-start gap-2.5 text-sm">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{quotaBanner}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("script");
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-amber-300 hover:bg-amber-100 rounded-lg text-amber-900 cursor-pointer whitespace-nowrap"
              >
                رفع ملف صوتي في الاستوديو
              </button>
              <button
                type="button"
                aria-label="إغلاق التنبيه"
                onClick={() => setQuotaBanner(null)}
                className="p-1.5 text-amber-700 hover:text-amber-950 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeTab === "script" ? (
          <ScriptToVideoStudio
            voiceName={voiceName}
            onVoiceChange={setVoiceName}
            stylePresetId={stylePresetId}
            onStylePresetChange={setStylePresetId}
            clonedProfile={clonedProfile}
            onClonedProfileChange={setClonedProfile}
          />
        ) : activeTab === "lesson" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8">
              <LessonStage
                chapter={activeChapter}
                audioState={activeAudioState}
                isPlaying={playingChapterId === activeChapter.id}
                currentTime={
                  playingChapterId === activeChapter.id ? currentTime : 0
                }
                duration={
                  playingChapterId === activeChapter.id
                    ? duration
                    : activeAudioState.durationSec || 0
                }
                playbackRate={playbackRate}
                onPlaybackRateChange={setPlaybackRate}
                onSeek={(t) => {
                  if (audioRef.current) {
                    if (
                      activeAudioState.audioUrl &&
                      audioRef.current.src !== activeAudioState.audioUrl
                    ) {
                      audioRef.current.src = activeAudioState.audioUrl;
                    }
                    audioRef.current.currentTime = t;
                    setCurrentTime(t);
                  }
                }}
                onTogglePlay={() => playChapterById(activeChapter.id, false)}
                onGenerate={() => {
                  void generateChapterAudio(activeChapter.id);
                }}
                onUpdateText={handleUpdateChapterText}
                onDownloadChapter={() =>
                  handleDownloadChapter(activeChapter.id)
                }
              />
            </div>

            <div className="lg:col-span-4">
              <ControlDeck
                chapters={chapters}
                activeChapterId={activeChapter.id}
                onSelectChapter={handleSelectChapter}
                audioMap={audioMap}
                playingChapterId={playingChapterId}
                onPlayChapter={(id) => playChapterById(id, false)}
                onGenerateChapter={(id) => {
                  void generateChapterAudio(id);
                }}
                voiceName={voiceName}
                onVoiceChange={setVoiceName}
                stylePresetId={stylePresetId}
                onStylePresetChange={setStylePresetId}
                isBatchGenerating={isBatchGenerating}
                onBatchGenerate={handleBatchGenerate}
                onStopBatch={handleStopBatch}
                isPlayingFullLesson={isPlayingFullLesson}
                onToggleFullLessonPlay={handleToggleFullLessonPlay}
                onDownloadFullLesson={handleDownloadFullLesson}
              />
            </div>
          </div>
        ) : (
          <MotionVideoStudio
            chapters={chapters}
            audioMap={audioMap}
            activeChapterId={activeChapter.id}
            onGenerateChapter={async (id) => {
              const res = await generateChapterAudio(id);
              return res.ok;
            }}
            onBatchGenerate={handleBatchGenerate}
            isBatchGenerating={isBatchGenerating}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1360px] mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            منصة تحويل السكربت إلى صوت وفيديو موشن جرافيك · إعداد الأستاذ عمرو شريف
          </span>
          <span>تصدير الصوت WAV 24kHz · تصدير الفيديو WebM / MP4 30fps</span>
        </div>
      </footer>
    </div>
  );
}
