import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import {
  VOICE_OPTIONS,
  LESSON_STYLE_PRESETS,
  INITIAL_LESSON_CHAPTERS,
  DEFAULT_CLONED_VOICE_PROFILE,
  SAMPLE_REFERENCE_SCRIPT,
  type VoiceCloneProfile,
} from "../data/lessonChapters";
import {
  base64ToUint8Array,
  ensureWavBytes,
  formatDuration,
  splitScriptIntoTtsChunks,
  stitchWavBuffers,
} from "../utils/wavUtils";
import {
  buildFallbackStoryboardFromScript,
  buildSynchronizedCuesFromStoryboard,
  detectSilenceValleys,
  type MotionCue,
  type MotionSceneType,
  type StoryboardScene,
} from "../utils/syncEngine";
import {
  renderMotionFrame,
  type BreadcrumbItem,
} from "../utils/motionCanvasRenderer";
import {
  Play,
  Pause,
  Download,
  Film,
  Volume2,
  Loader2,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
  Square,
  AlertCircle,
  Upload,
  FileText,
  Wand2,
  RefreshCw,
  Mic,
  AudioLines,
  RotateCcw,
} from "lucide-react";

type AspectMode = "9:16" | "16:9";
type PipelineStage =
  | "idle"
  | "storyboard"
  | "audio"
  | "syncing"
  | "rendering"
  | "done";

interface ScriptToVideoStudioProps {
  voiceName: string;
  onVoiceChange: (v: string) => void;
  stylePresetId: string;
  onStylePresetChange: (s: string) => void;
  clonedProfile: VoiceCloneProfile;
  onClonedProfileChange: (profile: VoiceCloneProfile) => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

const SAMPLE_GENERAL_SCRIPT = `هل تعلم أن ٨٠٪ من نجاح أي شرح تعليمي يعتمد على وضوح البداية؟
في هذا الفيديو السريع، هنتعرف على ٣ خطوات بسيطة تخلي رسالتك توصل فوراً.

أول خطوة: ابدأ بفكرة واحدة واضحة ومباشرة في أول خمس ثوانٍ.
تاني خطوة: قسّم الشرح لنقاط قصيرة بدل الجمل الطويلة المملة.
تالت خطوة: استخدم أمثلة حقيقية وأرقام ملموسة تثبت في ذهن المشاهد.

لما تطبق الخطوات دي في كل درس أو عرض تقديمي، هتلاحظ فرق كبير في تفاعل الجمهور.
ابدأ الآن بكتابة السكربت الخاص بك وشاهد التحول بنفسك!`;

const SAMPLE_MATH_SCRIPT = `${INITIAL_LESSON_CHAPTERS[0].text}\n\n${INITIAL_LESSON_CHAPTERS[1].text}`;

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.25];

const SCENE_TYPE_LABELS: Record<MotionSceneType, string> = {
  "intro-cream": "افتتاحية كريمي",
  "numbered-steps": "بطاقات مرقمة",
  checklist: "قائمة نقاط",
  "highlight-stat": "بطاقة تركيز / رقم",
  "area-model": "نموذج المستطيل",
  "outro-cream": "خاتمة كريمي",
};

export const ScriptToVideoStudio: React.FC<ScriptToVideoStudioProps> = ({
  voiceName,
  onVoiceChange,
  stylePresetId,
  onStylePresetChange,
  clonedProfile,
  onClonedProfileChange,
}) => {
  const [videoTitle, setVideoTitle] = useState<string>(
    "كتابة الأعداد وقراءتها والقيمة المكانية"
  );
  const [presenterName, setPresenterName] = useState<string>("الأستاذ عمرو شريف");
  const [scriptText, setScriptText] = useState<string>(SAMPLE_REFERENCE_SCRIPT);
  const [aspectMode, setAspectMode] = useState<AspectMode>("9:16");

  // Voice cloning state
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState<boolean>(false);
  const [voiceAnalyzeError, setVoiceAnalyzeError] = useState<string | null>(null);
  const [showStyleDetails, setShowStyleDetails] = useState<boolean>(false);
  const customRefAudioRef = useRef<{
    base64: string;
    mimeType: string;
    fileName: string;
    objectUrl: string;
  } | null>(null);

  // Pipeline state
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("idle");
  const [stageDetail, setStageDetail] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number>(0);

  // Generated outputs
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [cues, setCues] = useState<MotionCue[]>([]);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [audioFileName, setAudioFileName] = useState<string>("script-audio.wav");
  const [decodedBuffer, setDecodedBuffer] = useState<AudioBuffer | null>(null);
  const [totalDuration, setTotalDuration] = useState<number>(0);

  // Video output
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string>("");
  const [exportedExt, setExportedExt] = useState<string>("webm");

  // Preview Playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cancelRef = useRef<{ cancelled: boolean; stopRender?: () => void }>({
    cancelled: false,
  });

  const canvasDims = useMemo(() => {
    return aspectMode === "9:16"
      ? { width: 720, height: 1280 }
      : { width: 1280, height: 720 };
  }, [aspectMode]);

  const breadcrumbs: BreadcrumbItem[] = useMemo(() => {
    return scenes.map((s) => ({ id: s.id, title: s.title }));
  }, [scenes]);

  const wordCount = useMemo(
    () => scriptText.trim().split(/\s+/).filter(Boolean).length,
    [scriptText]
  );

  const ttsChunksCount = useMemo(
    () => splitScriptIntoTtsChunks(scriptText, 3500).length,
    [scriptText]
  );

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (exportedVideoUrl) URL.revokeObjectURL(exportedVideoUrl);
    };
  }, [exportedVideoUrl]);

  useEffect(() => {
    return () => {
      if (customRefAudioRef.current?.objectUrl) {
        URL.revokeObjectURL(customRefAudioRef.current.objectUrl);
      }
    };
  }, []);

  const analyzeReferenceOnServer = useCallback(
    async (payload: {
      audioBase64?: string;
      mimeType?: string;
      useDefaultReference?: boolean;
      sourceLabel: string;
      sourceAudioUrl: string;
    }) => {
      setIsAnalyzingVoice(true);
      setVoiceAnalyzeError(null);
      try {
        const res = await fetch("/api/voice/analyze-reference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: payload.audioBase64,
            mimeType: payload.mimeType,
            useDefaultReference: payload.useDefaultReference,
          }),
        });

        const data = (await res.json()) as {
          matchedVoice?: string;
          stylePrompt?: string;
          arabicSummary?: string;
          emotionTags?: string[];
          pacingNote?: string;
          transcript?: string;
          error?: string;
        };

        if (!res.ok || !data.stylePrompt) {
          throw new Error(data.error || "تعذر تحليل النبرة والمشاعر من التسجيل.");
        }

        const nextVoice = data.matchedVoice || "Charon";
        onClonedProfileChange({
          sourceLabel: payload.sourceLabel,
          sourceAudioUrl: payload.sourceAudioUrl,
          matchedVoice: nextVoice,
          stylePrompt: data.stylePrompt,
          arabicSummary: data.arabicSummary || "",
          emotionTags: data.emotionTags || [],
          pacingNote: data.pacingNote || "",
          transcript: data.transcript || "",
        });
        onVoiceChange(nextVoice);
        onStylePresetChange("cloned");
      } catch (err: unknown) {
        setVoiceAnalyzeError(
          err instanceof Error
            ? err.message
            : "تعذر تحليل التسجيل المرجعي حالياً."
        );
      } finally {
        setIsAnalyzingVoice(false);
      }
    },
    [onClonedProfileChange, onStylePresetChange, onVoiceChange]
  );

  const handleUploadReferenceAudio = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setVoiceAnalyzeError(
        "حجم التسجيل المرجعي كبير جداً (الحد الأقصى 10 ميجابايت). يرجى اختيار مقطع أقصر."
      );
      return;
    }

    try {
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const mimeType = file.type || "audio/mp3";
      const objectUrl = URL.createObjectURL(file);

      if (customRefAudioRef.current?.objectUrl) {
        URL.revokeObjectURL(customRefAudioRef.current.objectUrl);
      }
      customRefAudioRef.current = {
        base64,
        mimeType,
        fileName: file.name,
        objectUrl,
      };

      await analyzeReferenceOnServer({
        audioBase64: base64,
        mimeType,
        sourceLabel: `تسجيل مرجعي مرفوع — ${file.name}`,
        sourceAudioUrl: objectUrl,
      });
    } catch {
      setVoiceAnalyzeError("تعذر قراءة ملف الصوت المرجعي.");
    }
  };

  const handleReanalyzeReference = async () => {
    const custom = customRefAudioRef.current;
    if (custom) {
      await analyzeReferenceOnServer({
        audioBase64: custom.base64,
        mimeType: custom.mimeType,
        sourceLabel: `تسجيل مرجعي مرفوع — ${custom.fileName}`,
        sourceAudioUrl: custom.objectUrl,
      });
    } else {
      await analyzeReferenceOnServer({
        useDefaultReference: true,
        sourceLabel: DEFAULT_CLONED_VOICE_PROFILE.sourceLabel,
        sourceAudioUrl: DEFAULT_CLONED_VOICE_PROFILE.sourceAudioUrl,
      });
    }
  };

  const handleResetDefaultReference = () => {
    if (customRefAudioRef.current?.objectUrl) {
      URL.revokeObjectURL(customRefAudioRef.current.objectUrl);
      customRefAudioRef.current = null;
    }
    setVoiceAnalyzeError(null);
    onClonedProfileChange(DEFAULT_CLONED_VOICE_PROFILE);
    onVoiceChange(DEFAULT_CLONED_VOICE_PROFILE.matchedVoice);
    onStylePresetChange("cloned");
  };

  // Live 60fps Canvas Preview when playing
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;

    const tick = () => {
      const canvas = previewCanvasRef.current;
      const audio = audioRef.current;
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
            breadcrumbs
          );
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, totalDuration, cues, breadcrumbs, canvasDims]);

  // Static frame when paused or scrubbed
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
      breadcrumbs
    );
  }, [isPlaying, currentTime, totalDuration, cues, breadcrumbs, canvasDims]);

  const handleCancelAll = () => {
    cancelRef.current.cancelled = true;
    cancelRef.current.stopRender?.();
    setPipelineStage("idle");
    setStageDetail("");
  };

  const generateStoryboard = useCallback(
    async (script: string, title: string, presenter: string): Promise<StoryboardScene[]> => {
      try {
        const res = await fetch("/api/script/storyboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script, title, presenter }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            scenes?: Array<Partial<StoryboardScene>>;
          };
          if (Array.isArray(data.scenes) && data.scenes.length > 0) {
            const arabicIdx = ["٠١", "٠٢", "٠٣", "٠٤", "٠٥", "٠٦", "٠٧", "٠٨"];
            const previewTags = data.scenes
              .slice(0, 3)
              .map((s, i) => `${arabicIdx[i] || i + 1} ${(s.title || "").slice(0, 14)}`);

            const validSceneTypes = new Set<MotionSceneType>([
              "intro-cream",
              "numbered-steps",
              "checklist",
              "highlight-stat",
              "area-model",
              "outro-cream",
            ]);

            return data.scenes.map((s, idx) => {
              const st = validSceneTypes.has(s.sceneType as MotionSceneType)
                ? (s.sceneType as MotionSceneType)
                : idx === 0
                ? "intro-cream"
                : idx === data.scenes!.length - 1
                ? "outro-cream"
                : "checklist";

              return {
                id: `scene-${idx + 1}`,
                indexLabel: arabicIdx[idx] || String(idx + 1).padStart(2, "0"),
                title: s.title || `مشهد ${idx + 1}`,
                sceneType: st,
                headlinePrefix: s.headlinePrefix || "",
                headlineHighlight: s.headlineHighlight || s.title || title,
                headlineSuffix: s.headlineSuffix || "",
                badgeText:
                  s.badgeText ||
                  (presenter ? `${presenter} · ${title}` : title),
                spokenLines:
                  Array.isArray(s.spokenLines) && s.spokenLines.length > 0
                    ? s.spokenLines
                    : [s.title || ""],
                cards: s.cards,
                checklistItems: s.checklistItems,
                statValue: s.statValue,
                statLabel: s.statLabel,
                previewTags,
              };
            });
          }
        }
      } catch {
        // Fallback smoothly below
      }
      return buildFallbackStoryboardFromScript(script, title, presenter);
    },
    []
  );

  const renderVideoFromAudioAndCues = useCallback(
    async (
      audioBuf: AudioBuffer,
      cuesToRender: MotionCue[],
      breadcrumbsToRender: BreadcrumbItem[],
      dims: { width: number; height: number }
    ): Promise<boolean> => {
      setPipelineStage("rendering");
      setStageDetail("جارٍ دمج الصوت ورسم فيديو الموشن جرافيك (30fps)...");
      setExportProgress(0);

      await document.fonts.ready;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = dims.width;
      exportCanvas.height = dims.height;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) throw new Error("تعذر تهيئة محرك الرسم.");

      const audioCtx = new AudioContext();
      const sourceNode = audioCtx.createBufferSource();
      sourceNode.buffer = audioBuf;

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
            audioBitsPerSecond: 128_000,
          })
        : new MediaRecorder(combinedStream);

      setExportedExt(chosen.ext);

      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const recordingDone = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          resolve(
            new Blob(chunks, {
              type: chosen.mime || `video/${chosen.ext}`,
            })
          );
        };
        recorder.onerror = () => {
          reject(new Error("حدث خطأ أثناء تسجيل ملف الفيديو."));
        };
      });

      let rafId = 0;
      let stopped = false;

      cancelRef.current.stopRender = () => {
        stopped = true;
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
      };

      const dur = audioBuf.duration;
      renderMotionFrame(
        ctx,
        dims.width,
        dims.height,
        0,
        dur,
        cuesToRender,
        breadcrumbsToRender
      );

      recorder.start(250);
      const startCtxTime = audioCtx.currentTime;
      sourceNode.start(startCtxTime);

      const tick = () => {
        if (stopped || cancelRef.current.cancelled) return;
        const elapsed = audioCtx.currentTime - startCtxTime;
        const clamped = Math.min(dur, Math.max(0, elapsed));

        renderMotionFrame(
          ctx,
          dims.width,
          dims.height,
          clamped,
          dur,
          cuesToRender,
          breadcrumbsToRender
        );

        setExportProgress(Math.min(99, Math.round((clamped / dur) * 100)));

        if (elapsed >= dur + 0.15) {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);

      const videoBlob = await recordingDone;
      cancelAnimationFrame(rafId);
      await audioCtx.close();
      cancelRef.current.stopRender = undefined;

      if (cancelRef.current.cancelled || stopped) {
        return false;
      }

      const nextVideoUrl = URL.createObjectURL(videoBlob);
      setExportedVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextVideoUrl;
      });
      setExportProgress(100);
      setPipelineStage("done");
      setStageDetail("تم توليد الملف الصوتي وفيديو الموشن جرافيك بالكامل!");
      return true;
    },
    []
  );

  const runFullPipeline = async (autoExportVideo: boolean) => {
    const cleanScript = scriptText.trim();
    if (!cleanScript) {
      setErrorMsg("يرجى كتابة أو لصق السكربت أولاً.");
      return;
    }

    cancelRef.current.cancelled = false;
    setErrorMsg(null);
    setIsPlaying(false);
    audioRef.current?.pause();
    setCurrentTime(0);

    try {
      // Step 1: Build Storyboard from Script
      setPipelineStage("storyboard");
      setStageDetail("جارٍ تحليل السكربت وتقسيمه إلى مشاهد موشن جرافيك...");
      const builtScenes = await generateStoryboard(
        cleanScript,
        videoTitle.trim() || "فيديو موشن جرافيك",
        presenterName.trim()
      );
      if (cancelRef.current.cancelled) return;
      setScenes(builtScenes);

      // Step 2: Generate Audio (chunked automatically if > 3500 chars)
      setPipelineStage("audio");
      const ttsChunks = splitScriptIntoTtsChunks(cleanScript, 3500);
      const isClonedStyle = stylePresetId === "cloned";
      const stylePrompt = isClonedStyle
        ? clonedProfile.stylePrompt
        : LESSON_STYLE_PRESETS.find((p) => p.id === stylePresetId)?.prompt ||
          LESSON_STYLE_PRESETS[0].prompt;

      const wavBuffers: Uint8Array[] = [];
      for (let i = 0; i < ttsChunks.length; i++) {
        if (cancelRef.current.cancelled) return;
        setStageDetail(
          ttsChunks.length > 1
            ? `جارٍ قراءة السكربت بالنبرة المنسوخة (الجزء ${i + 1} من ${ttsChunks.length})...`
            : isClonedStyle
            ? "جارٍ قراءة السكربت بنبرة الصوت والمشاعر المنسوخة..."
            : "جارٍ تحويل السكربت إلى ملف صوتي عالي الجودة..."
        );

        const res = await fetch("/api/tts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: ttsChunks[i],
            voiceName,
            style: stylePrompt,
            useVoiceDesign: isClonedStyle,
          }),
        });

        const data = (await res.json()) as {
          audioBase64?: string;
          error?: string;
        };

        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || "تعذر تحويل السكربت إلى صوت.");
        }

        const rawBytes = base64ToUint8Array(data.audioBase64);
        wavBuffers.push(ensureWavBytes(rawBytes));
      }

      if (cancelRef.current.cancelled) return;

      const finalWavBlob =
        wavBuffers.length === 1
          ? new Blob([wavBuffers[0].buffer as ArrayBuffer], { type: "audio/wav" })
          : stitchWavBuffers(wavBuffers);

      const nextAudioUrl = URL.createObjectURL(finalWavBlob);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextAudioUrl;
      });
      setAudioFileName(
        `${(videoTitle.trim() || "script-audio").replace(/[^\w\u0600-\u06FF-]+/g, "-")}.wav`
      );

      // Step 3: Decode Audio, detect silence valleys & sync cues
      setPipelineStage("syncing");
      setStageDetail("جارٍ تحليل الموجة الصوتية ومزامنة النصوص والمشاهد...");

      const ctx = new AudioContext();
      const arrBuf = await finalWavBlob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrBuf);
      await ctx.close();

      if (cancelRef.current.cancelled) return;

      const valleys = detectSilenceValleys(audioBuf);
      const builtCues = buildSynchronizedCuesFromStoryboard(
        builtScenes,
        audioBuf.duration,
        valleys
      );
      const builtBreadcrumbs: BreadcrumbItem[] = builtScenes.map((s) => ({
        id: s.id,
        title: s.title,
      }));

      setDecodedBuffer(audioBuf);
      setTotalDuration(audioBuf.duration);
      setCues(builtCues);

      if (!autoExportVideo) {
        setPipelineStage("done");
        setStageDetail("تم توليد الملف الصوتي ومزامنة مشاهد الموشن بنجاح!");
        return;
      }

      // Step 4: Render Full Motion Graphics Video automatically
      await renderVideoFromAudioAndCues(
        audioBuf,
        builtCues,
        builtBreadcrumbs,
        canvasDims
      );
    } catch (err: unknown) {
      if (cancelRef.current.cancelled) return;
      const msg =
        err instanceof Error
          ? err.message
          : "حدث خطأ غير متوقع أثناء المعالجة.";
      setErrorMsg(msg);
      setPipelineStage("idle");
      setStageDetail("");
    }
  };

  const handleUploadExternalAudio = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cleanScript = scriptText.trim();
    if (!cleanScript) {
      setErrorMsg("يرجى كتابة السكربت في المربع أولاً قبل رفع الصوت.");
      return;
    }

    cancelRef.current.cancelled = false;
    setErrorMsg(null);
    setIsPlaying(false);
    audioRef.current?.pause();
    setCurrentTime(0);

    try {
      setPipelineStage("storyboard");
      setStageDetail("جارٍ تقسيم السكربت إلى مشاهد لمزامنتها مع الملف الصوتي...");
      const builtScenes = await generateStoryboard(
        cleanScript,
        videoTitle.trim() || "فيديو موشن جرافيك",
        presenterName.trim()
      );
      setScenes(builtScenes);

      setPipelineStage("syncing");
      setStageDetail("جارٍ قراءة الملف الصوتي ومزامنة المشاهد...");

      const arr = await file.arrayBuffer();
      const ctx = new AudioContext();
      const audioBuf = await ctx.decodeAudioData(arr.slice(0));
      await ctx.close();

      const url = URL.createObjectURL(file);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setAudioFileName(file.name);

      const valleys = detectSilenceValleys(audioBuf);
      const builtCues = buildSynchronizedCuesFromStoryboard(
        builtScenes,
        audioBuf.duration,
        valleys
      );

      setDecodedBuffer(audioBuf);
      setTotalDuration(audioBuf.duration);
      setCues(builtCues);
      setPipelineStage("done");
      setStageDetail("تم ربط الملف الصوتي بالسكربت! يمكنك المعاينة أو تصدير الفيديو.");
    } catch {
      setErrorMsg("تعذر قراءة الملف الصوتي المرفوع. تأكد من أنه ملف صوتي صالح.");
      setPipelineStage("idle");
      setStageDetail("");
    }
  };

  const handleExportVideoOnly = async () => {
    if (!decodedBuffer || cues.length === 0) return;
    cancelRef.current.cancelled = false;
    setErrorMsg(null);
    setIsPlaying(false);
    audioRef.current?.pause();

    try {
      await renderVideoFromAudioAndCues(
        decodedBuffer,
        cues,
        breadcrumbs,
        canvasDims
      );
    } catch (err: unknown) {
      if (cancelRef.current.cancelled) return;
      setErrorMsg(
        err instanceof Error ? err.message : "تعذر تصدير الفيديو حالياً."
      );
      setPipelineStage("idle");
    }
  };

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  };

  const handleSeek = (t: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    setCurrentTime(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
  };

  const handleNudgeCue = (cueIdx: number, deltaSec: number) => {
    setCues((prev) =>
      prev.map((c, idx) => {
        if (idx === cueIdx) {
          const nextStart = Math.max(
            0,
            Math.min(c.endSec - 0.3, c.startSec + deltaSec)
          );
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

  const handleChangeCueSceneType = (
    chapterId: string,
    nextType: MotionSceneType
  ) => {
    setScenes((prev) =>
      prev.map((s) => (s.id === chapterId ? { ...s, sceneType: nextType } : s))
    );
    setCues((prev) =>
      prev.map((c) =>
        c.chapterId === chapterId ? { ...c, sceneType: nextType } : c
      )
    );
  };

  const handleChangeCueText = (cueId: string, nextText: string) => {
    setCues((prev) =>
      prev.map((c) => (c.id === cueId ? { ...c, text: nextText } : c))
    );
  };

  const isBusy =
    pipelineStage === "storyboard" ||
    pipelineStage === "audio" ||
    pipelineStage === "syncing" ||
    pipelineStage === "rendering";

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
      <section id="script-studio" className="space-y-6">
        <audio
          ref={audioRef}
          src={audioUrl || undefined}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(totalDuration);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />

        {/* Step 1: Script Input + Settings */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-orange-700">
                <Wand2 className="w-3.5 h-3.5" />
                <span>السكربت ← الملف الصوتي (WAV) ← فيديو الموشن جرافيك الكامل</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                أضف السكربت ليخرج الصوت وفيديو الموشن جرافيك تلقائياً
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setVideoTitle("كتابة الأعداد وقراءتها والقيمة المكانية");
                  setPresenterName("الأستاذ عمرو شريف");
                  setScriptText(SAMPLE_REFERENCE_SCRIPT);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                مثال: نص التسجيل المرفق
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setVideoTitle("٣ خطوات لنجاح أي شرح تعليمي");
                  setPresenterName("الأستاذ عمرو شريف");
                  setScriptText(SAMPLE_GENERAL_SCRIPT);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                مثال: سكربت تعريفي
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setVideoTitle("القسمة بنموذج مساحة المستطيل");
                  setPresenterName("الأستاذ عمرو شريف");
                  setScriptText(SAMPLE_MATH_SCRIPT);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                مثال: درس الرياضيات
              </button>
            </div>
          </div>

          {/* Reference Voice & Emotion Cloning Panel */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <AudioLines className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      نسخ نبرة الصوت والمشاعر وأسلوب الإلقاء
                    </h3>
                    {stylePresetId === "cloned" ? (
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-md">
                        مفعّل في قراءة النص
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onVoiceChange(clonedProfile.matchedVoice);
                          onStylePresetChange("cloned");
                        }}
                        className="px-2 py-0.5 text-[11px] font-semibold bg-sky-600 text-white hover:bg-sky-700 rounded-md cursor-pointer"
                      >
                        تفعيل النبرة المنسوخة
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {clonedProfile.sourceLabel}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                  <Mic className="w-3.5 h-3.5 text-sky-600" />
                  <span>رفع تسجيل مرجعي آخر</span>
                  <input
                    type="file"
                    accept="audio/*"
                    disabled={isBusy || isAnalyzingVoice}
                    onChange={(e) => void handleUploadReferenceAudio(e)}
                    className="sr-only"
                  />
                </label>

                <button
                  type="button"
                  disabled={isBusy || isAnalyzingVoice}
                  onClick={() => void handleReanalyzeReference()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-900 bg-sky-100 hover:bg-sky-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {isAnalyzingVoice ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isAnalyzingVoice ? "جارٍ تحليل النبرة..." : "إعادة تحليل النبرة بالذكاء الاصطناعي"}
                  </span>
                </button>

                {clonedProfile.sourceAudioUrl !==
                  DEFAULT_CLONED_VOICE_PROFILE.sourceAudioUrl && (
                  <button
                    type="button"
                    disabled={isBusy || isAnalyzingVoice}
                    onClick={handleResetDefaultReference}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>الرجوع للتسجيل المرفق</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              <div className="lg:col-span-5 bg-white border border-sky-200/80 rounded-lg p-2.5">
                <div className="text-[11px] font-medium text-slate-500 mb-1">
                  استمع للتسجيل المرجعي الأصلي:
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={clonedProfile.sourceAudioUrl}
                  className="w-full h-9"
                />
              </div>

              <div className="lg:col-span-7 space-y-2">
                <p className="text-xs leading-relaxed text-slate-700">
                  {clonedProfile.arabicSummary}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {clonedProfile.emotionTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[11px] font-medium bg-white border border-sky-200 text-sky-900 rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                  {clonedProfile.pacingNote && (
                    <span className="text-[11px] text-slate-500 mr-1">
                      · {clonedProfile.pacingNote}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-sky-200/70">
              <div className="flex flex-wrap items-center gap-2">
                {clonedProfile.transcript && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setScriptText(clonedProfile.transcript)}
                    className="text-xs font-semibold text-sky-800 hover:underline cursor-pointer"
                  >
                    وضع نص هذا التسجيل داخل مربع السكربت
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowStyleDetails((v) => !v)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                {showStyleDetails
                  ? "إخفاء توجيهات الأسلوب الصوتي"
                  : "تخصيص توجيهات النبرة والمشاعر"}
              </button>
            </div>

            {showStyleDetails && (
              <div className="pt-2 space-y-1.5">
                <label
                  htmlFor="cloned-style-prompt"
                  className="block text-[11px] font-semibold text-slate-700"
                >
                  وصف النبرة والمشاعر المُرسل لنموذج تصميم الصوت (Gemini Voice Design):
                </label>
                <textarea
                  id="cloned-style-prompt"
                  rows={3}
                  value={clonedProfile.stylePrompt}
                  disabled={isBusy}
                  onChange={(e) =>
                    onClonedProfileChange({
                      ...clonedProfile,
                      stylePrompt: e.target.value,
                    })
                  }
                  dir="ltr"
                  className="w-full rounded-lg border border-sky-200 bg-white p-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            )}

            {voiceAnalyzeError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{voiceAnalyzeError}</span>
              </div>
            )}
          </div>

          {/* Metadata & Config Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="video-title-input"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                عنوان الفيديو / الموضوع
              </label>
              <input
                id="video-title-input"
                type="text"
                value={videoTitle}
                disabled={isBusy}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="مثال: شرح درس القسمة"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label
                htmlFor="presenter-input"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                اسم المقدم أو القناة (اختياري)
              </label>
              <input
                id="presenter-input"
                type="text"
                value={presenterName}
                disabled={isBusy}
                onChange={(e) => setPresenterName(e.target.value)}
                placeholder="مثال: الأستاذ عمرو شريف"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label
                htmlFor="studio-voice"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                نبرة الصوت
              </label>
              <select
                id="studio-voice"
                value={voiceName}
                disabled={isBusy}
                onChange={(e) => onVoiceChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="studio-style"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                أسلوب الإلقاء
              </label>
              <select
                id="studio-style"
                value={stylePresetId}
                disabled={isBusy}
                onChange={(e) => onStylePresetChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {LESSON_STYLE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Script Textarea */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="full-script-textarea"
                className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-sky-600" />
                <span>السكربت الكامل (افصل بين المشاهد بسطر فارغ أو اكتب النص مباشرة)</span>
              </label>
              <div className="flex items-center gap-3 text-xs font-mono text-slate-500 tabular-nums">
                <span>{wordCount} كلمة</span>
                <span aria-hidden="true">·</span>
                <span>{scriptText.length} حرف</span>
                {ttsChunksCount > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-sky-700">
                      سيُدمج تلقائياً من {ttsChunksCount} مقاطع صوتية
                    </span>
                  </>
                )}
              </div>
            </div>
            <textarea
              id="full-script-textarea"
              rows={8}
              value={scriptText}
              disabled={isBusy}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="اكتب أو الصق السكربت الكامل هنا... سيتم تحويله إلى ملف صوتي ثم تقسيمه ومزامنته مع فيديو موشن جرافيك بالكامل."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-4 text-base leading-8 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
            />
          </div>

          {/* Action Bar: Aspect Ratio + Primary/Secondary CTAs */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setAspectMode("9:16")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    aspectMode === "9:16"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  9:16 عمودي (ريلز / شورتس)
                </button>
                <button
                  type="button"
                  disabled={isBusy}
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

              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-sky-600" />
                <span>أو ارفع صوتاً جاهزاً للسكربت</span>
                <input
                  type="file"
                  accept="audio/*"
                  disabled={isBusy}
                  onChange={handleUploadExternalAudio}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {!isBusy ? (
                <>
                  <button
                    type="button"
                    disabled={!scriptText.trim()}
                    onClick={() => void runFullPipeline(false)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-sky-900 bg-sky-50 border border-sky-200 hover:bg-sky-100 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>توليد الملف الصوتي فقط (WAV)</span>
                  </button>

                  <button
                    type="button"
                    disabled={!scriptText.trim()}
                    onClick={() => void runFullPipeline(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>توليد الصوت وفيديو الموشن بالكامل</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleCancelAll}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>إيقاف العملية</span>
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Pipeline Progress Bar */}
          <AnimatePresence>
            {isBusy && (
              <motion.div
                key="pipeline-progress"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="p-4 rounded-xl bg-orange-50 border border-orange-200 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-orange-950">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                    <span>{stageDetail}</span>
                  </span>
                  {pipelineStage === "rendering" && (
                    <span className="font-mono tabular-nums">{exportProgress}%</span>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px] font-medium">
                  {[
                    { id: "storyboard", label: "١. تقسيم المشاهد" },
                    { id: "audio", label: "٢. توليد الصوت" },
                    { id: "syncing", label: "٣. مزامنة الموجة" },
                    { id: "rendering", label: "٤. تصدير الفيديو" },
                  ].map((step, idx) => {
                    const order = ["storyboard", "audio", "syncing", "rendering"];
                    const curIdx = order.indexOf(pipelineStage);
                    const done = idx < curIdx;
                    const active = idx === curIdx;
                    return (
                      <div
                        key={step.id}
                        className={`px-2.5 py-1.5 rounded-md text-center border ${
                          active
                            ? "bg-orange-600 text-white border-orange-600 font-bold"
                            : done
                            ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                            : "bg-white/70 text-slate-500 border-orange-200/70"
                        }`}
                      >
                        {step.label}
                      </div>
                    );
                  })}
                </div>

                {pipelineStage === "rendering" && (
                  <div className="w-full h-2 bg-orange-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-600 transition-all duration-150"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                )}
              </motion.div>
            )}

            {errorMsg && (
              <motion.div
                key="pipeline-error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Outputs Row: Audio File + Exported Motion Video */}
        {(audioUrl || exportedVideoUrl) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Generated Audio File Card */}
            {audioUrl && (
              <div
                className={`${
                  exportedVideoUrl ? "lg:col-span-5" : "lg:col-span-12"
                } bg-white border border-slate-200 rounded-xl p-6 space-y-4`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <span className="text-xs font-semibold text-sky-700">
                      المخرج الأول · الصوت الناتج من السكربت
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">
                      الملف الصوتي الكامل ({formatDuration(totalDuration)})
                    </h3>
                  </div>
                  <a
                    href={audioUrl}
                    download={audioFileName}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل الصوت (WAV)</span>
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل الصوت"}
                    className="w-11 h-11 rounded-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 translate-x-[1px]" />
                    )}
                  </button>

                  <div className="flex-1 min-w-[160px]">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-600 mb-1.5 tabular-nums">
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
                      aria-label="شريط تشغيل الصوت الناتج"
                      className="w-full accent-sky-600 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg">
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
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

                {!exportedVideoUrl && !isBusy && decodedBuffer && (
                  <button
                    type="button"
                    onClick={() => void handleExportVideoOnly()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <Film className="w-4 h-4" />
                    <span>توليد وتصدير فيديو الموشن جرافيك الآن</span>
                  </button>
                )}
              </div>
            )}

            {/* Generated Motion Video Card */}
            {exportedVideoUrl && (
              <div className="lg:col-span-7 bg-emerald-50/70 border border-emerald-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-base font-bold text-emerald-950">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>فيديو الموشن جرافيك الكامل جاهز!</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleExportVideoOnly()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>إعادة التصدير</span>
                    </button>
                    <a
                      href={exportedVideoUrl}
                      download={`${(videoTitle.trim() || "motion-video").replace(
                        /[^\w\u0600-\u06FF-]+/g,
                        "-"
                      )}-${aspectMode.replace(":", "x")}.${exportedExt}`}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>تحميل الفيديو (.{exportedExt})</span>
                    </a>
                  </div>
                </div>

                <video
                  src={exportedVideoUrl}
                  controls
                  className="w-full max-h-[420px] rounded-lg bg-slate-900 mx-auto"
                />
              </div>
            )}
          </div>
        )}

        {/* Interactive Motion Preview + Cue/Scene Timeline Editor */}
        {cues.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Live Canvas Preview Stage */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-5">
                <h3 className="text-base font-bold text-slate-900">
                  معاينة الموشن جرافيك المتزامن
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {canvasDims.width} × {canvasDims.height} · 30fps
                  </span>
                  {!isBusy && decodedBuffer && (
                    <button
                      type="button"
                      onClick={() => void handleExportVideoOnly()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>تصدير الفيديو</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="min-h-[44px] flex items-center justify-between gap-3 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden">
                  <AnimatePresence mode="wait">
                    {activeCue && (
                      <motion.div
                        key={activeSlideKey}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center gap-2 text-xs font-semibold text-slate-800 truncate"
                      >
                        <span className="font-mono text-orange-700 tabular-nums">
                          {activeCue.chapterIndexLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{activeCue.chapterTitle}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500">
                          {SCENE_TYPE_LABELS[activeCue.sceneType]}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                    {activeCueIndex + 1} / {cues.length}
                  </span>
                </div>

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
                </motion.div>

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
            </div>

            {/* Synchronized Scene & Cue Editor */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-orange-600" />
                  <span>جدول المشاهد والمزامنة</span>
                </h3>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {scenes.length} مشاهد · {cues.length} جملة
                </span>
              </div>

              <div className="divide-y divide-slate-200 max-h-[680px] overflow-y-auto">
                {cues.map((cue, idx) => {
                  const isActive = idx === activeCueIndex;
                  const isFirstOfScene =
                    idx === 0 || cues[idx - 1].chapterId !== cue.chapterId;

                  return (
                    <div
                      key={cue.id}
                      className="relative px-5 py-3.5 transition-colors hover:bg-slate-50/70 space-y-2"
                    >
                      {isActive && (
                        <motion.div
                          layoutId="script-studio-active-cue"
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 34,
                          }}
                          className="absolute inset-0 bg-orange-50/80 pointer-events-none"
                        />
                      )}

                      <div className="relative z-10 space-y-2">
                        {isFirstOfScene && (
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/70">
                            <span className="text-xs font-bold text-slate-800">
                              {cue.chapterIndexLabel} · {cue.chapterTitle}
                            </span>
                            <select
                              value={cue.sceneType}
                              onChange={(e) =>
                                handleChangeCueSceneType(
                                  cue.chapterId,
                                  e.target.value as MotionSceneType
                                )
                              }
                              aria-label="نوع شريحة المشهد"
                              className="text-[11px] rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700"
                            >
                              <option value="intro-cream">افتتاحية كريمي</option>
                              <option value="numbered-steps">بطاقات مرقمة</option>
                              <option value="checklist">قائمة نقاط</option>
                              <option value="highlight-stat">بطاقة تركيز</option>
                              <option value="outro-cream">خاتمة كريمي</option>
                            </select>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <button
                            type="button"
                            onClick={() => handleSeek(cue.startSec + 0.02)}
                            className="font-mono font-semibold text-orange-700 hover:underline tabular-nums cursor-pointer"
                          >
                            {formatDuration(cue.startSec)} → {formatDuration(cue.endSec)}
                          </button>

                          {idx > 0 && (
                            <div className="flex items-center gap-1">
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

                        <input
                          type="text"
                          value={cue.text}
                          onChange={(e) =>
                            handleChangeCueText(cue.id, e.target.value)
                          }
                          aria-label={`نص الجملة ${idx + 1}`}
                          className="w-full rounded-md border border-slate-200 bg-white/80 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </MotionConfig>
  );
};
