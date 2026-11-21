import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { HoverTooltip } from './components/HoverTooltip';
import { PaymentsInspector } from './components/PaymentsInspector';
import { TopBar } from './components/TopBar';
import { VectorPayMap, VectorPayMapControls } from './components/VectorPayMap';
import {
  CONTINENTS,
  resolveSelectionData,
} from './data/paymentsDataset';
import {
  BreadcrumbItem,
  CityNode,
  CountryNode,
  HierarchyLevel,
  HoverInfo,
  LocalAreaNode,
  MapThemeId,
  PaymentMetric,
  TimeMode,
} from './types/payments';
import { computeDiurnalTheme, getBrowserDecimalHour } from './utils/timeTheme';

export default function App() {
  const mapControlsRef = useRef<VectorPayMapControls | null>(null);
  const [syntheticCountries, setSyntheticCountries] = useState<Record<string, CountryNode>>({});

  // Hierarchy selection state
  const [level, setLevel] = useState<HierarchyLevel>(HierarchyLevel.WORLD);
  const [continentId, setContinentId] = useState<string | null>(null);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [localAreaId, setLocalAreaId] = useState<string | null>(null);

  // Metric, Map Theme & Diurnal time-of-day state
  const [activeMetric, setActiveMetric] = useState<PaymentMetric>(PaymentMetric.VOLUME);
  const [mapTheme, setMapTheme] = useState<MapThemeId>('obsidian');
  const [timeMode, setTimeMode] = useState<TimeMode>(TimeMode.BROWSER_CLOCK);
  const [hourFloat, setHourFloat] = useState<number>(() => getBrowserDecimalHour());

  // UI chrome state
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [viewportSize, setViewportSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  const theme = useMemo(() => {
    const diurnal = computeDiurnalTheme(hourFloat);
    return {
      ...diurnal,
      isLightUI: mapTheme === 'atlas',
    };
  }, [hourFloat, mapTheme]);

  // Sync Tailwind dark class on <html> with diurnal theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme.isLightUI) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
  }, [theme.isLightUI]);

  // Browser clock & Auto-Transition animation loop
  useEffect(() => {
    if (timeMode === TimeMode.MANUAL) return;

    if (timeMode === TimeMode.BROWSER_CLOCK) {
      setHourFloat(getBrowserDecimalHour());
      const id = window.setInterval(() => {
        setHourFloat(getBrowserDecimalHour());
      }, 15000);
      return () => window.clearInterval(id);
    }

    // TimeMode.AUTO_CYCLE: smooth continuous diurnal sweep
    let rafId = 0;
    let lastTime = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      setHourFloat((prev) => (prev + dt * 0.65) % 24);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [timeMode]);

  // Track viewport size & fullscreen state
  useEffect(() => {
    const onResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    };
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
          return;
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
        return;
      }
    } catch {
      // Fallback when browser/iframe blocks native Fullscreen API
    }
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        setInspectorOpen(false);
        setDockCollapsed(true);
      } else {
        setDockCollapsed(window.innerWidth < 640);
      }
      return next;
    });
  }, []);

  // Navigation handlers
  const handleSelectWorld = useCallback(() => {
    setLevel(HierarchyLevel.WORLD);
    setContinentId(null);
    setCountryId(null);
    setCityId(null);
    setLocalAreaId(null);
    setHoverInfo(null);
  }, []);

  const handleSelectContinent = useCallback((contId: string) => {
    setLevel(HierarchyLevel.CONTINENT);
    setContinentId(contId);
    setCountryId(null);
    setCityId(null);
    setLocalAreaId(null);
    setHoverInfo(null);
  }, []);

  const handleSelectCountry = useCallback((country: CountryNode) => {
    setSyntheticCountries((prev) =>
      prev[country.id] ? prev : { ...prev, [country.id]: country }
    );
    setLevel(HierarchyLevel.COUNTRY);
    setContinentId(country.continentId);
    setCountryId(country.id);
    setCityId(null);
    setLocalAreaId(null);
    setHoverInfo(null);
  }, []);

  const handleSelectCity = useCallback((city: CityNode) => {
    setLevel(HierarchyLevel.CITY);
    setCountryId(city.countryId);
    setCityId(city.id);
    setLocalAreaId(null);
    setHoverInfo(null);
  }, []);

  const handleSelectLocalArea = useCallback((area: LocalAreaNode) => {
    setLevel(HierarchyLevel.LOCAL_AREA);
    setLocalAreaId(area.id);
    setHoverInfo(null);
  }, []);

  const handleStepBack = useCallback(() => {
    setHoverInfo(null);
    if (level === HierarchyLevel.LOCAL_AREA) {
      setLevel(HierarchyLevel.CITY);
      setLocalAreaId(null);
    } else if (level === HierarchyLevel.CITY) {
      setLevel(HierarchyLevel.COUNTRY);
      setCityId(null);
      setLocalAreaId(null);
    } else if (level === HierarchyLevel.COUNTRY) {
      if (continentId) {
        setLevel(HierarchyLevel.CONTINENT);
        setCountryId(null);
      } else {
        handleSelectWorld();
      }
    } else if (level === HierarchyLevel.CONTINENT) {
      handleSelectWorld();
    }
  }, [level, continentId, handleSelectWorld]);

  const handleNavigateBreadcrumb = useCallback(
    (item: BreadcrumbItem) => {
      setHoverInfo(null);
      if (item.level === HierarchyLevel.WORLD) {
        handleSelectWorld();
      } else if (item.level === HierarchyLevel.CONTINENT) {
        handleSelectContinent(item.id);
      } else if (item.level === HierarchyLevel.COUNTRY) {
        setLevel(HierarchyLevel.COUNTRY);
        setCountryId(item.id);
        setCityId(null);
        setLocalAreaId(null);
      } else if (item.level === HierarchyLevel.CITY) {
        setLevel(HierarchyLevel.CITY);
        setCityId(item.id);
        setLocalAreaId(null);
      }
    },
    [handleSelectContinent, handleSelectWorld]
  );

  // Keyboard shortcuts: H toggles bottom dock, Escape steps up hierarchy
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'Escape') {
        handleStepBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStepBack]);

  // Adapt syntheticCountries record into Map for resolveSelectionData helper
  const syntheticCountriesMap = useMemo(() => {
    const m = new Map<string, CountryNode>();
    for (const [k, v] of Object.entries(syntheticCountries)) {
      m.set(k, v);
    }
    return m;
  }, [syntheticCountries]);

  // Resolve current hierarchy data & breadcrumbs
  const resolved = useMemo(
    () =>
      resolveSelectionData(
        level,
        continentId,
        countryId,
        cityId,
        localAreaId,
        syntheticCountriesMap
      ),
    [level, continentId, countryId, cityId, localAreaId, syntheticCountriesMap]
  );

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [
      { level: HierarchyLevel.WORLD, id: 'world', label: 'World' },
    ];
    if (resolved.continent) {
      items.push({
        level: HierarchyLevel.CONTINENT,
        id: resolved.continent.id,
        label: resolved.continent.name,
      });
    } else if (continentId) {
      const c = CONTINENTS.find((x) => x.id === continentId);
      if (c) items.push({ level: HierarchyLevel.CONTINENT, id: c.id, label: c.name });
    }
    if (resolved.country) {
      items.push({
        level: HierarchyLevel.COUNTRY,
        id: resolved.country.id,
        label: resolved.country.name,
      });
    }
    if (resolved.city) {
      items.push({
        level: HierarchyLevel.CITY,
        id: resolved.city.id,
        label: resolved.city.name,
      });
    }
    if (resolved.localArea) {
      items.push({
        level: HierarchyLevel.LOCAL_AREA,
        id: resolved.localArea.id,
        label: resolved.localArea.name,
      });
    }
    return items;
  }, [resolved, continentId]);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-[#060913] text-slate-100">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Main 2D Vector World Map Viewport */}
        <main
          className={`relative h-full min-w-0 flex-1 overflow-hidden transition-colors duration-300 ${
            mapTheme === 'atlas'
              ? 'bg-[#c8d9eb]'
              : mapTheme === 'blueprint'
                ? 'bg-[#061936]'
                : 'bg-[#060a13]'
          }`}
        >
          <VectorPayMap
            level={level}
            continentId={continentId}
            countryId={countryId}
            cityId={cityId}
            localAreaId={localAreaId}
            activeMetric={activeMetric}
            mapTheme={mapTheme}
            hourFloat={hourFloat}
            theme={theme}
            syntheticCountries={syntheticCountries}
            controlsRef={mapControlsRef}
            onSelectContinent={handleSelectContinent}
            onSelectCountry={handleSelectCountry}
            onSelectCity={handleSelectCity}
            onSelectLocalArea={handleSelectLocalArea}
            onHoverChange={setHoverInfo}
          />

          <TopBar
            breadcrumbs={breadcrumbs}
            theme={theme}
            inspectorOpen={inspectorOpen}
            isFullscreen={isFullscreen}
            onNavigateBreadcrumb={handleNavigateBreadcrumb}
            onToggleInspector={() => setInspectorOpen((prev) => !prev)}
            onToggleFullscreen={handleToggleFullscreen}
          />

          <BottomDock
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
            activeMetric={activeMetric}
            onChangeMetric={setActiveMetric}
            mapTheme={mapTheme}
            onChangeMapTheme={setMapTheme}
            timeMode={timeMode}
            onChangeTimeMode={setTimeMode}
            hourFloat={hourFloat}
            onScrubHour={setHourFloat}
            theme={theme}
            canResetToWorld={level !== HierarchyLevel.WORLD}
            onResetWorld={handleSelectWorld}
            onZoomIn={() => mapControlsRef.current?.zoomIn()}
            onZoomOut={() => mapControlsRef.current?.zoomOut()}
          />

          <HoverTooltip
            hover={hoverInfo}
            activeMetric={activeMetric}
            theme={theme}
            viewportWidth={viewportSize.w}
            viewportHeight={viewportSize.h}
          />
        </main>

        {/* Docked Analytical Payments Inspector */}
        <PaymentsInspector
          open={inspectorOpen}
          level={level}
          title={resolved.title}
          subtitle={resolved.subtitle}
          profile={resolved.profile}
          continentId={resolved.continent?.id || continentId}
          country={resolved.country}
          city={resolved.city}
          localAreaId={resolved.localArea?.id || localAreaId}
          activeMetric={activeMetric}
          hourFloat={hourFloat}
          theme={theme}
          onSelectContinent={handleSelectContinent}
          onSelectCountry={handleSelectCountry}
          onSelectCity={handleSelectCity}
          onSelectLocalArea={handleSelectLocalArea}
          onStepBack={handleStepBack}
          onClose={() => setInspectorOpen(false)}
        />
      </div>
    </div>
  );
}
