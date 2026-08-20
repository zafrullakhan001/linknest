import React from 'react';
import type { CheckResult } from './SslUrlChecker';
import { gradeBarColor, gradeColorClass, GRADE_LEGEND, SCORE_RULES_TEXT } from '../../services/ssl/sslCheckGrading';

type Props = {
  result: CheckResult;
  gradeLegendOpen: boolean;
  onToggleGradeLegend: () => void;
};

const SslLabsReportSummary: React.FC<Props> = ({ result, gradeLegendOpen, onToggleGradeLegend }) => {
  const grade = result.grade;
  if (!grade) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex flex-col lg:flex-row">
        <div
          className={`flex flex-col items-center justify-center px-8 py-6 min-w-[140px] ${gradeColorClass(grade.letter)}`}
        >
          <span className="text-5xl font-black tracking-tight">{grade.letter}</span>
          <span className="text-xs font-medium mt-1 opacity-90">Overall grade</span>
          <span className="text-[11px] mt-0.5 opacity-80">{grade.numeric}/100</span>
        </div>

        <div className="flex-1 p-4 bg-gray-50 dark:bg-gray-900/40 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {grade.categories.map((c) => (
              <div key={c.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{c.label}</span>
                  <span className="font-mono text-gray-900 dark:text-gray-100">{c.score}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${gradeBarColor(c.score)}`}
                    style={{ width: `${c.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {grade.notices.length > 0 && (
            <div className="space-y-1.5">
              {grade.notices.map((n) => (
                <div
                  key={n.message}
                  className={`text-xs px-3 py-2 rounded-md border ${
                    n.severity === 'cap'
                      ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
                      : n.severity === 'warn'
                        ? 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200'
                  }`}
                >
                  {n.message}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            onClick={onToggleGradeLegend}
          >
            How grades work {gradeLegendOpen ? '▾' : '▸'}
          </button>
          {gradeLegendOpen && (
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
              <p>{SCORE_RULES_TEXT}</p>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-gray-500">
                    <th className="pr-2 py-0.5">Score</th>
                    <th className="pr-2 py-0.5">Grade</th>
                    <th className="py-0.5">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_LEGEND.map((row) => (
                    <tr key={row.range}>
                      <td className="pr-2 py-0.5 font-mono">{row.range}</td>
                      <td className="pr-2 py-0.5 font-mono">{row.grades}</td>
                      <td className="py-0.5">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SslLabsReportSummary;

