export interface AreaModelStep {
  quotientPart: number;
  product: number;
  remainingBefore: number;
  remainingAfter: number;
}

export interface AreaModelProblem {
  label: string;
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
  steps: AreaModelStep[];
  contextNote?: string;
}

export interface LessonChapter {
  id: string;
  indexLabel: string;
  title: string;
  subtitle: string;
  text: string;
  problem?: AreaModelProblem;
}

export const VOICE_OPTIONS = [
  {
    id: "Charon",
    name: "الأستاذ عمرو (دافئ وواضح)",
    description: "نبرة تعليمية هادئة ومقنعة تناسب الشرح المدرسي",
  },
  {
    id: "Fenrir",
    name: "صوت نشيط وحماسي",
    description: "نبرة قوية ومشجعة تجذب انتباه الطلاب",
  },
  {
    id: "Puck",
    name: "صوت شاب ودود",
    description: "أسلوب حيوي وسريع الإيقاع للتدريبات",
  },
  {
    id: "Kore",
    name: "صوت إذاعي رصين",
    description: "مخارج حروف واضحة ومتزنة",
  },
  {
    id: "Zephyr",
    name: "صوت هادئ ولطيف",
    description: "إلقاء مريح للمراجعة والملخصات",
  },
] as const;

export interface VoiceCloneProfile {
  sourceLabel: string;
  sourceAudioUrl: string;
  matchedVoice: string;
  stylePrompt: string;
  arabicSummary: string;
  emotionTags: string[];
  pacingNote: string;
  transcript: string;
}

export const DEFAULT_REFERENCE_AUDIO_URL =
  "/assets/aistudio/WhatsApp_Audio_2026-11-22_at_9.59.19_PM_5d3f42f9.mp3";

export const SAMPLE_REFERENCE_SCRIPT = `صباح الخير يا أبطال، عاملين إيه النهاردة؟ أنا الأستاذ عمرو شريف.
النهاردة إن شاء الله هناخد درس جديد ومهم جداً في الرياضيات، وهو كتابة الأعداد وقراءتها والقيمة المكانية.

قبل ما نبدأ، عايزكم تركزوا معايا في قاعدة مهمة جداً:
لما نيجي نقرأ أي عدد كبير بنقسمه من اليمين للشمال، كل تلات أرقام مع بعض وهنسمي كل تلات أرقام عيلة.
في عندنا عيلة اسمها عيلة الآحاد، وعيلة الألوف، وعيلة الملايين.
هنبدأ قراءة العدد من الشمال لليمين.

كمان لازم نفرق بين حاجتين مهمين جداً:
القيمة المكانية يعني الرقم موجود في أنهي خانة، أما القيمة الرقمية فهي قيمة الرقم حسب مكانه في العدد.

يلا نبدأ أول تمرين! معانا التمرين الأولاني بيقول: اكتب القيمة المكانية والقيمة الرقمية للرقم ٤.
التمرين التاني: عندنا ٣ مليون و٢٥٠ ألف و٤٠٠، أول حاجة لازم تقرأ العدد كله مع بعض، وبكده نكون كتبنا العدد بالصيغة اللفظية.
التمرين التالت: معانا عدد سكان إحدى المدن هو ٩ مليون و١٠٥ ألف و٣٠٠، السؤال بيقول: حدد الرقم اللي موجود في خانة مئات الألوف، تعالوا بقى ناخد الخانات من اليمين.
هنروح بقى للتمرين الرابع: اكتب بالأرقام العدد التالي، قبل ما نشتغل لازم نقسم العدد لعيلات.`;

export const DEFAULT_CLONED_VOICE_PROFILE: VoiceCloneProfile = {
  sourceLabel: "التسجيل المرجعي المرفق — الأستاذ عمرو شريف",
  sourceAudioUrl: DEFAULT_REFERENCE_AUDIO_URL,
  matchedVoice: "Charon",
  stylePrompt:
    "Warm, calm, reassuring Egyptian Arabic male teacher voice (baritone-tenor) with genuine friendly classroom warmth and conversational authenticity. Speak in natural Egyptian Colloquial Arabic at a steady, unhurried pedagogical pace (~120 wpm). Use gentle upward inflection on engaging questions, clear crisp articulation on Arabic numbers and math terms, smooth downward pitch resolution at sentence endings, and brief natural micro-pauses between steps and exercises.",
  arabicSummary:
    "نبرة ذكورية دافئة ومطمئنة بطابع معلم مصري قريب من طلابه؛ تجمع بين الحماس الهادئ والترحيب الصادق في البداية، ثم تنتقل لإلقاء تعليمي متزن وواضح مع وقفات قصيرة محسوبة عند القواعد والأرقام.",
  emotionTags: [
    "دفء وترحيب أبوي",
    "هدوء وثقة تعليمية",
    "عامية مصرية طبيعية",
    "وقفات واضحة للأرقام",
  ],
  pacingNote: "إيقاع متزن غير متعجل مع تشديد لطيف على الكلمات المفتاحية والأسئلة",
  transcript: SAMPLE_REFERENCE_SCRIPT,
};

export const LESSON_STYLE_PRESETS = [
  {
    id: "cloned",
    label: "النبرة والمشاعر المنسوخة (من التسجيل المرفق)",
    prompt: DEFAULT_CLONED_VOICE_PROFILE.stylePrompt,
  },
  {
    id: "teacher",
    label: "أسلوب معلم مصري مشوق",
    prompt:
      "Warm, enthusiastic, and crystal-clear Egyptian Arabic math teacher explaining step-by-step to students, pausing naturally at numbers and questions.",
  },
  {
    id: "calm",
    label: "شرح هادئ وبطيء للتركيز",
    prompt:
      "Calm, patient, deliberate Egyptian Arabic tutor reading slowly and clearly so students can write down every calculation step.",
  },
  {
    id: "story",
    label: "إلقاء حيوي وتفاعلي",
    prompt:
      "Lively, engaging Egyptian Arabic presenter with expressive emphasis on key math concepts and encouraging phrases.",
  },
] as const;

export const INITIAL_LESSON_CHAPTERS: LessonChapter[] = [
  {
    id: "intro",
    indexLabel: "٠١",
    title: "المقدمة وخطوات الطريقة",
    subtitle: "ترحيب الأستاذ عمرو شريف والتعريف بنموذج مساحة المستطيل",
    text: `اأهلاً يا أبطال! عاملين إيه؟ , انا الاستاذ عمرو شريف 
هنستخدم طريقة اسمها نموذج مساحة المستطيل.
عارفين يعني إيه؟
ببساطة، هنستخدم مستطيل ونقسمه لأجزاء، وكل جزء هيساعدنا نحل جزء من عملية القسمة.
وفي النهاية، هنجمع الأجزاء دي مع بعض، ونوصل للإجابة بسهولة.
يلا بينا نشوف الطريقة دي خطوة خطوة!
قبل ما نبدأ في الحل، تعالوا نتعرف على خطوات الطريقة.
أول حاجة، هنرسم مستطيل.
هنكتب العدد اللي عايزين نقسمه جوه المستطيل، وهنكتب العدد اللي بنقسم عليه على شمال المستطيل.
بعد كده، هنبدأ ندور على مضاعفات مناسبة للعدد اللي بنقسم عليه.
يعني نضرب العدد في عشرة، أو عشرين، أو مية، أو أي عدد مناسب يساعدنا نطرح جزء من العدد الكبير.
كل ما نختار مضاعف مناسب، هنضربه في المقسوم عليه، ونطرح الناتج من العدد اللي جوه المستطيل.
وبنكرر الخطوة دي لحد ما نوصل للصفر، أو يتبقى عندنا عدد أصغر من المقسوم عليه.
وفي الآخر، هنجمع الأعداد اللي كتبناها فوق المستطيل، ومجموعها هو خارج القسمة.
واضحة يا أبطال؟ طيب يلا نطبق مع بعض!`,
  },
  {
    id: "example-1",
    indexLabel: "٠٢",
    title: "المثال التطبيقي: ١٦٢٥ ÷ ١٣",
    subtitle: "تطبيق خطوة بخطوة مع تجربة المضاعفات",
    text: `معانا المسألة دي:
ألف وستمائة وخمسة وعشرين، على ثلاثة عشر.

أول حاجة هنرسم المستطيل، ونكتب جواه ألف وستمائة وخمسة وعشرين، وعلى شماله نكتب العدد تلاتاشر.
دلوقتي هنبدأ أول خطوة.
عايزين نختار عدد نضربه في تلاتاشر، ويكون الناتج أقل من ألف وستمائة وخمسة وعشرين.
خلونا نجرب مية.
تلاتاشر في واحد يساوي تلاتاشر.
وتلاتاشر في عشرة يساوي مية وتلاتين.
وتلاتاشر في مية يساوي ألف وتلتمية.
ممتاز!
هنكتب مية فوق المستطيل، ونطرح ألف وتلتمية من ألف وستمائة وخمسة وعشرين.
يتبقى معانا تلتمية وخمسة وعشرين.
طيب، نعمل إيه دلوقتي؟
هنكرر نفس الخطوات مع العدد الجديد، وهو تلتمية وخمسة وعشرين.
ندور على عدد نضربه في تلاتاشر، ويكون مناسب.
هنجرب عشرين.
تلاتاشر في عشرين يساوي ميتين وستين.
هنكتب عشرين فوق المستطيل، ونطرح ميتين وستين من تلتمية وخمسة وعشرين.
يتبقى خمسة وستين.
لسه فيه باقي؟ أيوه!
طيب، نجرب خمسة.
تلاتاشر في خمسة يساوي خمسة وستين.
هنكتب خمسة فوق المستطيل، ونطرح خمسة وستين من خمسة وستين.
الناتج صفر!
برافو عليكم!
كده إحنا خلصنا عملية القسمة.
نعمل إيه بقى علشان نعرف خارج القسمة؟
هنجمع الأعداد اللي كتبناها فوق المستطيل.
مية زائد عشرين زائد خمسة.
الناتج يساوي مية وخمسة وعشرين.
إذن:
ألف وستمائة وخمسة وعشرين قسمة تلاتاشر تساوي مية وخمسة وعشرين.
شايفين الطريقة سهلة إزاي؟`,
    problem: {
      label: "المثال التطبيقي",
      dividend: 1625,
      divisor: 13,
      quotient: 125,
      remainder: 0,
      steps: [
        { quotientPart: 100, product: 1300, remainingBefore: 1625, remainingAfter: 325 },
        { quotientPart: 20, product: 260, remainingBefore: 325, remainingAfter: 65 },
        { quotientPart: 5, product: 65, remainingBefore: 65, remainingAfter: 0 },
      ],
    },
  },
  {
    id: "practice-1",
    indexLabel: "٠٣",
    title: "التدريب الأول: ١١٢٠ ÷ ٤",
    subtitle: "مسألة تدريبية بدون باقٍ",
    text: `يلا يا أبطال، دلوقتي وقت التدريب!
هنحل مع بعض أربع مسائل، ونستخدم نفس الطريقة اللي اتعلمناها.
المسألة الأولى:
ألف ومية وعشرين قسمة أربعة.
هنبدأ بمضاعف مناسب للعدد أربعة.
أربعة في ميتين يساوي تمنمية.
نطرح تمنمية من ألف ومية وعشرين، يتبقى تلتمية وعشرين.
بعد كده، أربعة في تمانين يساوي تلتمية وعشرين.
نطرح، فيتبقى صفر.
دلوقتي نجمع ميتين زائد تمانين.
الناتج ميتين وتمانين.
إذن، ألف ومية وعشرين قسمة أربعة تساوي ميتين وتمانين.`,
    problem: {
      label: "المسألة الأولى",
      dividend: 1120,
      divisor: 4,
      quotient: 280,
      remainder: 0,
      steps: [
        { quotientPart: 200, product: 800, remainingBefore: 1120, remainingAfter: 320 },
        { quotientPart: 80, product: 320, remainingBefore: 320, remainingAfter: 0 },
      ],
    },
  },
  {
    id: "practice-2",
    indexLabel: "٠٤",
    title: "التدريب الثاني: ٥٨٤٠ ÷ ١٦",
    subtitle: "القسمة على عدد مكون من رقمين",
    text: `المسألة التانية:
خمسة آلاف وتمانمية وأربعين قسمة ستاشر.
هنبدأ بستاشر في تلتمية، والناتج أربعة آلاف وتمانمية.
نطرح، يتبقى ألف وأربعين.
بعد كده، ستاشر في ستين يساوي تسعمية وستين.
نطرح، يتبقى تمانين.
وأخيرًا، ستاشر في خمسة يساوي تمانين.
نطرح، فيتبقى صفر.
نجمع تلتمية زائد ستين زائد خمسة.
الناتج تلتمية وخمسة وستين.
إذن خارج القسمة يساوي تلتمية وخمسة وستين.`,
    problem: {
      label: "المسألة التانية",
      dividend: 5840,
      divisor: 16,
      quotient: 365,
      remainder: 0,
      steps: [
        { quotientPart: 300, product: 4800, remainingBefore: 5840, remainingAfter: 1040 },
        { quotientPart: 60, product: 960, remainingBefore: 1040, remainingAfter: 80 },
        { quotientPart: 5, product: 80, remainingBefore: 80, remainingAfter: 0 },
      ],
    },
  },
  {
    id: "practice-3",
    indexLabel: "٠٥",
    title: "التدريب الثالث: ٢٧٢٧ ÷ ٢٣",
    subtitle: "قسمة بوجود باقٍ أصغر من المقسوم عليه",
    text: `المسألة التالتة:
ألفين وسبعمية وسبعة وعشرين قسمة تلاتة وعشرين.
نبدأ بتلاتة وعشرين في مية، يساوي ألفين وتلتمية.
نطرح، يتبقى ربعمية وسبعة وعشرين.
بعد كده، تلاتة وعشرين في عشرة يساوي ميتين وتلاتين.
نطرح، يتبقى مية وسبعة وتسعين.
بعد كده، تلاتة وعشرين في تمانية يساوي مية وأربعة وتمانين.
نطرح، يتبقى تلاتاشر.
خدوا بالكم يا أبطال!
العدد تلاتاشر أصغر من تلاتة وعشرين، يعني مش هنقدر نطرح منه مجموعة كاملة تانية.
إذن، تلاتاشر هو باقي القسمة.
نجمع مية زائد عشرة زائد تمانية.
الناتج مية وتمانتاشر.
إذن خارج القسمة مية وتمانتاشر، والباقي تلاتاشر.`,
    problem: {
      label: "المسألة التالتة",
      dividend: 2727,
      divisor: 23,
      quotient: 118,
      remainder: 13,
      steps: [
        { quotientPart: 100, product: 2300, remainingBefore: 2727, remainingAfter: 427 },
        { quotientPart: 10, product: 230, remainingBefore: 427, remainingAfter: 197 },
        { quotientPart: 8, product: 184, remainingBefore: 197, remainingAfter: 13 },
      ],
    },
  },
  {
    id: "practice-4",
    indexLabel: "٠٦",
    title: "التدريب الرابع: ٦٣٢٢ ÷ ١٣",
    subtitle: "تطبيق متقدم مع باقي القسمة",
    text: `المسألة الرابعة:
ستة آلاف وتلتمية واتنين وعشرين قسمة تلاتاشر.
نبدأ بتلاتاشر في ربعمية، يساوي خمسة آلاف وميتين.
نطرح، يتبقى ألف ومية واتنين وعشرين.
بعد كده، تلاتاشر في تمانين يساوي ألف وأربعين.
نطرح، يتبقى اتنين وتمانين.
وأخيرًا، تلاتاشر في ستة يساوي تمانية وسبعين.
نطرح، يتبقى أربعة.
كده مفيش مضاعف تاني لتلاتاشر نقدر نطرحه من أربعة.
إذن، نجمع ربعمية زائد تمانين زائد ستة.
الناتج ربعمية وستة وتمانين.
والباقي أربعة.
إذن خارج القسمة ربعمية وستة وتمانين، والباقي أربعة.`,
    problem: {
      label: "المسألة الرابعة",
      dividend: 6322,
      divisor: 13,
      quotient: 486,
      remainder: 4,
      steps: [
        { quotientPart: 400, product: 5200, remainingBefore: 6322, remainingAfter: 1122 },
        { quotientPart: 80, product: 1040, remainingBefore: 1122, remainingAfter: 82 },
        { quotientPart: 6, product: 78, remainingBefore: 82, remainingAfter: 4 },
      ],
    },
  },
  {
    id: "real-life",
    indexLabel: "٠٧",
    title: "مسألة حياتية: توزيع البرتقال",
    subtitle: "٥٣٥٠ كيلو برتقال على ٢٥ صندوق",
    text: `عاش يا أبطال! كده إحنا حلينا أربع مسائل باستخدام نفس الطريقة.
دلوقتي عندنا مسألة جميلة من حياتنا اليومية.
تخيلوا معايا إن عندنا خمسة آلاف وتلتمية وخمسين كيلو برتقال، وعايزين نوزعهم بالتساوي على خمسة وعشرين صندوق.
السؤال بيقول لنا: كام كيلو برتقال هيكون في كل صندوق؟
علشان نحل المسألة، هنقسم إجمالي كمية البرتقال على عدد الصناديق.
يعني خمسة آلاف وتلتمية وخمسين قسمة خمسة وعشرين.
هنستخدم نموذج مساحة المستطيل.
أول خطوة: خمسة وعشرين في ميتين يساوي خمسة آلاف.
نطرح خمسة آلاف من خمسة آلاف وتلتمية وخمسين، يتبقى تلتمية وخمسين.
تاني خطوة: خمسة وعشرين في عشرة يساوي ميتين وخمسين.
نطرح، يتبقى مية.
تالت خطوة: خمسة وعشرين في أربعة يساوي مية.
نطرح، فيتبقى صفر.
دلوقتي نجمع ميتين زائد عشرة زائد أربعة.
الناتج ميتين وأربعتاشر.
إذن، كل صندوق فيه ميتين وأربعتاشر كيلو برتقال.
شايفين يا أبطال؟ الرياضيات موجودة حوالينا في حياتنا كل يوم!`,
    problem: {
      label: "مسألة البرتقال والصناديق",
      dividend: 5350,
      divisor: 25,
      quotient: 214,
      remainder: 0,
      contextNote: "٢١٤ كيلو برتقال في كل صندوق",
      steps: [
        { quotientPart: 200, product: 5000, remainingBefore: 5350, remainingAfter: 350 },
        { quotientPart: 10, product: 250, remainingBefore: 350, remainingAfter: 100 },
        { quotientPart: 4, product: 100, remainingBefore: 100, remainingAfter: 0 },
      ],
    },
  },
  {
    id: "outro",
    indexLabel: "٠٨",
    title: "ملخص الخطوات والختام",
    subtitle: "مراجعة القواعد الخمسة وتوقيع الأستاذ عمرو",
    text: `وصلنا لنهاية درسنا النهارده يا أبطال.
بس قبل ما نمشي، تعالوا نفتكر مع بعض أهم الخطوات.
أولاً: بنرسم مستطيل، ونكتب العدد المقسوم جواه، والمقسوم عليه على شماله.
ثانياً: بنختار مضاعفات مناسبة للمقسوم عليه.
ثالثاً: بنضرب، وبنطرح الناتج من العدد الموجود جوه المستطيل.
رابعاً: بنكرر الخطوات دي لحد ما نوصل للصفر، أو يتبقى عدد أصغر من المقسوم عليه.
خامساً: بنجمع الأعداد اللي فوق المستطيل، علشان نعرف خارج القسمة.
ولو فضل عدد أصغر من المقسوم عليه، يبقى ده باقي القسمة.
عايزكم تفتكروا دايمًا إن المسائل الكبيرة ممكن نحلها بسهولة لما نقسمها لخطوات صغيرة.
أتمنى تكونوا فهمتوا الدرس واستمتعتوا معايا.
كان معاكم الاستاذ عمرو مدرسة قرية 7.`,
  },
];
