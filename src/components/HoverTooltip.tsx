import {
  ALL_PAYMENT_CHANNELS,
  CHANNEL_META,
  HoverInfo,
  METRIC_META,
  PaymentMetric,
} from '../types/payments';
import { getMetricBreakdown } from '../data/paymentsDataset';
import { DiurnalThemeState } from '../utils/timeTheme';

interface HoverTooltipProps {
  hover: HoverInfo | null;
  activeMetric: PaymentMetric;
  theme: DiurnalThemeState;
  viewportWidth: number;
  viewportHeight: number;
}

export function HoverTooltip({
  hover,
  activeMetric,
  theme,
  viewportWidth,
  viewportHeight,
}: HoverTooltipProps) {
  if (!hover) return null;

  const isLight = theme.isLightUI;
  const breakdown = getMetricBreakdown(hover.snapshot, activeMetric);
  const tooltipW = 276;
  const tooltipH = 228;

  const left = Math.min(
    Math.max(12, hover.screenX + 16),
    Math.max(12, viewportWidth - tooltipW - 16)
  );
  const top = Math.min(
    Math.max(12, hover.screenY - 14),
    Math.max(12, viewportHeight - tooltipH - 16)
  );

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ transform: `translate3d(${left}px, ${top}px, 0)`, width: tooltipW }}
      className={`pointer-events-none fixed top-0 left-0 z-40 rounded-xl border p-3 shadow-lg ${
        isLight
          ? 'border-slate-300 bg-[#f8fafc]/96 text-slate-900'
          : 'border-slate-700 bg-[#0b1120]/96 text-slate-100'
      }`}
    >
      <div className="text-xs font-bold leading-tight truncate">{hover.name}</div>
      <div
        className={`mt-0.5 text-[11px] truncate ${
          isLight ? 'text-slate-600' : 'text-slate-400'
        }`}
      >
        {hover.subtitle}
      </div>

      <div
        className={`my-2 h-px w-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}
        aria-hidden="true"
      />

      <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
        <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>
          {METRIC_META[activeMetric].label}
        </span>
        <span className="font-mono-tabular font-bold">{breakdown.totalFormatted}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 text-[11px]">
        {ALL_PAYMENT_CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch];
          const pct = breakdown.percentages[meta.key];
          return (
            <div key={ch} className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 truncate">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-xs"
                  style={{ backgroundColor: meta.colorHex }}
                />
                <span className={isLight ? 'text-slate-600 truncate' : 'text-slate-400 truncate'}>
                  {meta.shortLabel}
                </span>
              </span>
              <span className="font-mono-tabular font-semibold">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>

      <div
        className={`mt-2 flex items-center justify-between border-t pt-1.5 text-[10px] font-mono-tabular ${
          isLight
            ? 'border-slate-200 text-slate-500'
            : 'border-slate-800 text-slate-400'
        }`}
      >
        <span>Vol: {hover.snapshot.volume.totalFormatted}</span>
        <span>Amt: {hover.snapshot.amount.totalFormatted}</span>
      </div>
    </div>
  );
}
