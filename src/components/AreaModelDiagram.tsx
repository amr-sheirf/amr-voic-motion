import React, { useState, useEffect } from "react";
import type { AreaModelProblem } from "../data/lessonChapters";
import { RotateCcw, ChevronLeft, Layers } from "lucide-react";

interface AreaModelDiagramProps {
  problem: AreaModelProblem;
}

export const AreaModelDiagram: React.FC<AreaModelDiagramProps> = ({
  problem,
}) => {
  const [visibleSteps, setVisibleSteps] = useState<number>(problem.steps.length);

  useEffect(() => {
    setVisibleSteps(problem.steps.length);
  }, [problem]);

  const activeSteps = problem.steps.slice(0, visibleSteps);
  const partialSum = activeSteps.reduce((acc, s) => acc + s.quotientPart, 0);
  const isComplete = visibleSteps === problem.steps.length;

  return (
    <section
      id="area-model"
      aria-label="نموذج مساحة المستطيل التفاعلي"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{problem.label}</span>
            <span aria-hidden="true">·</span>
            <span>نموذج مساحة المستطيل التفاعلي</span>
            {problem.contextNote && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-sky-700 font-medium">{problem.contextNote}</span>
              </>
            )}
          </div>
          <h3
            className="text-xl font-bold text-slate-900 mt-1 font-mono tabular-nums"
            dir="ltr"
          >
            {problem.dividend.toLocaleString("en-US")} ÷ {problem.divisor.toLocaleString("en-US")} ={" "}
            <span className="text-sky-700">
              {isComplete ? problem.quotient.toLocaleString("en-US") : "?"}
            </span>
            {isComplete && problem.remainder > 0 && (
              <span className="text-sm font-sans text-amber-700 ms-2">
                (الباقي {problem.remainder})
              </span>
            )}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleSteps(1)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>ابدأ من الخطوة ١</span>
          </button>
          {visibleSteps < problem.steps.length ? (
            <button
              type="button"
              onClick={() =>
                setVisibleSteps((prev) => Math.min(problem.steps.length, prev + 1))
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>الخطوة التالية</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setVisibleSteps(problem.steps.length)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>مكتمل ({problem.steps.length} خطوات)</span>
            </button>
          )}
        </div>
      </div>

      {/* Area Model Visual Grid — LTR inside so divisor sits on the left ("على شمال المستطيل") */}
      <div className="mt-6 overflow-x-auto pb-2" dir="ltr">
        <div className="min-w-[540px] flex items-stretch gap-3">
          {/* Divisor on the Left of the Rectangle */}
          <div className="flex flex-col justify-center items-center px-3 pt-8">
            <span className="text-[11px] text-slate-500 font-sans mb-1 whitespace-nowrap">
              المقسوم عليه
            </span>
            <div className="w-14 h-14 rounded-lg border-2 border-sky-600 bg-sky-50 flex items-center justify-center font-mono text-xl font-bold text-sky-900 tabular-nums">
              {problem.divisor}
            </div>
          </div>

          {/* Rectangle Columns */}
          <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${problem.steps.length}, minmax(135px, 1fr))` }}>
            {problem.steps.map((step, idx) => {
              const revealed = idx < visibleSteps;
              return (
                <div key={idx} className="flex flex-col">
                  {/* Quotient part ABOVE the rectangle */}
                  <div className="h-9 flex items-center justify-center mb-1.5">
                    {revealed ? (
                      <div className="px-3 py-1 rounded-md bg-sky-600 text-white font-mono text-base font-bold tabular-nums">
                        {step.quotientPart}
                      </div>
                    ) : (
                      <div className="px-3 py-1 rounded-md border border-dashed border-slate-300 text-slate-400 font-mono text-sm">
                        ؟
                      </div>
                    )}
                  </div>

                  {/* Rectangle Cell */}
                  <div
                    className={`flex-1 rounded-lg border-2 p-3.5 flex flex-col justify-between transition-colors ${
                      revealed
                        ? "border-slate-800 bg-slate-50"
                        : "border-dashed border-slate-300 bg-white opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 font-sans mb-2">
                      <span>الخطوة {idx + 1}</span>
                      {revealed && (
                        <span className="font-mono text-slate-600 tabular-nums">
                          {problem.divisor} × {step.quotientPart}
                        </span>
                      )}
                    </div>

                    {revealed ? (
                      <div className="font-mono text-sm space-y-1 text-right tabular-nums">
                        <div className="text-slate-900 font-semibold text-base">
                          {step.remainingBefore}
                        </div>
                        <div className="text-sky-700 font-semibold">
                          - {step.product}
                        </div>
                        <div className="border-t border-slate-300 pt-1 font-bold text-base text-slate-900">
                          {step.remainingAfter}
                        </div>
                      </div>
                    ) : (
                      <div className="py-5 text-center text-xs text-slate-400 font-sans">
                        اضغط «الخطوة التالية»
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summation Footer */}
      <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-slate-700">
          <span className="font-semibold">مجموع الأعداد فوق المستطيل:</span>
          <span className="font-mono font-bold text-slate-900 tabular-nums" dir="ltr">
            {activeSteps.map((s) => s.quotientPart).join(" + ")} = {partialSum}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {isComplete ? (
            problem.remainder > 0 ? (
              <span className="text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-md text-xs font-semibold tabular-nums">
                خارج القسمة: {problem.quotient} · الباقي: {problem.remainder}
              </span>
            ) : (
              <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-md text-xs font-semibold tabular-nums">
                خارج القسمة: {problem.quotient} · الباقي: ٠
              </span>
            )
          ) : (
            <span className="text-slate-500 text-xs">
              تم عرض {visibleSteps} من {problem.steps.length} خطوات
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
