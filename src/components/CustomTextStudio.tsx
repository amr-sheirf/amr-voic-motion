import React, { useState, useRef, useEffect } from "react";
import { VOICE_OPTIONS, LESSON_STYLE_PRESETS } from "../data/lessonChapters";
import {
  base64ToUint8Array,
  getWavDurationSeconds,
  formatDuration,
} from "../utils/wavUtils";
import {
  Volume2,
  Loader2,
  Play,
  Pause,
  Download,
  AlertCircle,
  Trash2,
} from "lucide-react";

interface CustomTextStudioProps {
  defaultVoice: string;
  defaultStyleId: string;
}

export const CustomTextStudio: React.FC<CustomTextStudioProps> = ({
  defaultVoice,
  defaultStyleId,
}) => {
  const [text, setText] = useState("");
  const [voiceName, setVoiceName] = useState(defaultVoice);
  const [styleId, setStyleId] = useState(defaultStyleId);
  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleGenerate = async () => {
    if (!text.trim()) {
      setErrorMsg("يرجى كتابة أو لصق النص أولاً.");
      setStatus("error");
      return;
    }

    setStatus("generating");
    setErrorMsg(null);
    setIsPlaying(false);

    try {
      const stylePrompt =
        LESSON_STYLE_PRESETS.find((p) => p.id === styleId)?.prompt ||
        LESSON_STYLE_PRESETS[0].prompt;

      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          voiceName,
          style: stylePrompt,
        }),
      });

      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };

      if (!res.ok || !data.audioBase64) {
        throw new Error(data.error || "تعذر تحويل النص إلى صوت.");
      }

      const wavBytes = base64ToUint8Array(data.audioBase64);
      const dur = getWavDurationSeconds(wavBytes);
      const blob = new Blob([wavBytes.buffer as ArrayBuffer], {
        type: data.mimeType || "audio/wav",
      });
      const url = URL.createObjectURL(blob);

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);
      setDurationSec(dur);
      setCurrentTime(0);
      setStatus("ready");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
      setErrorMsg(message);
      setStatus("error");
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = "custom-voiceover.wav";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <section
      id="custom-text"
      className="bg-white border border-slate-200 rounded-xl p-6 max-w-4xl mx-auto"
    >
      <div className="pb-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            تحويل نص مخصص إلى صوت
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            اكتب أو الصق أي فقرة تعليمية أو نص عربي لتحويله مباشرة إلى ملف صوتي بجودة واضحة.
          </p>
        </div>

        <span className="text-xs font-mono text-slate-500 tabular-nums">
          {text.length} / 5000 حرف
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="custom-voice"
            className="block text-xs font-medium text-slate-600 mb-1.5"
          >
            نبرة الصوت
          </label>
          <select
            id="custom-voice"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
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
            htmlFor="custom-style"
            className="block text-xs font-medium text-slate-600 mb-1.5"
          >
            أسلوب الإلقاء
          </label>
          <select
            id="custom-style"
            value={styleId}
            onChange={(e) => setStyleId(e.target.value)}
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

      <div className="mt-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          rows={8}
          placeholder="اكتب النص هنا باللغة العربية أو الإنجليزية..."
          className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-4 text-base leading-8 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
        />
      </div>

      {status === "error" && errorMsg && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setText("");
            setErrorMsg(null);
          }}
          disabled={!text}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>مسح النص</span>
        </button>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "generating" || !text.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
        >
          {status === "generating" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جارٍ التحويل إلى صوت...</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4" />
              <span>تحويل النص إلى صوت</span>
            </>
          )}
        </button>
      </div>

      {audioUrl && (
        <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-4">
          <audio
            ref={audioRef}
            src={audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (Number.isFinite(e.currentTarget.duration)) {
                setDurationSec(e.currentTarget.duration);
              }
            }}
          />

          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
            className="w-11 h-11 rounded-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 translate-x-[1px]" />
            )}
          </button>

          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-xs font-mono text-slate-600 mb-1.5 tabular-nums">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(durationSec)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={durationSec || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (audioRef.current) {
                  audioRef.current.currentTime = t;
                }
                setCurrentTime(t);
              }}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تحميل WAV</span>
          </button>
        </div>
      )}
    </section>
  );
};
