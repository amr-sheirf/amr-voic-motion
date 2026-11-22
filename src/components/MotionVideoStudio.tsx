import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import type { LessonChapter } from "../data/lessonChapters";
import type { ChapterAudioState } from "./ControlDeck";
import { stitchWavBuffers, formatDuration } from "../utils/wavUtils";
import {
  buildSynchronizedCuesForChapters,
  buildSynchronizedCuesForCustomText,
  detectSilenceValleys,
  type MotionCue,
} from "../utils/syncEngine";
import { renderMotionFrame } from "../utils/motionCanvasRenderer";
import {
  Play,
  Pause,
  Download,
  Film,
  Upload,
  Loader2,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
  Square,
  AlertCircle,
} from "lucide-react";

interface MotionVideoStudioProps {
  chapters: LessonChapter[];
  audioMap: Record<string, ChapterAudioState>;
  activeChapterId: string;
  onGenerateChapter: (chapterId: string) => Promise<boolean>;
  onBatchGenerate: () => void;
  isBatchGenerating: boolean;
}

type SourceMode = "chapter" | "full-lesson" | "upload";
type AspectMode = "9:16" | "16:9";

export const MotionVideoStudio: React.FC<MotionVideoStudioProps> = ({
  chapters,
  audioMap,
  activeChapterId,
  onGenerateChapter,
  onBatchGenerate,
  isBatchGenerating,
}) => {
  const [sourceMode, setSourceMode] = useState<SourceMode>("chapter");
  const [selectedChapterId, setSelectedChapterId] =
    useState<string>(activeChapterId);
  const [aspectMode, setAspectMode] = useState<AspectMode>("9:16");

  // External upload state
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string>("");
  const [uploadedAudioBytes, setUploadedAudioBytes] =
    useState<ArrayBuffer | null>(null);
  const [uploadedText, setUploadedText] = useState<string>(
    chapters[0]?.text || ""
  );
  const [uploadedTitle, setUploadedTitle] = useState<string>(
    "نموذج مساحة المستطيل"
  );

  // Decoded Audio & Cues state
  const [activeAudioUrl, setActiveAudioUrl] = useState<string>("");
  const [decodedBuffer, setDecodedBuffer] = useState<AudioBuffer | null>(null);
  const [cues, setCues] = useState<MotionCue[]>([]);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string>("");
  const [exportedExt, setExportedExt] = useState<string>("webm");
  const [exportError, setExportError] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const exportCancelRef = useRef<{ cancel: () => void } | null>(null);

  const canvasDims = useMemo(() => {
    return aspectMode === "9:16"
      ? { width: 720, height: 1280 }
      : { width: 1280, height: 720 };
  }, [aspectMode]);

  const readyChapters = useMemo(
    () => chapters.filter((c) => audioMap[c.id]?.status === "ready"),
    [chapters, audioMap]
  );

  // Sync selectedChapterId when prop changes and user hasn't overridden
  useEffect(() => {
    setSelectedChapterId(activeChapterId);
  }, [activeChapterId]);

  // Revoke exported URL on cleanup
  useEffect(() => {
    return () => {
      if (exportedVideoUrl) URL.revokeObjectURL(exportedVideoUrl);
    };
  }, [exportedVideoUrl]);

  useEffect(() => {
    return () => {
      if (uploadedAudioUrl) URL.revokeObjectURL(uploadedAudioUrl);
    };
  }, [uploadedAudioUrl]);

  // Build synchronized cues + active audio whenever source changes
  useEffect(() => {
    let cancelled = false;
    let stitchedUrlToRevoke: string | null = null;

    async function prepareSync() {
      setIsPlaying(false);
      setCurrentTime(0);

      if (sourceMode === "chapter") {
        const ch = chapters.find((c) => c.id === selectedChapterId);
        const state = ch ? audioMap[ch.id] : undefined;
        if (!ch || state?.status !== "ready" || !state.wavBytes || !state.audioUrl) {
          setActiveAudioUrl("");
          setDecodedBuffer(null);
          setCues([]);
          setTotalDuration(0);
          return;
        }

        setIsAnalyzing(true);
        try {
          const ctx = new AudioContext();
          const copy = state.wavBytes.slice().buffer;
          const audioBuf = await ctx.decodeAudioData(copy);
          await ctx.close();
          if (cancelled) return;

          const valleys = detectSilenceValleys(audioBuf);
          const built = buildSynchronizedCuesForChapters([
            { chapter: ch, durationSec: audioBuf.duration, valleys },
          ]);

          setActiveAudioUrl(state.audioUrl);
          setDecodedBuffer(audioBuf);
          setTotalDuration(audioBuf.duration);
          setCues(built);
        } catch {
          if (!cancelled) {
            const dur = state.durationSec || 10;
            setActiveAudioUrl(state.audioUrl);
            setDecodedBuffer(null);
            setTotalDuration(dur);
            setCues(
              buildSynchronizedCuesForChapters([{ chapter: ch, durationSec: dur }])
            );
          }
        } finally {
          if (!cancelled) setIsAnalyzing(false);
        }
      } else if (sourceMode === "full-lesson") {
        if (readyChapters.length === 0) {
          setActiveAudioUrl("");
          setDecodedBuffer(null);
          setCues([]);
          setTotalDuration(0);
          return;
        }

        setIsAnalyzing(true);
        try {
          const buffers: Uint8Array[] = [];
          const chapterData: Array<{
            chapter: LessonChapter;
            durationSec: number;
            valleys?: number[];
          }> = [];

          const ctx = new AudioContext();
          for (const ch of readyChapters) {
            const wb = audioMap[ch.id]?.wavBytes;
            if (!wb) continue;
            buffers.push(wb);
            const decoded = await ctx.decodeAudioData(wb.slice().buffer);
            const valleys = detectSilenceValleys(decoded);
            chapterData.push({
              chapter: ch,
              durationSec: decoded.duration,
              valleys,
            });
          }

          const stitchedBlob = stitchWavBuffers(buffers);
          const stitchedArr = await stitchedBlob.arrayBuffer();
          const fullBuf = await ctx.decodeAudioData(stitchedArr);
          await ctx.close();
          if (cancelled) return;

          const url = URL.createObjectURL(stitchedBlob);
          stitchedUrlToRevoke = url;

          const built = buildSynchronizedCuesForChapters(chapterData);
          setActiveAudioUrl(url);
          setDecodedBuffer(fullBuf);
          setTotalDuration(fullBuf.duration);
          setCues(built);
        } catch {
          if (!cancelled) {
            setCues([]);
          }
        } finally {
          if (!cancelled) setIsAnalyzing(false);
        }
      } else if (sourceMode === "upload") {
        if (!uploadedAudioBytes || !uploadedAudioUrl) {
          setActiveAudioUrl("");
          setDecodedBuffer(null);
          setCues([]);
          setTotalDuration(0);
          return;
        }

        setIsAnalyzing(true);
        try {
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(uploadedAudioBytes.slice(0));
          await ctx.close();
          if (cancelled) return;

          const valleys = detectSilenceValleys(decoded);
          const built = buildSynchronizedCuesForCustomText(
            uploadedText,
            uploadedTitle,
            decoded.duration,
            valleys
          );

          setActiveAudioUrl(uploadedAudioUrl);
          setDecodedBuffer(decoded);
          setTotalDuration(decoded.duration);
          setCues(built);
        } catch {
          if (!cancelled) {
            setExportError("تعذر فك تشفير الملف الصوتي المرفوع.");
          }
        } finally {
          if (!cancelled) setIsAnalyzing(false);
        }
      }
    }

    void prepareSync();

    return () => {
      cancelled = true;
      if (stitchedUrlToRevoke) {
        URL.revokeObjectURL(stitchedUrlToRevoke);
      }
    };
  }, [
    sourceMode,
    selectedChapterId,
    chapters,
    audioMap,
    readyChapters,
    uploadedAudioBytes,
    uploadedAudioUrl,
    uploadedText,
    uploadedTitle,
  ]);

  // Continuous 60fps Canvas Render Loop when playing (zero setState inside useEffect!)
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;

    const tick = () => {
      const canvas = previewCanvasRef.current;
      const audio = previewAudioRef.current;
      if (canvas && audio) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          renderMotionFrame(
            ctx,
            canvasDims.width,
            canvasDims.height,
            audio.currentTime,
            totalDuration,
            cues,
            chapters
          );
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, totalDuration, cues, chapters, canvasDims]);

  // Draw static frame when paused or scrubbed (zero setState inside useEffect!)
  useEffect(() => {
    if (isPlaying) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    renderMotionFrame(
      ctx,
      canvasDims.width,
      canvasDims.height,
      currentTime,
      totalDuration,
      cues,
      chapters
    );
  }, [isPlaying, currentTime, totalDuration, cues, chapters, canvasDims]);

  const handleTogglePlay = () => {
    const audio = previewAudioRef.current;
    if (!audio || !activeAudioUrl) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (timeSec: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, timeSec));
    setCurrentTime(clamped);
    if (previewAudioRef.current) {
      previewAudioRef.current.currentTime = clamped;
    }
  };

  const handleNudgeCue = (cueIdx: number, deltaSec: number) => {
    setCues((prev) =>
      prev.map((c, idx) => {
        if (idx === cueIdx) {
          const nextStart = Math.max(0, Math.min(c.endSec - 0.3, c.startSec + deltaSec));
          return { ...c, startSec: nextStart };
        }
        if (idx === cueIdx - 1) {
          const nextEnd = Math.max(c.startSec + 0.3, c.endSec + deltaSec);
          return { ...c, endSec: nextEnd };
        }
        return c;
      })
    );
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExportError(null);

    const arr = await file.arrayBuffer();
    const url = URL.createObjectURL(file);
    if (uploadedAudioUrl) URL.revokeObjectURL(uploadedAudioUrl);

    setUploadedFileName(file.name);
    setUploadedAudioBytes(arr);
    setUploadedAudioUrl(url);
  };

  const handleExportVideo = async () => {
    if (!decodedBuffer || cues.length === 0) return;

    setExportError(null);
    setIsPlaying(false);
    previewAudioRef.current?.pause();

    if (exportedVideoUrl) {
      URL.revokeObjectURL(exportedVideoUrl);
      setExportedVideoUrl("");
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      await document.fonts.ready;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvasDims.width;
      exportCanvas.height = canvasDims.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) throw new Error("تعذر تهيئة محرك الرسم.");

      const audioCtx = new AudioContext();
      const sourceNode = audioCtx.createBufferSource();
      sourceNode.buffer = decodedBuffer;

      const destNode = audioCtx.createMediaStreamDestination();
      sourceNode.connect(destNode);

      const canvasStream = exportCanvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destNode.stream.getAudioTracks(),
      ]);

      const mimeCandidates = [
        { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
        { mime: "video/mp4", ext: "mp4" },
        { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
        { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
        { mime: "video/webm", ext: "webm" },
      ];

      const chosen =
        mimeCandidates.find((c) => MediaRecorder.isTypeSupported(c.mime)) || {
          mime: "",
          ext: "webm",
        };

      const recorder = chosen.mime
        ? new MediaRecorder(combinedStream, {
            mimeType: chosen.mime,
            videoBitsPerSecond: 4_500_000,
          })
        : new MediaRecorder(combinedStream);

      setExportedExt(chosen.ext);

      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const recordingDone = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, {
            type: chosen.mime || `video/${chosen.ext}`,
          });
          resolve(blob);
        };
        recorder.onerror = () => {
          reject(new Error("حدث خطأ أثناء تسجيل ملف الفيديو."));
        };
      });

      let cancelled = false;
      let rafId = 0;

      exportCancelRef.current = {
        cancel: () => {
          cancelled = true;
          cancelAnimationFrame(rafId);
          try {
            sourceNode.stop();
          } catch {
            // ignore
          }
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          void audioCtx.close();
          setIsExporting(false);
        },
      };

      const duration = decodedBuffer.duration;
      // Paint initial frame before starting recorder
      renderMotionFrame(
        ctx,
        canvasDims.width,
        canvasDims.height,
        0,
        duration,
        cues,
        chapters
      );

      recorder.start(250);
      const startCtxTime = audioCtx.currentTime;
      sourceNode.start(startCtxTime);

      const tick = () => {
        if (cancelled) return;
        const elapsed = audioCtx.currentTime - startCtxTime;
        const clamped = Math.min(duration, Math.max(0, elapsed));

        renderMotionFrame(
          ctx,
          canvasDims.width,
          canvasDims.height,
          clamped,
          duration,
          cues,
          chapters
        );

        setExportProgress(Math.min(99, Math.round((clamped / duration) * 100)));

        if (elapsed >= duration + 0.15) {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);

      const blob = await recordingDone;
      cancelAnimationFrame(rafId);
      await audioCtx.close();

      if (!cancelled) {
        const videoUrl = URL.createObjectURL(blob);
        setExportedVideoUrl(videoUrl);
        setExportProgress(100);
        setIsExporting(false);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "تعذر تصدير الفيديو حالياً.";
      setExportError(msg);
      setIsExporting(false);
    } finally {
      exportCancelRef.current = null;
    }
  };

  const selectedChapter = chapters.find((c) => c.id === selectedChapterId);
  const selectedChapterReady =
    selectedChapter && audioMap[selectedChapter.id]?.status === "ready";
  const selectedChapterGenerating =
    selectedChapter && audioMap[selectedChapter.id]?.status === "generating";

  const needsAudioGeneration =
    (sourceMode === "chapter" && !selectedChapterReady) ||
    (sourceMode === "full-lesson" && readyChapters.length === 0);

  const activeCueIndex = useMemo(() => {
    if (cues.length === 0) return -1;
    const found = cues.findIndex(
      (c) => currentTime >= c.startSec && currentTime <= c.endSec
    );
    return found >= 0 ? found : cues.length - 1;
  }, [cues, currentTime]);

  const activeCue = activeCueIndex >= 0 ? cues[activeCueIndex] : null;
  const activeSlideKey = activeCue
    ? `${activeCue.chapterId}-${activeCue.sceneType}`
    : "empty";

  return (
    <MotionConfig reducedMotion="user">
      <section id="motion-studio" className="space-y-6">
      <audio
        ref={previewAudioRef}
        src={activeAudioUrl || undefined}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(totalDuration);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Studio Top Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>تصميم كريمي وداكن مع تمييز برتقالي</span>
              <span aria-hidden="true">·</span>
              <span>مزامنة تلقائية للصوت والنص</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              استوديو توليد فيديو الموشن المتزامن
            </h2>
          </div>

          {/* Aspect Ratio Switch */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setAspectMode("9:16")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                aspectMode === "9:16"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              9:16 عمودي (ريلز)
            </button>
            <button
              type="button"
              onClick={() => setAspectMode("16:9")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                aspectMode === "16:9"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              16:9 أفقي (يوتيوب)
            </button>
          </div>
        </div>

        {/* Source Selector Row */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-5">
            <span className="block text-xs font-medium text-slate-600 mb-1.5">
              مصدر الصوت والنص
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSourceMode("chapter")}
                className={`px-2.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  sourceMode === "chapter"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                فصل محدد
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("full-lesson")}
                className={`px-2.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  sourceMode === "full-lesson"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                الدرس كامل ({readyChapters.length}/{chapters.length})
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("upload")}
                className={`px-2.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  sourceMode === "upload"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                رفع ملف صوتي
              </button>
            </div>
          </div>

          {sourceMode === "chapter" && (
            <div className="lg:col-span-4">
              <label
                htmlFor="motion-chapter-select"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                اختر الفصل المطلوب
              </label>
              <select
                id="motion-chapter-select"
                value={selectedChapterId}
                onChange={(e) => setSelectedChapterId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.indexLabel} · {ch.title}{" "}
                    {audioMap[ch.id]?.status === "ready" ? "(الصوت جاهز)" : "(يحتاج توليد)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceMode === "upload" && (
            <div className="lg:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                ملف الصوت (WAV / MP3 / M4A)
              </label>
              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer truncate">
                <Upload className="w-4 h-4 shrink-0 text-sky-600" />
                <span className="truncate">
                  {uploadedFileName || "اختر ملفًا صوتيًا من جهازك"}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleUploadFile}
                  className="sr-only"
                />
              </label>
            </div>
          )}

          <div className="lg:col-span-3 flex justify-end">
            {needsAudioGeneration ? (
              sourceMode === "chapter" && selectedChapter ? (
                <button
                  type="button"
                  disabled={Boolean(selectedChapterGenerating)}
                  onClick={() => onGenerateChapter(selectedChapter.id)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {selectedChapterGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جارٍ توليد الصوت...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>توليد الصوت والمزامنة</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBatchGenerating}
                  onClick={onBatchGenerate}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isBatchGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جارٍ توليد الفصول...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>توليد صوت الدرس بالكامل</span>
                    </>
                  )}
                </button>
              )
            ) : !isExporting ? (
              <button
                type="button"
                disabled={cues.length === 0 || isAnalyzing}
                onClick={handleExportVideo}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Film className="w-4 h-4" />
                <span>تصدير فيديو موشن بالصوت</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => exportCancelRef.current?.cancel()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5" />
                <span>إلغاء التصدير ({exportProgress}%)</span>
              </button>
            )}
          </div>
        </div>

        {/* Upload Custom Text Area when in Upload mode */}
        <AnimatePresence initial={false}>
          {sourceMode === "upload" && (
            <motion.div
              key="upload-panel"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div>
                <label
                  htmlFor="upload-title"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  عنوان الفيديو
                </label>
                <input
                  id="upload-title"
                  type="text"
                  value={uploadedTitle}
                  onChange={(e) => setUploadedTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="md:col-span-2">
                <label
                  htmlFor="upload-script"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  النص المراد مزامنته (كل سطر يظهر كمشهد وترجمة متزامنة)
                </label>
                <textarea
                  id="upload-script"
                  rows={4}
                  value={uploadedText}
                  onChange={(e) => setUploadedText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm leading-6 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Export Progress or Error */}
        <AnimatePresence>
          {isExporting && (
            <motion.div
              key="export-progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 p-4 rounded-xl bg-orange-50 border border-orange-200"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-orange-900 mb-2">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    جارٍ تصدير فيديو الموشن ومزامنته مع الصوت... (يرجى عدم إغلاق التبويب)
                  </span>
                </span>
                <span className="font-mono tabular-nums">{exportProgress}%</span>
              </div>
              <div className="w-full h-2 bg-orange-200/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-600 transition-all duration-150"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </motion.div>
          )}

          {exportError && (
            <motion.div
              key="export-error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{exportError}</span>
            </motion.div>
          )}

          {exportedVideoUrl && !isExporting && (
            <motion.div
              key="export-ready"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>تم تصدير فيديو الموشن المتزامن بنجاح!</span>
                </div>
                <a
                  href={exportedVideoUrl}
                  download={`motion-lesson-${aspectMode.replace(":", "x")}.${exportedExt}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل الفيديو (.{exportedExt})</span>
                </a>
              </div>
              <video
                src={exportedVideoUrl}
                controls
                className="w-full max-h-[380px] rounded-lg bg-slate-900 mx-auto"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Interactive Motion Preview + Synchronized Cue Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Live Canvas Preview Stage */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-5">
            <h3 className="text-base font-bold text-slate-900">
              معاينة الفيديو المتزامن
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {canvasDims.width} × {canvasDims.height} · 30fps
            </span>
          </div>

          {isAnalyzing ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-500 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
              <span className="text-sm font-medium">
                جارٍ تحليل موجة الصوت ومزامنة النصوص تلقائياً...
              </span>
            </div>
          ) : cues.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-slate-50 rounded-xl border border-dashed border-slate-300 px-6">
              <Film className="w-9 h-9 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">
                اختر فصلاً جاهزاً أو اضغط «توليد الصوت والمزامنة» بالاعلى
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                بمجرد توفر الصوت، سيقوم الاستوديو بمزامنة كل جملة ومشهد موشن تلقائياً مع نبضات الصوت لتتمكن من المعاينة وتصدير الفيديو.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Animated Slide Transition Indicator synced via motion/react */}
              <div className="min-h-[44px] flex items-center justify-between gap-3 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden">
                <AnimatePresence mode="wait">
                  {activeCue && (
                    <motion.div
                      key={activeSlideKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-center gap-2 text-xs font-semibold text-slate-800 truncate"
                    >
                      <span className="font-mono text-orange-700 tabular-nums">
                        {activeCue.chapterIndexLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{activeCue.chapterTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-500">
                        {activeCue.sceneType === "intro-cream" ||
                        activeCue.sceneType === "outro-cream"
                          ? "شريحة افتتاحية"
                          : activeCue.sceneType === "area-model"
                          ? "شريحة نموذج المستطيل"
                          : activeCue.sceneType === "numbered-steps"
                          ? "شريحة البطاقات المرقمة"
                          : activeCue.sceneType === "highlight-stat"
                          ? "شريحة بطاقة التركيز"
                          : "شريحة الخطوات"}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                  {activeCueIndex + 1} / {cues.length}
                </span>
              </div>

              {/* Animated Canvas Stage with Smooth Slide Transition Overlay */}
              <motion.div
                key={aspectMode}
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex justify-center bg-slate-900/95 rounded-xl p-4 overflow-hidden"
              >
                <canvas
                  ref={previewCanvasRef}
                  width={canvasDims.width}
                  height={canvasDims.height}
                  className={
                    aspectMode === "9:16"
                      ? "max-h-[540px] w-auto rounded-lg shadow-lg"
                      : "w-full h-auto max-h-[440px] rounded-lg shadow-lg"
                  }
                />

                {/* Smooth slide-change corner transition indicator */}
                <AnimatePresence mode="wait">
                  {activeCue && (
                    <motion.div
                      key={activeSlideKey}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className="pointer-events-none absolute top-6 right-6 px-3 py-1 rounded-md bg-slate-950/75 border border-orange-500/40 text-[11px] font-semibold text-orange-300 backdrop-blur-xs"
                    >
                      {activeCue.chapterIndexLabel} · {activeCue.chapterTitle}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Smooth Kinetic Caption Strip beneath Canvas */}
              <div className="min-h-[56px] px-4 py-3 rounded-xl bg-slate-900 text-slate-100 flex items-center justify-center text-center overflow-hidden">
                <AnimatePresence mode="wait">
                  {activeCue && (
                    <motion.p
                      key={activeCue.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="text-sm font-medium leading-relaxed"
                    >
                      {activeCue.text}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Preview Transport Bar */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  aria-label={isPlaying ? "إيقاف المعاينة" : "تشغيل المعاينة"}
                  className="w-10 h-10 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center shrink-0 cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 translate-x-[1px]" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-600 mb-1 tabular-nums">
                    <span>{formatDuration(currentTime)}</span>
                    <span>{formatDuration(totalDuration)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={totalDuration || 1}
                    step={0.05}
                    value={currentTime}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    aria-label="شريط معاينة فيديو الموشن"
                    className="w-full accent-orange-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Synchronized Cue Timeline Editor */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-orange-600" />
              <span>جدول المزامنة والمشاهد</span>
            </h3>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {cues.length} مقطع
            </span>
          </div>

          {cues.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              ستظهر مقاطع النص والتوقيتات الدقيقة هنا بعد تجهيز الصوت.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
              {cues.map((cue, idx) => {
                const isActive = idx === activeCueIndex;

                return (
                  <div
                    key={cue.id}
                    className="relative px-5 py-3.5 transition-colors hover:bg-slate-50/70"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-cue-highlight"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }}
                        className="absolute inset-0 bg-orange-50/80 pointer-events-none"
                      />
                    )}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                        <button
                          type="button"
                          onClick={() => handleSeek(cue.startSec + 0.02)}
                          className="font-mono font-semibold text-orange-700 hover:underline tabular-nums cursor-pointer"
                        >
                          {formatDuration(cue.startSec)} → {formatDuration(cue.endSec)}
                        </button>

                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-500">
                            {cue.sceneType === "intro-cream" ||
                            cue.sceneType === "outro-cream"
                              ? "كريمي افتتاحي"
                              : cue.sceneType === "area-model"
                              ? "نموذج المستطيل"
                              : cue.sceneType === "numbered-steps"
                              ? "بطاقات مرقمة"
                              : cue.sceneType === "highlight-stat"
                              ? "بطاقة تركيز"
                              : "قائمة خطوات"}
                          </span>
                          {idx > 0 && (
                            <div className="flex items-center gap-0.5 ms-2">
                              <button
                                type="button"
                                title="تقديم البداية 0.2 ثانية"
                                onClick={() => handleNudgeCue(idx, -0.2)}
                                className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                              >
                                -0.2s
                              </button>
                              <button
                                type="button"
                                title="تأخير البداية 0.2 ثانية"
                                onClick={() => handleNudgeCue(idx, 0.2)}
                                className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                              >
                                +0.2s
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSeek(cue.startSec + 0.02)}
                        className="w-full text-right text-sm text-slate-800 leading-relaxed cursor-pointer"
                      >
                        {cue.text}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </section>
    </MotionConfig>
  );
};
