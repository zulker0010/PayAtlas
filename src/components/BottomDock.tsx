import {
  ChevronDown,
  ChevronUp,
  Clock,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  MAP_THEMES,
  MapThemeId,
  METRIC_META,
  PaymentMetric,
  TimeMode,
} from '../types/payments';
import { DiurnalThemeState, formatHourToClock } from '../utils/timeTheme';

interface BottomDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeMetric: PaymentMetric;
  onChangeMetric: (metric: PaymentMetric) => void;
  mapTheme: MapThemeId;
  onChangeMapTheme: (themeId: MapThemeId) => void;
  timeMode: TimeMode;
  onChangeTimeMode: (mode: TimeMode) => void;
  hourFloat: number;
  onScrubHour: (hour: number) => void;
  theme: DiurnalThemeState;
  canResetToWorld: boolean;
  onResetWorld: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const METRICS_ORDER: PaymentMetric[] = [
  PaymentMetric.VOLUME,
  PaymentMetric.AMOUNT,
  PaymentMetric.CUSTOMER_COUNT,
  PaymentMetric.MERCHANT_COUNT,
];

const TIME_PRESETS = [
  { label: 'Dawn', hour: 6.5 },
  { label: 'Day', hour: 13.0 },
  { label: 'Dusk', hour: 18.25 },
  { label: 'Night', hour: 23.0 },
];

export function BottomDock({
  collapsed,
  onToggleCollapse,
  activeMetric,
  onChangeMetric,
  mapTheme,
  onChangeMapTheme,
  timeMode,
  onChangeTimeMode,
  hourFloat,
  onScrubHour,
  theme,
  canResetToWorld,
  onResetWorld,
  onZoomIn,
  onZoomOut,
}: BottomDockProps) {
  const isLight = theme.isLightUI;

  const surfaceClass = isLight
    ? 'border-slate-300/85 bg-[#f8fafc]/95 text-slate-900'
    : 'border-slate-700/75 bg-[#0b1120]/94 text-slate-100';

  const segBgClass = isLight ? 'bg-slate-200/80' : 'bg-slate-900/90';
  const activeSegClass = isLight
    ? 'bg-white text-slate-950 shadow-sm'
    : 'bg-sky-500 text-slate-950 shadow-sm';
  const inactiveSegClass = isLight
    ? 'text-slate-700 hover:text-slate-950'
    : 'text-slate-300 hover:text-white';

  return (
    <div
      className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex w-[min(860px,calc(100vw-24px))] -translate-x-1/2 flex-col items-center sm:bottom-4 sm:w-[min(860px,calc(100%-32px))]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        className={`pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-t-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 ${surfaceClass}`}
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
            <span className="hidden sm:inline">Show Controls (H)</span>
            <span className="sm:hidden">Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
            <span className="hidden sm:inline">Hide Controls (H)</span>
            <span className="sm:hidden">Hide</span>
          </>
        )}
      </button>

      {/* Main Dock Body */}
      <div
        className={`pointer-events-auto w-full rounded-xl border px-3 py-2 shadow-lg transition-transform duration-200 ease-out sm:px-4 sm:py-2.5 ${surfaceClass} ${
          collapsed ? 'translate-y-[120%] pointer-events-none opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex flex-col gap-2">
          {/* Row 1: 2D Map Glyph Metric Focus + Zoom & View Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="no-scrollbar flex min-w-0 max-w-full items-center gap-2 overflow-x-auto">
              <span
                className={`hidden text-xs font-medium whitespace-nowrap md:inline ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                Map Glyph Metric
              </span>
              <div className={`flex items-center gap-1 rounded-lg p-1 ${segBgClass}`}>
                {METRICS_ORDER.map((m) => {
                  const isActive = activeMetric === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onChangeMetric(m)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-3 ${
                        isActive ? activeSegClass : inactiveSegClass
                      }`}
                    >
                      {METRIC_META[m].shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className={`flex items-center rounded-lg border ${
                  isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'
                }`}
              >
                <button
                  type="button"
                  onClick={onZoomOut}
                  aria-label="Zoom out map"
                  className={`rounded-l-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    isLight
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <div
                  className={`h-4 w-px ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={onZoomIn}
                  aria-label="Zoom in map"
                  className={`rounded-r-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    isLight
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              {canResetToWorld && (
                <button
                  type="button"
                  onClick={onResetWorld}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-3 ${
                    isLight
                      ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                      : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                  <span className="hidden sm:inline">World Overview</span>
                  <span className="sm:hidden">World</span>
                </button>
              )}
            </div>
          </div>

          <div
            className={`h-px w-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}
            aria-hidden="true"
          />

          {/* Row 2: Map Theme Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="no-scrollbar flex min-w-0 max-w-full items-center gap-2 overflow-x-auto">
              <span
                className={`hidden text-xs font-medium whitespace-nowrap md:inline ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                Map Theme
              </span>
              <div
                role="radiogroup"
                aria-label="Map theme"
                className={`flex items-center gap-1 rounded-lg p-1 ${segBgClass}`}
              >
                {MAP_THEMES.map((opt) => {
                  const isActive = mapTheme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => onChangeMapTheme(opt.id)}
                      title={opt.description}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-3 ${
                        isActive ? activeSegClass : inactiveSegClass
                      }`}
                    >
                      <span
                        className="inline-flex h-3 w-3 shrink-0 overflow-hidden rounded-xs border border-black/20"
                        aria-hidden="true"
                      >
                        <span
                          className="h-full w-1/2"
                          style={{ backgroundColor: opt.swatchOcean }}
                        />
                        <span
                          className="h-full w-1/2"
                          style={{ backgroundColor: opt.swatchLand }}
                        />
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            className={`h-px w-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}
            aria-hidden="true"
          />

          {/* Row 3: Diurnal Time-of-Day Automatic Transition Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="no-scrollbar flex max-w-full items-center gap-2 overflow-x-auto">
              <div className={`flex items-center gap-1 rounded-lg p-1 ${segBgClass}`}>
                <button
                  type="button"
                  onClick={() => onChangeTimeMode(TimeMode.BROWSER_CLOCK)}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-2.5 ${
                    timeMode === TimeMode.BROWSER_CLOCK ? activeSegClass : inactiveSegClass
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Local Clock</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeTimeMode(
                      timeMode === TimeMode.AUTO_CYCLE
                        ? TimeMode.MANUAL
                        : TimeMode.AUTO_CYCLE
                    )
                  }
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-2.5 ${
                    timeMode === TimeMode.AUTO_CYCLE ? activeSegClass : inactiveSegClass
                  }`}
                >
                  {timeMode === TimeMode.AUTO_CYCLE ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>Auto-Transition</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTimeMode(TimeMode.MANUAL)}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-2.5 ${
                    timeMode === TimeMode.MANUAL ? activeSegClass : inactiveSegClass
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Manual</span>
                </button>
              </div>
            </div>

            {/* 24h Scrubber */}
            <div className="flex min-w-[140px] flex-1 items-center gap-2 sm:min-w-[200px] sm:gap-2.5">
              <label htmlFor="diurnal-hour-slider" className="sr-only">
                Time of day hour
              </label>
              <input
                id="diurnal-hour-slider"
                type="range"
                min={0}
                max={23.95}
                step={0.05}
                value={hourFloat}
                onChange={(e) => {
                  onChangeTimeMode(TimeMode.MANUAL);
                  onScrubHour(parseFloat(e.target.value));
                }}
                className="h-1.5 w-full cursor-pointer accent-sky-500"
              />
              <span className="font-mono-tabular w-12 text-right text-xs font-semibold">
                {formatHourToClock(hourFloat)}
              </span>
            </div>

            {/* Phase Quick Jumps */}
            <div className="flex items-center gap-1">
              {TIME_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onChangeTimeMode(TimeMode.MANUAL);
                    onScrubHour(p.hour);
                  }}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    isLight
                      ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-950'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
