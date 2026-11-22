import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_VOICES = new Set(["Puck", "Charon", "Kore", "Fenrir", "Zephyr"]);
const ttsCache = new Map<string, { audioBase64: string; mimeType: string }>();

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function generateSpeechWithRetry(
  text: string,
  voiceName: string,
  style: string,
  useVoiceDesign = false,
  maxRetries = 2
): Promise<{ audioBase64: string; mimeType: string }> {
  const modelName = useVoiceDesign
    ? "gemini-3.8-flash-tts"
    : "gemini-3.8-flash-lite-tts";
  const cacheKey = `${modelName}::${voiceName}::${style}::${text}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const ai = getAiClient();
  let lastError: unknown;

  const part = style
    ? { text, speechMetadata: { style } }
    : { text };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [part],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      });

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData?.data) {
        throw new Error("لم يتم استلام بيانات صوتية من النموذج.");
      }

      const result = {
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || "audio/wav",
      };
      ttsCache.set(cacheKey, result);
      return result;
    } catch (err: unknown) {
      lastError = err;
      const errObj = err as { status?: number; message?: string };
      const status = errObj?.status;
      // Never retry 429 quota/rate-limit errors so we don't burn quota or spam logs
      const isTransientServerErr = status === 503 || status === 500;
      if (!isTransientServerErr || attempt === maxRetries) {
        break;
      }
      const delayMs = 800 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "15mb" }));

  app.post("/api/voice/analyze-reference", async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        audioBase64?: string;
        mimeType?: string;
        useDefaultReference?: boolean;
      };

      let base64Data = typeof body?.audioBase64 === "string" ? body.audioBase64.trim() : "";
      let mimeType = typeof body?.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "audio/mp3";

      if (body?.useDefaultReference || !base64Data) {
        const defaultPath = path.join(
          __dirname,
          "public/assets/aistudio/WhatsApp_Audio_2026-11-22_at_9.59.19_PM_5d3f42f9.mp3"
        );
        const fileBuf = await fs.readFile(defaultPath);
        base64Data = fileBuf.toString("base64");
        mimeType = "audio/mp3";
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: `Analyze this speaker's voice, tone, emotions, pacing, dialect, and speaking delivery in deep detail so a Voice Design TTS engine can faithfully recreate the exact same persona and delivery style when reading new scripts.

Return JSON with:
1. matchedVoice: Pick the single closest prebuilt voice base from ONLY these 5 options:
   - "Charon" (warm, calm, grounded male baritone-tenor, reassuring & fatherly)
   - "Fenrir" (deep, energetic, bold male voice)
   - "Puck" (bright, upbeat, youthful lively voice)
   - "Kore" (clear, poised, articulate broadcast voice)
   - "Zephyr" (gentle, soft, relaxed airy voice)
2. stylePrompt: A rich, concrete English Voice Design style prompt (35-70 words) describing the exact vocal timbre, pitch contour, emotional warmth, dialect/accent (e.g. Egyptian Arabic), pacing (words per minute feel), micro-pauses before key points/numbers, and conversational classroom/storytelling delivery so the TTS replicates this exact manner of speaking.
3. arabicSummary: A clear, concise Arabic summary (2-3 sentences) describing the extracted voice tone, emotions, and delivery method.
4. emotionTags: 4 short Arabic tags describing the tone and emotion (2-3 words each).
5. pacingNote: A short Arabic note about the speech tempo and pause rhythm.
6. transcript: Accurate Arabic transcription of the spoken words in the audio.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchedVoice: {
                type: Type.STRING,
                description: "One of: Charon, Fenrir, Puck, Kore, Zephyr",
              },
              stylePrompt: { type: Type.STRING },
              arabicSummary: { type: Type.STRING },
              emotionTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              pacingNote: { type: Type.STRING },
              transcript: { type: Type.STRING },
            },
            required: [
              "matchedVoice",
              "stylePrompt",
              "arabicSummary",
              "emotionTags",
              "pacingNote",
              "transcript",
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim()) as {
        matchedVoice?: string;
        stylePrompt?: string;
        arabicSummary?: string;
        emotionTags?: string[];
        pacingNote?: string;
        transcript?: string;
      };

      const matchedVoice =
        parsed.matchedVoice && ALLOWED_VOICES.has(parsed.matchedVoice)
          ? parsed.matchedVoice
          : "Charon";

      res.json({
        matchedVoice,
        stylePrompt: parsed.stylePrompt || "",
        arabicSummary: parsed.arabicSummary || "",
        emotionTags: Array.isArray(parsed.emotionTags) ? parsed.emotionTags.slice(0, 5) : [],
        pacingNote: parsed.pacingNote || "",
        transcript: parsed.transcript || "",
      });
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      const status = errObj?.status;
      const msg = errObj?.message || "تعذر تحليل التسجيل الصوتي المرجعي.";
      console.error(`Voice reference analysis error (${status || 500}):`, msg);

      if (
        status === 403 ||
        msg.includes("API_KEY_INVALID") ||
        msg.includes("PERMISSION_DENIED") ||
        msg.includes("not configured")
      ) {
        res.status(status || 500).json({
          error: "تعذر التحقق من مفتاح Gemini API. يرجى التأكد من إعداده في لوحة Settings > Secrets.",
          details: msg,
        });
        return;
      }

      if (status === 429 || msg.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({
          error: "تم الوصول لحد الطلبات المؤقت لواجهة التحليل الصوتي. يرجى المحاولة بعد لحظات.",
          details: msg,
        });
        return;
      }

      res.status(status || 500).json({
        error: "تعذر تحليل نبرة الصوت من التسجيل المرجعي حالياً.",
        details: msg,
      });
    }
  });

  app.post("/api/tts/generate", async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        text?: string;
        voiceName?: string;
        style?: string;
        useVoiceDesign?: boolean;
      };

      const rawText = typeof body?.text === "string" ? body.text.trim() : "";
      if (!rawText) {
        res.status(400).json({ error: "يرجى إدخال النص المطلوب تحويله إلى صوت." });
        return;
      }

      if (rawText.length > 5000) {
        res.status(400).json({
          error: "النص طويل جداً للمقطع الواحد. يرجى تقسيمه إلى فقرات أقصر من 5000 حرف.",
        });
        return;
      }

      const voiceName =
        typeof body?.voiceName === "string" && ALLOWED_VOICES.has(body.voiceName)
          ? body.voiceName
          : "Charon";

      const style =
        typeof body?.style === "string" && body.style.trim().length > 0
          ? body.style.trim().slice(0, 1200)
          : "";

      const useVoiceDesign = Boolean(body?.useVoiceDesign);

      const result = await generateSpeechWithRetry(
        rawText,
        voiceName,
        style,
        useVoiceDesign
      );
      res.json(result);
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      const status = errObj?.status;
      const msg = errObj?.message || "حدث خطأ غير متوقع أثناء توليد الصوت.";
      console.error(`TTS generation error (${status || 500}):`, msg);

      if (
        status === 403 ||
        msg.includes("API_KEY_INVALID") ||
        msg.includes("PERMISSION_DENIED") ||
        msg.includes("not configured")
      ) {
        res.status(status || 500).json({
          error: "تعذر التحقق من مفتاح Gemini API. يرجى التأكد من إعداده في لوحة Settings > Secrets.",
          details: msg,
        });
        return;
      }

      if (status === 429 || msg.includes("RESOURCE_EXHAUSTED")) {
        const isDailyLimit =
          msg.includes("PerDay") || msg.includes("per day");
        const retryMatch = msg.match(/Please retry in ([\d.]+)s/);
        const retryAfterSec = retryMatch ? Math.ceil(Number(retryMatch[1])) : 60;

        res.status(429).json({
          error: isDailyLimit
            ? "تم الوصول للحد اليومي للخطة المجانية لنموذج الصوت (10 طلبات يومياً). يمكنك استخدام مفتاح مدفوع في Settings > Secrets لزيادة الحد، أو رفع ملف صوتي جاهز."
            : `تم تجاوز الحد المؤقت (3 طلبات في الدقيقة للخطة المجانية). يرجى الانتظار ${retryAfterSec} ثانية ثم إعادة المحاولة.`,
          code: isDailyLimit ? "DAILY_QUOTA_EXHAUSTED" : "RATE_LIMITED",
          retryAfterSec,
        });
        return;
      }

      res.status(status || 500).json({
        error: "تعذر تحويل النص إلى صوت حالياً. يرجى المحاولة مرة أخرى.",
        details: msg,
      });
    }
  });

  app.post("/api/script/storyboard", async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        script?: string;
        title?: string;
        presenter?: string;
      };
      const script = typeof body?.script === "string" ? body.script.trim() : "";
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const presenter =
        typeof body?.presenter === "string" ? body.presenter.trim() : "";

      if (!script) {
        res.status(400).json({ error: "يرجى إدخال السكربت أولاً." });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `أنت مخرج موشن جرافيك محترف. قم بتحويل السكربت التالي إلى مشاهد موشن جرافيك متسلسلة وجذابة.
عنوان الفيديو: "${title || "فيديو تعليمي"}"
اسم المقدم/القناة: "${presenter || ""}"

السكربت الكامل:
"""
${script}
"""

القواعد الصارمة:
1. قسّم السكربت إلى 3 إلى 8 مشاهد متسلسلة (أول مشهد intro-cream وآخر مشهد outro-cream، والمشاهد الوسطى متنوعة بين numbered-steps و checklist و highlight-stat).
2. حافظ على نصوص السكربت كما هي داخل spokenLines لكل مشهد بالترتيب الدقيق دون اختصار أو حذف، بحيث إذا جمعنا spokenLines لكل المشاهد نحصل على السكربت كاملاً.
3. اجعل العناوين (title, headlinePrefix, headlineHighlight, headlineSuffix) قصيرة وواضحة ومناسبة للعرض البصري.
4. لمشاهد numbered-steps املأ cards (من 3 إلى 5 بطاقات قصيرة جداً: رقم + وصف من كلمتين أو ثلاث + أيقونة مناسبة).
5. لمشاهد checklist املأ checklistItems (من 3 إلى 5 نقاط موجزة).
6. لمشاهد highlight-stat املأ statValue (كلمة أو رقم بارز من 1 إلى 3 كلمات) و statLabel (وصف موجز) و checklistItems (نقطتان أو ثلاث).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              videoTitle: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    sceneType: {
                      type: Type.STRING,
                      description:
                        "One of: intro-cream, numbered-steps, checklist, highlight-stat, outro-cream",
                    },
                    headlinePrefix: { type: Type.STRING },
                    headlineHighlight: { type: Type.STRING },
                    headlineSuffix: { type: Type.STRING },
                    badgeText: { type: Type.STRING },
                    spokenLines: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    cards: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          number: { type: Type.STRING },
                          label: { type: Type.STRING },
                          icon: {
                            type: Type.STRING,
                            description:
                              "One of: rect, divide, multiply, subtract, sum, spark, check",
                          },
                        },
                        required: ["number", "label", "icon"],
                      },
                    },
                    checklistItems: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    statValue: { type: Type.STRING },
                    statLabel: { type: Type.STRING },
                  },
                  required: [
                    "title",
                    "sceneType",
                    "headlineHighlight",
                    "spokenLines",
                  ],
                },
              },
            },
            required: ["videoTitle", "scenes"],
          },
        },
      });

      const rawJson = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawJson) as {
        videoTitle?: string;
        scenes?: unknown[];
      };

      if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        throw new Error("لم يتم توليد مشاهد صالحة.");
      }

      res.json(parsed);
    } catch (error: unknown) {
      const errObj = error as { status?: number; message?: string };
      console.error("Storyboard generation error:", errObj?.message || error);
      res.status(errObj?.status || 500).json({
        error: "تعذر تحليل السكربت عبر الذكاء الاصطناعي، سيتم استخدام التقسيم التلقائي.",
        details: errObj?.message,
      });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import("vite");
      return createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer },
        },
        appType: "spa",
      });
    })();

    vitePromise.catch((err) => {
      console.error("Failed to initialize Vite dev middleware:", err);
    });

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
