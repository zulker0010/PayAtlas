import {
  ChevronRight,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { BreadcrumbItem, HierarchyLevel } from '../types/payments';
import { DiurnalThemeState } from '../utils/timeTheme';

interface TopBarProps {
  breadcrumbs: BreadcrumbItem[];
  theme: DiurnalThemeState;
  inspectorOpen: boolean;
  isFullscreen: boolean;
  onNavigateBreadcrumb: (item: BreadcrumbItem) => void;
  onToggleInspector: () => void;
  onToggleFullscreen: () => void;
}

export function TopBar({
  breadcrumbs,
  theme,
  inspectorOpen,
  isFullscreen,
  onNavigateBreadcrumb,
  onToggleInspector,
  onToggleFullscreen,
}: TopBarProps) {
  const isLight = theme.isLightUI;

  const surfaceClass = isLight
    ? 'border-slate-300/80 bg-[#f8fafc]/94 text-slate-900'
    : 'border-slate-700/70 bg-[#0b1120]/92 text-slate-100';

  const buttonSurfaceClass = isLight
    ? 'border-slate-300/80 bg-[#f8fafc]/94 text-slate-800 hover:bg-white'
    : 'border-slate-700/70 bg-[#0b1120]/92 text-slate-200 hover:bg-slate-900';

  return (
    <header
      className="pointer-events-none absolute top-2.5 right-2.5 left-2.5 z-20 flex items-start justify-between gap-2 sm:top-4 sm:right-4 sm:left-4 sm:gap-3"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className={`pointer-events-auto flex min-w-0 max-w-[calc(100%-108px)] flex-col gap-1 rounded-xl border px-3 py-2 shadow-sm transition-colors duration-300 sm:max-w-none sm:gap-1.5 sm:px-4 sm:py-2.5 ${surfaceClass}`}
      >
        <div className="flex items-center gap-2.5 sm:gap-4">
          <button
            type="button"
            onClick={() =>
              onNavigateBreadcrumb({
                level: HierarchyLevel.WORLD,
                id: 'world',
                label: 'World',
              })
            }
            className="flex items-center gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 whitespace-nowrap shrink-0 sm:gap-2"
          >
            <MapIcon className="h-4 w-4 text-sky-500 shrink-0" aria-hidden="true" />
            <span className="font-display text-xs font-bold tracking-tight whitespace-nowrap sm:text-sm">
              Meridian PayAtlas
            </span>
          </button>

          <span
            className={`hidden text-xs font-mono-tabular whitespace-nowrap sm:inline ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            {theme.formattedTime} <span aria-hidden="true">·</span> {theme.phaseLabel}
          </span>
        </div>

        <nav
          aria-label="Geographic drill-down breadcrumb"
          className="no-scrollbar flex items-center gap-1 overflow-x-auto text-xs"
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.level}-${crumb.id}`} className="flex shrink-0 items-center gap-1">
                {idx > 0 && (
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isLight ? 'text-slate-400' : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onNavigateBreadcrumb(crumb)}
                  disabled={isLast}
                  className={`rounded px-1.5 py-0.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 ${
                    isLast
                      ? isLight
                        ? 'font-semibold text-slate-900 cursor-default'
                        : 'font-semibold text-white cursor-default'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            );
          })}
        </nav>
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          className={`flex items-center justify-center rounded-xl border p-2.5 text-xs font-medium shadow-sm transition-colors duration-200 shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 ${buttonSurfaceClass}`}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4 text-sky-500" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4 text-sky-500" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleInspector}
          aria-label={inspectorOpen ? 'Hide payments breakdown panel' : 'Show payments breakdown panel'}
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-xs font-medium shadow-sm transition-colors duration-200 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-500 sm:gap-2 sm:px-3.5 ${buttonSurfaceClass}`}
        >
          {inspectorOpen ? (
            <>
              <PanelRightClose className="h-4 w-4 text-sky-500" aria-hidden="true" />
              <span className="hidden sm:inline">Hide Data Panel</span>
              <span className="sm:hidden">Panel</span>
            </>
          ) : (
            <>
              <PanelRightOpen className="h-4 w-4 text-sky-500" aria-hidden="true" />
              <span className="hidden sm:inline">Show Data Panel</span>
              <span className="sm:hidden">Data</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
