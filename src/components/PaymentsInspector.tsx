import { ArrowLeft, ChevronRight, MapPin, X } from 'lucide-react';
import {
  computeSnapshotForHour,
  CONTINENTS,
} from '../data/paymentsDataset';
import {
  ALL_PAYMENT_CHANNELS,
  CHANNEL_META,
  ChannelSplit,
  CityNode,
  ComputedMetricBreakdown,
  CountryNode,
  HierarchyLevel,
  LocalAreaNode,
  PaymentMetric,
  PaymentProfile,
} from '../types/payments';
import { DiurnalThemeState } from '../utils/timeTheme';

interface PaymentsInspectorProps {
  open: boolean;
  level: HierarchyLevel;
  title: string;
  subtitle: string;
  profile: PaymentProfile;
  continentId: string | null;
  country: CountryNode | null;
  city: CityNode | null;
  localAreaId: string | null;
  activeMetric: PaymentMetric;
  hourFloat: number;
  theme: DiurnalThemeState;
  onSelectContinent: (continentId: string) => void;
  onSelectCountry: (country: CountryNode) => void;
  onSelectCity: (city: CityNode) => void;
  onSelectLocalArea: (area: LocalAreaNode) => void;
  onStepBack: () => void;
  onClose: () => void;
}

function DiurnalCurveChart({
  profile,
  currentHour,
  isLight,
}: {
  profile: PaymentProfile;
  currentHour: number;
  isLight: boolean;
}) {
  const width = 330;
  const height = 96;
  const padX = 8;
  const padY = 10;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const hours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
  const samples = hours.map((h) => computeSnapshotForHour(profile, h).volume.percentages);

  let peakPct = 40;
  for (const s of samples) {
    for (const ch of ALL_PAYMENT_CHANNELS) {
      const val = s[CHANNEL_META[ch].key];
      if (val > peakPct) peakPct = val;
    }
  }
  const yCeiling = Math.min(85, Math.ceil(peakPct / 10) * 10 + 5);

  const buildPath = (key: keyof ChannelSplit) => {
    return samples
      .map((s, i) => {
        const x = padX + (hours[i] / 24) * plotW;
        const y = padY + (1 - Math.min(s[key], yCeiling) / yCeiling) * plotH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const markerX = padX + ((currentHour % 24) / 24) * plotW;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className={isLight ? 'font-medium text-slate-700' : 'font-medium text-slate-300'}>
          24-Hour Channel Mix Shift
        </span>
        <span className={`font-mono-tabular ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          00:00 – 24:00
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full rounded-lg border ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/70'
        }`}
        role="img"
        aria-label="24-hour diurnal digital payment channel percentage curve"
      >
        {/* Subtle 6h gridlines */}
        {[6, 12, 18].map((h) => {
          const x = padX + (h / 24) * plotW;
          return (
            <line
              key={h}
              x1={x}
              y1={padY}
              x2={x}
              y2={height - padY}
              stroke={isLight ? '#e2e8f0' : '#1e293b'}
              strokeWidth={1}
            />
          );
        })}

        {ALL_PAYMENT_CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch];
          return (
            <path
              key={ch}
              d={buildPath(meta.key)}
              fill="none"
              stroke={meta.colorHex}
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Current hour indicator */}
        <line
          x1={markerX}
          y1={4}
          x2={markerX}
          y2={height - 4}
          stroke={isLight ? '#0f172a' : '#f8fafc'}
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
      </svg>
    </div>
  );
}

function MetricRow({
  breakdown,
  isFocused,
  isLight,
}: {
  breakdown: ComputedMetricBreakdown;
  isFocused: boolean;
  isLight: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 py-3 ${
        isFocused
          ? isLight
            ? 'bg-sky-50/70 -mx-4 px-4'
            : 'bg-sky-950/35 -mx-4 px-4'
          : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`text-xs font-semibold ${
            isLight ? 'text-slate-800' : 'text-slate-200'
          }`}
        >
          {breakdown.label}
        </span>
        <span
          className={`font-mono-tabular text-sm font-bold ${
            isLight ? 'text-slate-950' : 'text-white'
          }`}
        >
          {breakdown.totalFormatted}
        </span>
      </div>

      {/* 100% Stacked Channel Proportion Bar */}
      <div
        className={`flex h-2 w-full overflow-hidden rounded-full ${
          isLight ? 'bg-slate-200' : 'bg-slate-800'
        }`}
        role="img"
        aria-label={`${breakdown.label} split across all 7 digital payment channels`}
      >
        {ALL_PAYMENT_CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch];
          const pct = breakdown.percentages[meta.key];
          return (
            <div
              key={ch}
              style={{
                width: `${pct}%`,
                backgroundColor: meta.colorHex,
              }}
              className="h-full transition-[width] duration-200"
              title={`${meta.label}: ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Exact Tabular Percentage Grid (7 channels) */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {ALL_PAYMENT_CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch];
          const pct = breakdown.percentages[meta.key];
          return (
            <div key={ch} className="flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5 truncate">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-xs"
                  style={{ backgroundColor: meta.colorHex }}
                  aria-hidden="true"
                />
                <span className={isLight ? 'text-slate-600 truncate' : 'text-slate-400 truncate'}>
                  {meta.shortLabel}
                </span>
              </span>
              <span
                className={`font-mono-tabular font-semibold ${
                  isLight ? 'text-slate-900' : 'text-slate-100'
                }`}
              >
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PaymentsInspector({
  open,
  level,
  title,
  subtitle,
  profile,
  continentId,
  country,
  city,
  localAreaId,
  activeMetric,
  hourFloat,
  theme,
  onSelectContinent,
  onSelectCountry,
  onSelectCity,
  onSelectLocalArea,
  onStepBack,
  onClose,
}: PaymentsInspectorProps) {
  if (!open) return null;

  const isLight = theme.isLightUI;
  const snapshot = computeSnapshotForHour(profile, hourFloat);

  // Build clickable drill-down child list
  let childSectionTitle = 'Continents';
  let childItems: Array<{
    id: string;
    name: string;
    meta: string;
    onClick: () => void;
    active?: boolean;
  }> = [];

  if (level === HierarchyLevel.WORLD) {
    childSectionTitle = 'Continents (Click to Zoom)';
    childItems = CONTINENTS.map((cont) => {
      const snap = computeSnapshotForHour(cont.profile, hourFloat);
      return {
        id: cont.id,
        name: cont.name,
        meta: `${cont.countries.length} Markets · ${snap.volume.totalFormatted} tx`,
        onClick: () => onSelectContinent(cont.id),
      };
    });
  } else if (level === HierarchyLevel.CONTINENT && continentId) {
    const cont = CONTINENTS.find((c) => c.id === continentId);
    childSectionTitle = `Countries in ${cont?.name || 'Continent'}`;
    childItems = (cont?.countries || []).map((c) => {
      const snap = computeSnapshotForHour(c.profile, hourFloat);
      return {
        id: c.id,
        name: c.name,
        meta: `${c.cities.length} Cities · ${snap.volume.totalFormatted} tx`,
        onClick: () => onSelectCountry(c),
      };
    });
  } else if (level === HierarchyLevel.COUNTRY && country) {
    childSectionTitle = `Cities in ${country.name}`;
    childItems = country.cities.map((ct) => {
      const snap = computeSnapshotForHour(ct.profile, hourFloat);
      return {
        id: ct.id,
        name: ct.name,
        meta: `${ct.localAreas.length} Local Areas · ${snap.volume.totalFormatted} tx`,
        onClick: () => onSelectCity(ct),
      };
    });
  } else if (
    (level === HierarchyLevel.CITY || level === HierarchyLevel.LOCAL_AREA) &&
    city
  ) {
    childSectionTitle = `Local Areas in ${city.name}`;
    childItems = city.localAreas.map((la) => {
      const snap = computeSnapshotForHour(la.profile, hourFloat);
      return {
        id: la.id,
        name: la.name,
        meta: `${la.districtType} · ${snap.volume.totalFormatted} tx`,
        onClick: () => onSelectLocalArea(la),
        active: level === HierarchyLevel.LOCAL_AREA && la.id === localAreaId,
      };
    });
  }

  return (
    <aside
      aria-label="Digital payments analytical breakdown"
      className={`fixed inset-y-0 right-0 z-30 flex h-full w-full shrink-0 flex-col border-l transition-colors duration-300 sm:w-[390px] lg:static lg:z-10 ${
        isLight
          ? 'border-slate-200 bg-white text-slate-900'
          : 'border-slate-800 bg-[#0b1120] text-slate-100'
      }`}
    >
      {/* Inspector Header */}
      <div
        className={`flex flex-col gap-2 border-b px-5 py-4 ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-xs font-medium ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            {level.replace('_', ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())} View
          </span>

          <div className="flex items-center gap-1">
            {level !== HierarchyLevel.WORLD && (
              <button
                type="button"
                onClick={onStepBack}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  isLight
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Up One Level</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close payments breakdown panel"
              className={`rounded-md p-1.5 lg:hidden focus-visible:outline-2 focus-visible:outline-sky-500 ${
                isLight
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <h1 className="font-display text-xl font-bold tracking-tight leading-snug text-balance">
          {title}
        </h1>
        <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          {subtitle} <span aria-hidden="true">·</span> Diurnal Activity{' '}
          <span className="font-mono-tabular font-semibold">
            {Math.round(snapshot.activityIndex * 100)}%
          </span>
        </p>

        {/* Payment Channel Color Key */}
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {ALL_PAYMENT_CHANNELS.map((ch) => {
            const meta = CHANNEL_META[ch];
            return (
              <div key={ch} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: meta.colorHex }}
                  aria-hidden="true"
                />
                <span className={isLight ? 'text-slate-700 truncate' : 'text-slate-300 truncate'}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable Analytical Body */}
      <div className="atlas-scroll flex-1 overflow-y-auto px-5 py-2">
        {/* All 4 Payment Metrics Breakdown */}
        <div className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
          <MetricRow
            breakdown={snapshot.volume}
            isFocused={activeMetric === PaymentMetric.VOLUME}
            isLight={isLight}
          />
          <MetricRow
            breakdown={snapshot.amount}
            isFocused={activeMetric === PaymentMetric.AMOUNT}
            isLight={isLight}
          />
          <MetricRow
            breakdown={snapshot.customerCount}
            isFocused={activeMetric === PaymentMetric.CUSTOMER_COUNT}
            isLight={isLight}
          />
          <MetricRow
            breakdown={snapshot.merchantCount}
            isFocused={activeMetric === PaymentMetric.MERCHANT_COUNT}
            isLight={isLight}
          />
        </div>

        {/* 24-Hour Diurnal Curve */}
        <div
          className={`mt-2 border-t pt-4 pb-3 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}
        >
          <DiurnalCurveChart profile={profile} currentHour={hourFloat} isLight={isLight} />
        </div>

        {/* Drill-Down Children */}
        {childItems.length > 0 && (
          <div
            className={`mt-1 border-t pt-4 pb-6 ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <h2
              className={`mb-2.5 text-xs font-semibold ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              {childSectionTitle}
            </h2>
            <div className="flex flex-col gap-1.5">
              {childItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    item.active
                      ? isLight
                        ? 'border-sky-500 bg-sky-50 text-slate-950'
                        : 'border-sky-500 bg-sky-950/60 text-white'
                      : isLight
                        ? 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-slate-100'
                        : 'border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{item.name}</div>
                      <div
                        className={`truncate text-[11px] ${
                          isLight ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        {item.meta}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 ${
                      isLight ? 'text-slate-400' : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
