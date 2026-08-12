import { Languages } from "lucide-react";
import { getCopy, type Language } from "../../i18n";

export function Header({
  language,
  onLanguageChange,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
}) {
  const copy = getCopy(language).header;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-5 sm:px-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {copy.title}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {copy.subtitle}
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1" aria-label={copy.languageLabel}>
          <Languages className="mx-2 h-4 w-4 text-slate-500" aria-hidden="true" />
          {(["en", "ru"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onLanguageChange(option)}
              aria-pressed={language === option}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                language === option ? "bg-[#2B6CB0] text-white shadow-sm" : "text-slate-600 hover:bg-white"
              }`}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
