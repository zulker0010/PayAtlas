import {
  ALL_PAYMENT_CHANNELS,
  CHANNEL_META,
  ChannelSplit,
  CityNode,
  ComputedMetricBreakdown,
  ComputedPaymentSnapshot,
  ContinentNode,
  CountryNode,
  HierarchyLevel,
  LocalAreaNode,
  METRIC_META,
  PaymentChannel,
  PaymentMetric,
  PaymentProfile,
} from '../types/payments';
import { GeoCountryFeature, getGeoCountries } from './geoIndex';

function normalizeSplit(raw: ChannelSplit): ChannelSplit {
  const keys = ALL_PAYMENT_CHANNELS.map((ch) => CHANNEL_META[ch].key);
  const sumRaw = keys.reduce((acc, k) => acc + Math.max(0, raw[k] || 0), 0) || 1;

  const rounded: Record<keyof ChannelSplit, number> = {
    mobileWallets: 0,
    mfs: 0,
    cardPayments: 0,
    nfcContactless: 0,
    bankingApps: 0,
    paymentGateways: 0,
    pspPso: 0,
  };

  let largestKey: keyof ChannelSplit = keys[0];
  let largestVal = -1;
  let roundedSum = 0;

  for (const k of keys) {
    const val = Math.round(((Math.max(0, raw[k] || 0) / sumRaw) * 100) * 10) / 10;
    rounded[k] = val;
    roundedSum += val;
    if (val > largestVal) {
      largestVal = val;
      largestKey = k;
    }
  }

  const diff = Math.round((100 - roundedSum) * 10) / 10;
  rounded[largestKey] = Math.max(0, Math.round((rounded[largestKey] + diff) * 10) / 10);

  return rounded;
}

function mix7(
  mobileWallets: number,
  mfs: number,
  cardPayments: number,
  nfcContactless: number,
  bankingApps: number,
  paymentGateways: number,
  pspPso: number
): ChannelSplit {
  return normalizeSplit({
    mobileWallets,
    mfs,
    cardPayments,
    nfcContactless,
    bankingApps,
    paymentGateways,
    pspPso,
  });
}

function expandFourToSeven(
  base4: [number, number, number, number],
  districtType: string,
  metricKind: 'volume' | 'amount' | 'customer' | 'merchant',
  diurnalBias: PaymentProfile['diurnalBias']
): ChannelSplit {
  const [mw, mf, cp, nf] = base4;
  const dt = districtType.toLowerCase();

  const isFinancial =
    /finan|bank|corporate|institutional|freezone|exchange|vc|central/.test(dt);
  const isTechOrEcommerce =
    /tech|startup|campus|innovation|saas|media|design|creative|digital|fintech|nomad/.test(dt);
  const isWholesaleOrTrade =
    /trade|wholesale|market|bazaar|commodity|electronics|port|maritime|logistics|garment|souk|cross-border/.test(dt);
  const isRetailOrHospitality =
    /retail|dining|nightlife|luxury|mall|boutique|shopping|tourism|hospitality|aviation|cafes/.test(dt);

  // Calibrated baseline shares for the 3 institutional/infrastructure digital channels
  let bankingApps = 12.5;
  let paymentGateways = 10.5;
  let pspPso = 9.0;

  if (isFinancial) {
    bankingApps += 7.5;
    paymentGateways += 2.0;
    pspPso += 4.0;
  }
  if (isTechOrEcommerce) {
    bankingApps += 3.0;
    paymentGateways += 8.0;
    pspPso += 3.5;
  }
  if (isWholesaleOrTrade) {
    bankingApps += 2.5;
    paymentGateways += 2.5;
    pspPso += 7.5;
  }
  if (isRetailOrHospitality) {
    bankingApps += 1.0;
    paymentGateways += 4.5;
    pspPso += 3.0;
  }

  // Regional digital infrastructure alignment from base 4 rails
  if (mf >= 35) {
    // High-MFS markets: strong PSO switches & agent/bank app interoperability
    bankingApps -= 1.5;
    paymentGateways -= 1.5;
    pspPso += 3.5;
  } else if (mw >= 52) {
    // Super-app wallet markets: high gateway API & aggregator volume
    paymentGateways += 3.0;
    bankingApps += 1.5;
  } else if (nf >= 32) {
    // High-NFC / open-banking markets: strong commercial bank apps & omnichannel gateways
    bankingApps += 3.5;
    paymentGateways += 2.5;
  }

  if (diurnalBias === 'commerce') {
    bankingApps += 1.5;
    paymentGateways += 1.5;
    pspPso += 1.0;
  } else if (diurnalBias === 'remittance') {
    bankingApps += 1.0;
    pspPso += 2.5;
  }

  // Metric-specific behavioral weighting
  if (metricKind === 'amount') {
    bankingApps *= 1.38; // Higher average ticket size via bank apps / A2A
    pspPso *= 1.18; // Wholesale & merchant settlement value
    paymentGateways *= 1.08;
  } else if (metricKind === 'customer') {
    bankingApps *= 1.18; // Broad banked customer base
    paymentGateways *= 0.92;
    pspPso *= 0.68; // Infrastructure rails have fewer direct consumer touchpoints
  } else if (metricKind === 'merchant') {
    paymentGateways *= 1.34; // Online & omnichannel checkout acceptance
    pspPso *= 1.48; // Aggregators / PSOs power merchant acquiring
    bankingApps *= 0.78;
  }

  const newTotal = Math.min(54, bankingApps + paymentGateways + pspPso);
  const scaleExisting = (100 - newTotal) / Math.max(1, mw + mf + cp + nf);

  return normalizeSplit({
    mobileWallets: mw * scaleExisting,
    mfs: mf * scaleExisting,
    cardPayments: cp * scaleExisting,
    nfcContactless: nf * scaleExisting,
    bankingApps,
    paymentGateways,
    pspPso,
  });
}

function area(
  id: string,
  name: string,
  districtType: string,
  lat: number,
  lon: number,
  annualVolumeCount: number,
  dailyAmountUsd: number,
  activeCustomers: number,
  activeMerchants: number,
  vol: [number, number, number, number],
  amt: [number, number, number, number],
  cust: [number, number, number, number],
  merch: [number, number, number, number],
  diurnalBias: PaymentProfile['diurnalBias']
): LocalAreaNode {
  return {
    id,
    name,
    districtType,
    lat,
    lon,
    profile: {
      annualVolumeCount,
      dailyAmountUsd,
      activeCustomers,
      activeMerchants,
      volumeMix: expandFourToSeven(vol, districtType, 'volume', diurnalBias),
      amountMix: expandFourToSeven(amt, districtType, 'amount', diurnalBias),
      customerMix: expandFourToSeven(cust, districtType, 'customer', diurnalBias),
      merchantMix: expandFourToSeven(merch, districtType, 'merchant', diurnalBias),
      diurnalBias,
    },
  };
}

function area7(
  id: string,
  name: string,
  districtType: string,
  lat: number,
  lon: number,
  annualVolumeCount: number,
  dailyAmountUsd: number,
  activeCustomers: number,
  activeMerchants: number,
  vol: [number, number, number, number, number, number, number],
  amt: [number, number, number, number, number, number, number],
  cust: [number, number, number, number, number, number, number],
  merch: [number, number, number, number, number, number, number],
  diurnalBias: PaymentProfile['diurnalBias']
): LocalAreaNode {
  return {
    id,
    name,
    districtType,
    lat,
    lon,
    profile: {
      annualVolumeCount,
      dailyAmountUsd,
      activeCustomers,
      activeMerchants,
      volumeMix: mix7(...vol),
      amountMix: mix7(...amt),
      customerMix: mix7(...cust),
      merchantMix: mix7(...merch),
      diurnalBias,
    },
  };
}

function averageSplits(items: Array<{ weight: number; split: ChannelSplit }>): ChannelSplit {
  let wTotal = 0;
  let mw = 0;
  let mf = 0;
  let cp = 0;
  let nf = 0;
  let ba = 0;
  let pg = 0;
  let pp = 0;
  for (const item of items) {
    const wt = Math.max(1, item.weight);
    wTotal += wt;
    mw += item.split.mobileWallets * wt;
    mf += item.split.mfs * wt;
    cp += item.split.cardPayments * wt;
    nf += item.split.nfcContactless * wt;
    ba += item.split.bankingApps * wt;
    pg += item.split.paymentGateways * wt;
    pp += item.split.pspPso * wt;
  }
  return normalizeSplit({
    mobileWallets: mw / wTotal,
    mfs: mf / wTotal,
    cardPayments: cp / wTotal,
    nfcContactless: nf / wTotal,
    bankingApps: ba / wTotal,
    paymentGateways: pg / wTotal,
    pspPso: pp / wTotal,
  });
}

function buildCity(
  id: string,
  name: string,
  countryId: string,
  lat: number,
  lon: number,
  populationLabel: string,
  diurnalBias: PaymentProfile['diurnalBias'],
  localAreas: LocalAreaNode[]
): CityNode {
  const volSum = localAreas.reduce((s, a) => s + a.profile.annualVolumeCount, 0);
  const amtSum = localAreas.reduce((s, a) => s + a.profile.dailyAmountUsd, 0);
  const custSum = localAreas.reduce((s, a) => s + a.profile.activeCustomers, 0);
  const merchSum = localAreas.reduce((s, a) => s + a.profile.activeMerchants, 0);

  return {
    id,
    name,
    countryId,
    lat,
    lon,
    populationLabel,
    localAreas,
    profile: {
      annualVolumeCount: volSum * 2.4,
      dailyAmountUsd: amtSum * 2.4,
      activeCustomers: custSum * 2.2,
      activeMerchants: merchSum * 2.1,
      volumeMix: averageSplits(
        localAreas.map((a) => ({ weight: a.profile.annualVolumeCount, split: a.profile.volumeMix }))
      ),
      amountMix: averageSplits(
        localAreas.map((a) => ({ weight: a.profile.dailyAmountUsd, split: a.profile.amountMix }))
      ),
      customerMix: averageSplits(
        localAreas.map((a) => ({ weight: a.profile.activeCustomers, split: a.profile.customerMix }))
      ),
      merchantMix: averageSplits(
        localAreas.map((a) => ({ weight: a.profile.activeMerchants, split: a.profile.merchantMix }))
      ),
      diurnalBias,
    },
  };
}

function buildCountry(
  id: string,
  isoNumeric: string,
  name: string,
  continentId: string,
  lat: number,
  lon: number,
  currencyCode: string,
  scaleMultiplier: number,
  diurnalBias: PaymentProfile['diurnalBias'],
  cities: CityNode[]
): CountryNode {
  const volSum = cities.reduce((s, c) => s + c.profile.annualVolumeCount, 0);
  const amtSum = cities.reduce((s, c) => s + c.profile.dailyAmountUsd, 0);
  const custSum = cities.reduce((s, c) => s + c.profile.activeCustomers, 0);
  const merchSum = cities.reduce((s, c) => s + c.profile.activeMerchants, 0);

  return {
    id,
    isoNumeric,
    name,
    continentId,
    lat,
    lon,
    currencyCode,
    cities,
    profile: {
      annualVolumeCount: volSum * scaleMultiplier,
      dailyAmountUsd: amtSum * scaleMultiplier,
      activeCustomers: custSum * scaleMultiplier * 0.85,
      activeMerchants: merchSum * scaleMultiplier * 0.8,
      volumeMix: averageSplits(
        cities.map((c) => ({ weight: c.profile.annualVolumeCount, split: c.profile.volumeMix }))
      ),
      amountMix: averageSplits(
        cities.map((c) => ({ weight: c.profile.dailyAmountUsd, split: c.profile.amountMix }))
      ),
      customerMix: averageSplits(
        cities.map((c) => ({ weight: c.profile.activeCustomers, split: c.profile.customerMix }))
      ),
      merchantMix: averageSplits(
        cities.map((c) => ({ weight: c.profile.activeMerchants, split: c.profile.merchantMix }))
      ),
      diurnalBias,
    },
  };
}

function buildContinent(
  id: string,
  name: string,
  lat: number,
  lon: number,
  cameraDistance: number,
  diurnalBias: PaymentProfile['diurnalBias'],
  countries: CountryNode[]
): ContinentNode {
  const volSum = countries.reduce((s, c) => s + c.profile.annualVolumeCount, 0);
  const amtSum = countries.reduce((s, c) => s + c.profile.dailyAmountUsd, 0);
  const custSum = countries.reduce((s, c) => s + c.profile.activeCustomers, 0);
  const merchSum = countries.reduce((s, c) => s + c.profile.activeMerchants, 0);

  return {
    id,
    name,
    lat,
    lon,
    cameraDistance,
    countries,
    profile: {
      annualVolumeCount: volSum * 1.35,
      dailyAmountUsd: amtSum * 1.35,
      activeCustomers: custSum * 1.3,
      activeMerchants: merchSum * 1.25,
      volumeMix: averageSplits(
        countries.map((c) => ({ weight: c.profile.annualVolumeCount, split: c.profile.volumeMix }))
      ),
      amountMix: averageSplits(
        countries.map((c) => ({ weight: c.profile.dailyAmountUsd, split: c.profile.amountMix }))
      ),
      customerMix: averageSplits(
        countries.map((c) => ({ weight: c.profile.activeCustomers, split: c.profile.customerMix }))
      ),
      merchantMix: averageSplits(
        countries.map((c) => ({ weight: c.profile.activeMerchants, split: c.profile.merchantMix }))
      ),
      diurnalBias,
    },
  };
}

// ============================================================================
// CURATED GLOBAL PAYMENT ECOSYSTEMS (6 CONTINENTS, 24 FLAGSHIP COUNTRIES)
// ============================================================================

export const CONTINENTS: ContinentNode[] = [
  buildContinent('asia', 'Asia', 30.5, 98.0, 22, 'commerce', [
    buildCountry('cn', '156', 'China', 'asia', 35.0, 104.0, 'CNY', 6.5, 'commerce', [
      buildCity('shanghai', 'Shanghai', 'cn', 31.23, 121.47, '24.9M Metro', 'commerce', [
        area('sh-lujiazui', 'Lujiazui Financial', 'Financial Core', 31.24, 121.50, 42_000_000, 1_950_000_000, 3_400_000, 118_000, [56, 3, 24, 17], [44, 2, 42, 12], [58, 4, 22, 16], [52, 3, 28, 17], 'commerce'),
        area('sh-nanjing', 'Nanjing Road', 'Retail Corridor', 31.235, 121.475, 58_000_000, 1_320_000_000, 4_900_000, 185_000, [68, 2, 14, 16], [58, 2, 26, 14], [70, 3, 12, 15], [72, 2, 12, 14], 'nightlife'),
        area('sh-zhangjiang', 'Zhangjiang Hi-Tech', 'Tech Campus', 31.20, 121.60, 29_000_000, 840_000_000, 2_100_000, 64_000, [64, 2, 12, 22], [56, 2, 24, 18], [66, 2, 10, 22], [62, 2, 14, 22], 'commuter'),
      ]),
      buildCity('beijing', 'Beijing', 'cn', 39.90, 116.40, '21.8M Metro', 'commuter', [
        area('bj-guomao', 'Guomao CBD', 'Financial Core', 39.91, 116.46, 38_000_000, 1_780_000_000, 3_100_000, 104_000, [58, 2, 22, 18], [46, 2, 39, 13], [60, 3, 20, 17], [55, 2, 26, 17], 'commerce'),
        area('bj-zhongguancun', 'Zhongguancun', 'Tech & University', 39.98, 116.31, 44_000_000, 960_000_000, 3_800_000, 132_000, [71, 2, 10, 17], [63, 2, 21, 14], [73, 2, 9, 16], [70, 2, 11, 17], 'commuter'),
        area('bj-sanlitun', 'Sanlitun', 'Nightlife & Dining', 39.93, 116.45, 31_000_000, 740_000_000, 2_600_000, 92_000, [67, 2, 15, 16], [56, 2, 28, 14], [69, 2, 14, 15], [68, 2, 15, 15], 'nightlife'),
      ]),
      buildCity('shenzhen', 'Shenzhen', 'cn', 22.54, 114.05, '17.7M Metro', 'commuter', [
        area('sz-futian', 'Futian CBD', 'Financial & Transit', 22.54, 114.05, 45_000_000, 1_540_000_000, 3_600_000, 128_000, [63, 2, 14, 21], [52, 2, 31, 15], [64, 2, 13, 21], [61, 2, 16, 21], 'commuter'),
        area('sz-nanshan', 'Nanshan Tech Park', 'Innovation District', 22.53, 113.94, 39_000_000, 1_120_000_000, 3_200_000, 98_000, [69, 2, 11, 18], [60, 2, 23, 15], [71, 2, 10, 17], [68, 2, 13, 17], 'commerce'),
        area('sz-huaqiangbei', 'Huaqiangbei', 'Electronics Market', 22.545, 114.085, 51_000_000, 1_260_000_000, 4_100_000, 195_000, [72, 3, 13, 12], [61, 3, 26, 10], [74, 3, 11, 12], [75, 3, 11, 11], 'commerce'),
      ]),
    ]),
    buildCountry('in', '356', 'India', 'asia', 21.0, 78.9, 'INR', 5.8, 'balanced', [
      buildCity('mumbai', 'Mumbai', 'in', 19.07, 72.87, '21.3M Metro', 'commerce', [
        area('bom-bkc', 'Bandra-Kurla Complex', 'Financial Hub', 19.065, 72.868, 32_000_000, 980_000_000, 2_900_000, 94_000, [52, 11, 23, 14], [38, 8, 41, 13], [54, 12, 21, 13], [50, 12, 24, 14], 'commerce'),
        area('bom-colaba', 'Colaba & Fort', 'Heritage Retail', 18.92, 72.83, 28_000_000, 520_000_000, 2_600_000, 142_000, [61, 14, 15, 10], [49, 11, 30, 10], [63, 15, 13, 9], [64, 15, 13, 8], 'nightlife'),
        area('bom-andheri', 'Andheri West', 'Transit & Media', 19.13, 72.83, 41_000_000, 610_000_000, 3_700_000, 178_000, [63, 15, 11, 11], [54, 13, 23, 10], [65, 15, 10, 10], [66, 16, 10, 8], 'commuter'),
      ]),
      buildCity('bengaluru', 'Bengaluru', 'in', 12.97, 77.59, '13.6M Metro', 'commuter', [
        area('blr-koramangala', 'Koramangala', 'Startup Corridor', 12.935, 77.624, 34_000_000, 640_000_000, 2_800_000, 124_000, [66, 9, 13, 12], [55, 7, 26, 12], [68, 10, 11, 11], [67, 10, 13, 10], 'nightlife'),
        area('blr-ecity', 'Electronic City', 'IT Campus', 12.845, 77.66, 26_000_000, 490_000_000, 2_100_000, 76_000, [62, 10, 14, 14], [51, 8, 28, 13], [64, 10, 13, 13], [62, 11, 14, 13], 'commuter'),
        area('blr-mgroad', 'MG Road & Indiranagar', 'Commercial Hub', 12.975, 77.61, 29_000_000, 580_000_000, 2_400_000, 108_000, [58, 9, 18, 15], [44, 7, 35, 14], [60, 10, 16, 14], [59, 10, 18, 13], 'commerce'),
      ]),
      buildCity('delhi', 'New Delhi', 'in', 28.61, 77.20, '32.9M Metro', 'balanced', [
        area('del-cp', 'Connaught Place', 'Central Commerce', 28.63, 77.219, 36_000_000, 790_000_000, 3_300_000, 146_000, [56, 13, 19, 12], [43, 10, 36, 11], [58, 14, 17, 11], [57, 15, 18, 10], 'commerce'),
        area('del-chandni', 'Chandni Chowk', 'Wholesale Bazaar', 28.65, 77.23, 45_000_000, 680_000_000, 4_100_000, 235_000, [59, 22, 12, 7], [48, 19, 27, 6], [61, 23, 10, 6], [63, 24, 8, 5], 'commerce'),
        area('del-aerocity', 'Aerocity', 'Aviation & Hospitality', 28.55, 77.12, 16_000_000, 460_000_000, 1_300_000, 42_000, [41, 6, 31, 22], [30, 4, 48, 18], [43, 7, 29, 21], [40, 6, 33, 21], 'commuter'),
      ]),
    ]),
    buildCountry('bd', '050', 'Bangladesh', 'asia', 23.68, 90.35, 'BDT', 3.4, 'remittance', [
      buildCity('dhaka', 'Dhaka', 'bd', 23.81, 90.41, '23.2M Metro', 'remittance', [
        area('dac-motijheel', 'Motijheel Financial', 'Banking Core', 23.733, 90.417, 18_500_000, 390_000_000, 2_100_000, 88_000, [24, 48, 21, 7], [18, 41, 35, 6], [26, 50, 18, 6], [24, 54, 16, 6], 'commerce'),
        area('dac-gulshan', 'Gulshan & Banani', 'Corporate & Retail', 23.792, 90.408, 14_200_000, 310_000_000, 1_450_000, 64_000, [34, 31, 23, 12], [27, 24, 38, 11], [36, 32, 21, 11], [34, 34, 21, 11], 'nightlife'),
        area('dac-dhanmondi', 'Dhanmondi', 'Education & Dining', 23.746, 90.376, 16_800_000, 220_000_000, 1_900_000, 96_000, [31, 46, 15, 8], [26, 41, 25, 8], [33, 48, 12, 7], [32, 50, 12, 6], 'nightlife'),
        area('dac-old', 'Old Dhaka Chawkbazar', 'Trade & Wholesale', 23.716, 90.395, 21_400_000, 340_000_000, 2_550_000, 165_000, [18, 66, 12, 4], [15, 59, 23, 3], [19, 68, 10, 3], [17, 72, 8, 3], 'remittance'),
      ]),
      buildCity('chattogram', 'Chattogram', 'bd', 22.35, 91.78, '5.4M Metro', 'remittance', [
        area('cgp-agrabad', 'Agrabad Commercial', 'Port & Trade Hub', 22.324, 91.812, 8_400_000, 210_000_000, 980_000, 48_000, [22, 51, 21, 6], [17, 44, 34, 5], [24, 53, 18, 5], [21, 57, 17, 5], 'commerce'),
        area('cgp-gec', 'GEC Circle', 'Urban Retail', 22.359, 91.821, 6_900_000, 125_000_000, 820_000, 42_000, [29, 47, 16, 8], [23, 41, 28, 8], [31, 49, 13, 7], [29, 52, 13, 6], 'nightlife'),
        area('cgp-khatunganj', 'Khatunganj', 'Commodity Market', 22.33, 91.843, 9_200_000, 245_000_000, 1_120_000, 74_000, [16, 68, 13, 3], [13, 61, 24, 2], [17, 70, 11, 2], [15, 74, 9, 2], 'remittance'),
      ]),
      buildCity('sylhet', 'Sylhet', 'bd', 24.89, 91.87, '1.2M Metro', 'remittance', [
        area('zyl-zinda', 'Zindabazar', 'Retail & Remittance', 24.895, 91.869, 4_600_000, 118_000_000, 590_000, 34_000, [23, 56, 15, 6], [18, 51, 26, 5], [25, 58, 12, 5], [22, 62, 11, 5], 'remittance'),
        area('zyl-amber', 'Amberkhana', 'Transit Corridor', 24.904, 91.867, 3_400_000, 72_000_000, 430_000, 24_000, [21, 61, 13, 5], [17, 56, 22, 5], [22, 63, 10, 5], [20, 66, 10, 4], 'commuter'),
      ]),
    ]),
    buildCountry('jp', '392', 'Japan', 'asia', 36.2, 138.25, 'JPY', 4.1, 'commuter', [
      buildCity('tokyo', 'Tokyo', 'jp', 35.676, 139.65, '37.1M Metro', 'commuter', [
        area('tyo-shibuya', 'Shibuya Crossing', 'Youth & Retail', 35.659, 139.70, 31_000_000, 920_000_000, 2_800_000, 102_000, [41, 4, 21, 34], [32, 3, 38, 27], [43, 4, 19, 34], [42, 4, 22, 32], 'nightlife'),
        area('tyo-marunouchi', 'Marunouchi CBD', 'Corporate & Rail', 35.681, 139.765, 28_000_000, 1_450_000_000, 2_300_000, 68_000, [34, 3, 29, 34], [24, 2, 48, 26], [35, 3, 27, 35], [33, 3, 30, 34], 'commuter'),
        area('tyo-akihabara', 'Akihabara', 'Electronics District', 35.698, 139.773, 22_000_000, 680_000_000, 1_950_000, 74_000, [38, 3, 26, 33], [29, 2, 42, 27], [40, 3, 24, 33], [39, 3, 26, 32], 'commerce'),
      ]),
      buildCity('osaka', 'Osaka', 'jp', 34.69, 135.50, '19.1M Metro', 'commerce', [
        area('osa-umeda', 'Umeda Station Core', 'Transit & Retail', 34.702, 135.496, 21_000_000, 690_000_000, 1_850_000, 66_000, [39, 3, 24, 34], [29, 2, 41, 28], [41, 3, 22, 34], [40, 3, 24, 33], 'commuter'),
        area('osa-namba', 'Namba & Dotonbori', 'Dining & Tourism', 34.668, 135.501, 19_500_000, 540_000_000, 1_750_000, 72_000, [44, 3, 22, 31], [34, 2, 38, 26], [46, 3, 20, 31], [45, 3, 21, 31], 'nightlife'),
      ]),
    ]),
    buildCountry('sg', '702', 'Singapore', 'asia', 1.35, 103.82, 'SGD', 1.8, 'commuter', [
      buildCity('singapore', 'Singapore', 'sg', 1.352, 103.819, '5.9M City-State', 'commuter', [
        area('sg-marina', 'Marina Bay Financial', 'Banking Core', 1.281, 103.854, 12_000_000, 890_000_000, 1_100_000, 34_000, [34, 4, 29, 33], [24, 3, 47, 26], [35, 4, 28, 33], [33, 4, 30, 33], 'commerce'),
        area('sg-orchard', 'Orchard Road', 'Luxury Retail', 1.304, 103.831, 14_500_000, 620_000_000, 1_350_000, 48_000, [38, 4, 26, 32], [28, 3, 43, 26], [39, 4, 25, 32], [38, 4, 27, 31], 'nightlife'),
        area('sg-jurong', 'Jurong Gateway', 'Regional Transit', 1.333, 103.743, 11_200_000, 290_000_000, 1_050_000, 41_000, [42, 6, 18, 34], [33, 5, 33, 29], [43, 6, 17, 34], [44, 6, 18, 32], 'commuter'),
      ]),
    ]),
    buildCountry('id', '360', 'Indonesia', 'asia', -2.5, 118.0, 'IDR', 4.2, 'balanced', [
      buildCity('jakarta', 'Jakarta', 'id', -6.20, 106.84, '11.2M Metro', 'commerce', [
        area('jkt-scbd', 'SCBD Sudirman', 'Financial Hub', -6.225, 106.809, 24_000_000, 620_000_000, 2_200_000, 74_000, [54, 13, 21, 12], [41, 10, 38, 11], [56, 14, 19, 11], [54, 14, 21, 11], 'commerce'),
        area('jkt-kemang', 'Kemang', 'Dining & Lifestyle', -6.26, 106.814, 16_000_000, 280_000_000, 1_500_000, 68_000, [62, 12, 16, 10], [50, 10, 30, 10], [64, 13, 14, 9], [65, 13, 14, 8], 'nightlife'),
        area('jkt-tanah', 'Tanah Abang', 'Textile & Wholesale', -6.185, 106.811, 29_000_000, 510_000_000, 2_800_000, 145_000, [58, 24, 13, 5], [47, 21, 27, 5], [60, 25, 11, 4], [61, 26, 9, 4], 'commerce'),
      ]),
      buildCity('surabaya', 'Surabaya', 'id', -7.25, 112.75, '4.8M Metro', 'balanced', [
        area('sub-tunjungan', 'Tunjungan Center', 'Commercial Core', -7.262, 112.738, 11_000_000, 210_000_000, 1_080_000, 54_000, [59, 19, 15, 7], [47, 16, 30, 7], [61, 20, 13, 6], [62, 21, 12, 5], 'commerce'),
        area('sub-west', 'West Surabaya', 'Suburban Malls', -7.289, 112.675, 8_400_000, 175_000_000, 790_000, 36_000, [55, 14, 21, 10], [42, 11, 37, 10], [57, 15, 19, 9], [56, 15, 20, 9], 'nightlife'),
      ]),
    ]),
    buildCountry('ae', '784', 'United Arab Emirates', 'asia', 24.2, 54.4, 'AED', 2.2, 'commerce', [
      buildCity('dubai', 'Dubai', 'ae', 25.20, 55.27, '3.6M Metro', 'commerce', [
        area('dxb-difc', 'DIFC Financial Gate', 'Global Finance', 25.211, 55.281, 9_800_000, 820_000_000, 780_000, 24_000, [28, 6, 38, 28], [20, 4, 54, 22], [29, 7, 36, 28], [27, 6, 39, 28], 'commerce'),
        area('dxb-downtown', 'Downtown & Mall', 'Luxury Retail', 25.197, 55.274, 14_200_000, 710_000_000, 1_240_000, 46_000, [31, 5, 34, 30], [23, 4, 48, 25], [32, 6, 32, 30], [31, 5, 35, 29], 'nightlife'),
        area('dxb-deira', 'Deira Souk & Port', 'Cross-Border Trade', 25.271, 55.307, 11_600_000, 430_000_000, 1_120_000, 62_000, [26, 24, 31, 19], [20, 21, 44, 15], [27, 26, 29, 18], [26, 25, 31, 18], 'remittance'),
      ]),
      buildCity('abudhabi', 'Abu Dhabi', 'ae', 24.45, 54.37, '1.8M Metro', 'commerce', [
        area('auh-maryah', 'Al Maryah Island', 'Financial Freezone', 24.50, 54.39, 5_600_000, 490_000_000, 460_000, 16_000, [27, 5, 39, 29], [19, 4, 55, 22], [28, 6, 37, 29], [26, 5, 40, 29], 'commerce'),
        area('auh-corniche', 'Corniche & Marina', 'Urban Retail', 24.476, 54.321, 6_400_000, 290_000_000, 540_000, 24_000, [30, 8, 33, 29], [22, 6, 47, 25], [31, 9, 31, 29], [30, 8, 34, 28], 'nightlife'),
      ]),
    ]),
  ]),

  buildContinent('europe', 'Europe', 50.5, 11.5, 18.5, 'commuter', [
    buildCountry('gb', '826', 'United Kingdom', 'europe', 54.0, -2.5, 'GBP', 3.6, 'commuter', [
      buildCity('london', 'London', 'gb', 51.507, -0.127, '14.8M Metro', 'commuter', [
        area('lon-canary', 'Canary Wharf', 'Banking & Fintech', 51.505, -0.023, 18_500_000, 1_380_000_000, 1_450_000, 38_000, [26, 2, 31, 41], [19, 2, 48, 31], [27, 2, 30, 41], [25, 2, 32, 41], 'commuter'),
        area('lon-soho', 'Soho & West End', 'Retail & Theatre', 51.513, -0.136, 22_000_000, 840_000_000, 1_900_000, 68_000, [29, 2, 26, 43], [22, 2, 41, 35], [30, 2, 25, 43], [28, 2, 27, 43], 'nightlife'),
        area('lon-shoreditch', 'Shoreditch', 'Tech & Cafes', 51.524, -0.078, 13_800_000, 420_000_000, 1_150_000, 42_000, [33, 3, 21, 43], [25, 2, 35, 38], [34, 3, 20, 43], [32, 3, 22, 43], 'commuter'),
      ]),
      buildCity('manchester', 'Manchester', 'gb', 53.48, -2.24, '2.8M Metro', 'balanced', [
        area('man-spinning', 'Spinningfields', 'Commercial Core', 53.48, -2.253, 7_600_000, 310_000_000, 640_000, 22_000, [25, 2, 32, 41], [18, 2, 47, 33], [26, 2, 31, 41], [24, 2, 33, 41], 'commerce'),
        area('man-nq', 'Northern Quarter', 'Independent Retail', 53.483, -2.233, 6_400_000, 190_000_000, 580_000, 26_000, [28, 3, 25, 44], [21, 2, 39, 38], [29, 3, 24, 44], [27, 3, 26, 44], 'nightlife'),
      ]),
    ]),
    buildCountry('de', '276', 'Germany', 'europe', 51.1, 10.4, 'EUR', 3.9, 'commerce', [
      buildCity('berlin', 'Berlin', 'de', 52.52, 13.40, '6.1M Metro', 'balanced', [
        area('ber-mitte', 'Mitte & Friedrichstrasse', 'Government & Retail', 52.52, 13.388, 14_200_000, 640_000_000, 1_250_000, 46_000, [24, 2, 41, 33], [18, 2, 54, 26], [25, 2, 40, 33], [23, 2, 42, 33], 'commerce'),
        area('ber-kreuzberg', 'Kreuzberg', 'Creative & Nightlife', 52.498, 13.403, 11_400_000, 330_000_000, 1_050_000, 41_000, [29, 3, 33, 35], [22, 2, 46, 30], [30, 3, 32, 35], [28, 3, 34, 35], 'nightlife'),
      ]),
      buildCity('frankfurt', 'Frankfurt', 'de', 50.11, 8.68, '2.6M Metro', 'commerce', [
        area('fra-bank', 'Bankenviertel', 'Euro Financial Core', 50.112, 8.672, 10_800_000, 920_000_000, 820_000, 26_000, [23, 2, 43, 32], [17, 1, 58, 24], [24, 2, 42, 32], [22, 2, 44, 32], 'commerce'),
        area('fra-zeil', 'Zeil Promenade', 'Shopping District', 50.114, 8.684, 9_400_000, 380_000_000, 840_000, 32_000, [25, 2, 39, 34], [19, 2, 51, 28], [26, 2, 38, 34], [24, 2, 40, 34], 'commerce'),
      ]),
      buildCity('munich', 'Munich', 'de', 48.13, 11.58, '2.9M Metro', 'commuter', [
        area('muc-altstadt', 'Altstadt-Lehel', 'Commercial Core', 48.137, 11.576, 11_200_000, 560_000_000, 940_000, 34_000, [24, 2, 40, 34], [18, 2, 53, 27], [25, 2, 39, 34], [23, 2, 41, 34], 'commerce'),
        area('muc-schwabing', 'Schwabing', 'University & Tech', 48.161, 11.586, 8_600_000, 310_000_000, 760_000, 28_000, [28, 2, 34, 36], [21, 2, 47, 30], [29, 2, 33, 36], [27, 2, 35, 36], 'commuter'),
      ]),
    ]),
    buildCountry('fr', '250', 'France', 'europe', 46.6, 2.2, 'EUR', 3.5, 'commuter', [
      buildCity('paris', 'Paris', 'fr', 48.856, 2.352, '11.2M Metro', 'commuter', [
        area('par-defense', 'La Défense', 'Financial District', 48.892, 2.238, 16_400_000, 1_120_000_000, 1_280_000, 34_000, [22, 2, 36, 40], [16, 1, 53, 30], [23, 2, 35, 40], [21, 2, 37, 40], 'commuter'),
        area('par-marais', 'Le Marais', 'Boutique & Dining', 48.857, 2.358, 14_800_000, 580_000_000, 1_240_000, 52_000, [25, 2, 31, 42], [19, 2, 45, 34], [26, 2, 30, 42], [24, 2, 32, 42], 'nightlife'),
        area('par-champs', 'Champs-Élysées', 'Luxury & Tourism', 48.870, 2.307, 15_200_000, 860_000_000, 1_310_000, 44_000, [24, 2, 38, 36], [17, 1, 55, 27], [25, 2, 37, 36], [23, 2, 39, 36], 'commerce'),
      ]),
      buildCity('lyon', 'Lyon', 'fr', 45.76, 4.83, '2.3M Metro', 'balanced', [
        area('lyo-partdieu', 'La Part-Dieu', 'Rail & Business', 45.761, 4.859, 8_200_000, 390_000_000, 710_000, 26_000, [23, 2, 36, 39], [17, 2, 51, 30], [24, 2, 35, 39], [22, 2, 37, 39], 'commuter'),
        area('lyo-presquile', 'Presqu’île', 'Historic Retail', 45.764, 4.835, 7_400_000, 280_000_000, 650_000, 29_000, [24, 2, 34, 40], [18, 2, 48, 32], [25, 2, 33, 40], [23, 2, 35, 40], 'nightlife'),
      ]),
    ]),
    buildCountry('se', '752', 'Sweden', 'europe', 60.1, 18.6, 'SEK', 2.0, 'commuter', [
      buildCity('stockholm', 'Stockholm', 'se', 59.329, 18.068, '2.4M Metro', 'commuter', [
        area('sto-norrmalm', 'Norrmalm CBD', 'Cashless Core', 59.332, 18.064, 8_900_000, 480_000_000, 780_000, 28_000, [44, 2, 24, 30], [34, 2, 40, 24], [46, 2, 22, 30], [45, 2, 23, 30], 'commerce'),
        area('sto-sodermalm', 'Södermalm', 'Design & Dining', 59.315, 18.073, 7_200_000, 260_000_000, 640_000, 26_000, [48, 2, 19, 31], [38, 2, 33, 27], [49, 2, 18, 31], [48, 2, 19, 31], 'nightlife'),
        area('sto-kista', 'Kista Science City', 'Telecom & Tech', 59.403, 17.944, 5_100_000, 220_000_000, 430_000, 14_000, [46, 2, 21, 31], [36, 2, 36, 26], [47, 2, 20, 31], [46, 2, 21, 31], 'commuter'),
      ]),
    ]),
    buildCountry('pl', '616', 'Poland', 'europe', 52.0, 19.1, 'PLN', 2.4, 'balanced', [
      buildCity('warsaw', 'Warsaw', 'pl', 52.229, 21.012, '3.1M Metro', 'commuter', [
        area('waw-srod', 'Śródmieście', 'Central Finance', 52.231, 21.006, 9_800_000, 360_000_000, 860_000, 34_000, [38, 3, 25, 34], [29, 2, 41, 28], [40, 3, 23, 34], [38, 3, 25, 34], 'commerce'),
        area('waw-wola', 'Wola Spire District', 'Tech & Offices', 52.233, 20.984, 7_400_000, 290_000_000, 620_000, 22_000, [41, 3, 22, 34], [32, 2, 38, 28], [42, 3, 21, 34], [41, 3, 22, 34], 'commuter'),
      ]),
    ]),
  ]),

  buildContinent('north_america', 'North America', 39.5, -98.5, 21, 'commerce', [
    buildCountry('us', '840', 'United States', 'north_america', 38.5, -97.0, 'USD', 6.8, 'commerce', [
      buildCity('nyc', 'New York', 'us', 40.712, -74.006, '19.6M Metro', 'commuter', [
        area('nyc-wallst', 'Wall Street & FiDi', 'Institutional Finance', 40.707, -74.011, 29_000_000, 2_850_000_000, 2_100_000, 56_000, [26, 2, 44, 28], [18, 1, 61, 20], [27, 2, 43, 28], [25, 2, 45, 28], 'commerce'),
        area('nyc-midtown', 'Midtown Manhattan', 'Transit & Flagship', 40.754, -73.984, 42_000_000, 2_140_000_000, 3_400_000, 118_000, [29, 2, 38, 31], [21, 1, 54, 24], [30, 2, 37, 31], [28, 2, 39, 31], 'commuter'),
        area('nyc-soho', 'SoHo & Tribeca', 'Boutique & Dining', 40.723, -74.002, 21_000_000, 980_000_000, 1_750_000, 64_000, [32, 2, 35, 31], [24, 1, 50, 25], [33, 2, 34, 31], [31, 2, 36, 31], 'nightlife'),
        area('nyc-williamsburg', 'Williamsburg', 'Neighborhood Commerce', 40.714, -73.961, 17_500_000, 540_000_000, 1_450_000, 52_000, [36, 3, 30, 31], [28, 2, 43, 27], [37, 3, 29, 31], [35, 3, 31, 31], 'nightlife'),
      ]),
      buildCity('sf', 'San Francisco', 'us', 37.774, -122.419, '4.6M Metro', 'commuter', [
        area('sf-fidi', 'Financial District', 'VC & Enterprise', 37.794, -122.400, 14_200_000, 1_120_000_000, 1_050_000, 32_000, [31, 2, 37, 30], [23, 1, 53, 23], [32, 2, 36, 30], [30, 2, 38, 30], 'commerce'),
        area('sf-soma', 'SoMa Tech Corridor', 'SaaS & Transit', 37.778, -122.405, 13_600_000, 680_000_000, 1_120_000, 36_000, [38, 2, 29, 31], [29, 1, 44, 26], [39, 2, 28, 31], [37, 2, 30, 31], 'commuter'),
        area('sf-mission', 'Mission District', 'Local Dining', 37.759, -122.414, 11_200_000, 390_000_000, 960_000, 38_000, [35, 4, 31, 30], [27, 3, 44, 26], [36, 4, 30, 30], [34, 4, 32, 30], 'nightlife'),
      ]),
      buildCity('chicago', 'Chicago', 'us', 41.878, -87.629, '9.4M Metro', 'balanced', [
        area('chi-loop', 'The Loop', 'Commodities & Transit', 41.881, -87.628, 19_400_000, 1_240_000_000, 1_550_000, 48_000, [25, 2, 43, 30], [18, 1, 59, 22], [26, 2, 42, 30], [24, 2, 44, 30], 'commuter'),
        area('chi-rivernorth', 'River North', 'Hospitality & Retail', 41.892, -87.634, 15_200_000, 620_000_000, 1_280_000, 44_000, [28, 2, 41, 29], [21, 1, 54, 24], [29, 2, 40, 29], [27, 2, 42, 29], 'nightlife'),
      ]),
    ]),
    buildCountry('ca', '124', 'Canada', 'north_america', 56.1, -106.3, 'CAD', 2.9, 'commuter', [
      buildCity('toronto', 'Toronto', 'ca', 43.653, -79.383, '6.4M Metro', 'commuter', [
        area('yyz-bay', 'Bay Street Financial', 'Banking & Exchanges', 43.649, -79.380, 13_400_000, 940_000_000, 1_080_000, 32_000, [24, 2, 35, 39], [17, 1, 52, 30], [25, 2, 34, 39], [23, 2, 36, 39], 'commuter'),
        area('yyz-yonge', 'Downtown Yonge', 'Urban Retail', 43.656, -79.380, 14_800_000, 560_000_000, 1_260_000, 46_000, [27, 2, 31, 40], [20, 2, 45, 33], [28, 2, 30, 40], [26, 2, 32, 40], 'nightlife'),
      ]),
      buildCity('vancouver', 'Vancouver', 'ca', 49.282, -123.120, '2.6M Metro', 'balanced', [
        area('yvr-water', 'Downtown Waterfront', 'Port & Commerce', 49.286, -123.112, 8_600_000, 410_000_000, 740_000, 26_000, [28, 2, 31, 39], [21, 2, 46, 31], [29, 2, 30, 39], [27, 2, 32, 39], 'commerce'),
        area('yvr-richmond', 'Richmond Center', 'Cross-Pacific Retail', 49.166, -123.136, 7_200_000, 290_000_000, 620_000, 28_000, [39, 3, 26, 32], [30, 2, 42, 26], [40, 3, 25, 32], [39, 3, 27, 31], 'commerce'),
      ]),
    ]),
    buildCountry('mx', '484', 'Mexico', 'north_america', 23.6, -102.5, 'MXN', 3.1, 'balanced', [
      buildCity('cdmx', 'Mexico City', 'mx', 19.432, -99.133, '22.3M Metro', 'commerce', [
        area('mex-polanco', 'Polanco', 'Luxury & Corporate', 19.433, -99.195, 13_200_000, 580_000_000, 1_120_000, 38_000, [26, 11, 44, 19], [19, 8, 58, 15], [27, 12, 42, 19], [25, 12, 45, 18], 'commerce'),
        area('mex-reforma', 'Paseo de la Reforma', 'Financial Avenue', 19.427, -99.167, 15_400_000, 720_000_000, 1_320_000, 44_000, [27, 13, 41, 19], [20, 10, 55, 15], [28, 14, 39, 19], [26, 14, 42, 18], 'commuter'),
        area('mex-centro', 'Centro Histórico', 'High-Density Retail', 19.432, -99.133, 18_900_000, 410_000_000, 1_780_000, 86_000, [31, 24, 32, 13], [24, 19, 46, 11], [32, 26, 30, 12], [33, 27, 29, 11], 'commerce'),
      ]),
      buildCity('monterrey', 'Monterrey', 'mx', 25.686, -100.316, '5.3M Metro', 'commerce', [
        area('mty-sanpedro', 'San Pedro Garza', 'Industrial Finance', 25.657, -100.369, 7_800_000, 390_000_000, 640_000, 22_000, [28, 10, 43, 19], [20, 7, 58, 15], [29, 11, 41, 19], [27, 11, 44, 18], 'commerce'),
        area('mty-centro', 'Monterrey Centro', 'Metro Commerce', 25.671, -100.309, 8_400_000, 240_000_000, 790_000, 38_000, [30, 19, 36, 15], [23, 15, 49, 13], [31, 20, 34, 15], [31, 21, 34, 14], 'commuter'),
      ]),
    ]),
  ]),

  buildContinent('south_america', 'South America', -14.2, -59.5, 19.5, 'commerce', [
    buildCountry('br', '076', 'Brazil', 'south_america', -14.2, -51.9, 'BRL', 4.4, 'commerce', [
      buildCity('saopaulo', 'São Paulo', 'br', -23.55, -46.63, '22.6M Metro', 'commerce', [
        area('gru-farialima', 'Faria Lima', 'Fintech & Banking', -23.575, -46.689, 24_000_000, 1_240_000_000, 1_950_000, 58_000, [48, 8, 28, 16], [36, 6, 45, 13], [49, 9, 26, 16], [47, 9, 29, 15], 'commerce'),
        area('gru-paulista', 'Avenida Paulista', 'Commercial Spine', -23.561, -46.656, 29_000_000, 890_000_000, 2_450_000, 88_000, [52, 9, 23, 16], [41, 7, 38, 14], [54, 10, 21, 15], [53, 10, 22, 15], 'commuter'),
        area('gru-bras', 'Brás Wholesale', 'Garment & Trade', -23.541, -46.617, 26_000_000, 620_000_000, 2_350_000, 112_000, [58, 14, 19, 9], [48, 11, 33, 8], [60, 15, 17, 8], [61, 16, 16, 7], 'commerce'),
      ]),
      buildCity('rio', 'Rio de Janeiro', 'br', -22.90, -43.17, '13.7M Metro', 'nightlife', [
        area('gig-centro', 'Centro & Porto', 'Corporate Core', -22.903, -43.180, 14_200_000, 520_000_000, 1_220_000, 44_000, [49, 10, 26, 15], [38, 8, 41, 13], [51, 11, 24, 14], [49, 11, 26, 14], 'commerce'),
        area('gig-copa', 'Copacabana', 'Tourism & Beachfront', -22.971, -43.182, 13_400_000, 380_000_000, 1_180_000, 52_000, [51, 10, 22, 17], [40, 8, 37, 15], [53, 11, 20, 16], [52, 11, 21, 16], 'nightlife'),
      ]),
    ]),
    buildCountry('co', '170', 'Colombia', 'south_america', 4.5, -74.2, 'COP', 2.4, 'balanced', [
      buildCity('bogota', 'Bogotá', 'co', 4.71, -74.07, '11.5M Metro', 'commuter', [
        area('bog-chapinero', 'Chapinero Financial', 'Tech & Banking', 4.648, -74.063, 10_400_000, 310_000_000, 940_000, 36_000, [41, 19, 26, 14], [31, 15, 42, 12], [43, 20, 24, 13], [42, 21, 25, 12], 'commerce'),
        area('bog-zonat', 'Zona T', 'Dining & Retail', 4.667, -74.054, 8_600_000, 240_000_000, 780_000, 32_000, [44, 16, 25, 15], [33, 12, 41, 14], [46, 17, 23, 14], [44, 18, 24, 14], 'nightlife'),
      ]),
      buildCity('medellin', 'Medellín', 'co', 6.24, -75.58, '4.1M Metro', 'nightlife', [
        area('mde-poblado', 'El Poblado', 'Digital Nomads & Dining', 6.209, -75.568, 7_400_000, 195_000_000, 680_000, 28_000, [46, 18, 22, 14], [35, 14, 38, 13], [48, 19, 20, 13], [47, 20, 21, 12], 'nightlife'),
        area('mde-laureles', 'Laureles', 'Neighborhood Retail', 6.245, -75.595, 5_900_000, 130_000_000, 560_000, 26_000, [48, 22, 19, 11], [38, 18, 34, 10], [50, 23, 17, 10], [50, 24, 17, 9], 'balanced'),
      ]),
    ]),
    buildCountry('ar', '032', 'Argentina', 'south_america', -38.4, -63.6, 'ARS', 2.3, 'nightlife', [
      buildCity('buenosaires', 'Buenos Aires', 'ar', -34.60, -58.38, '15.5M Metro', 'nightlife', [
        area('eze-madero', 'Puerto Madero', 'Corporate Finance', -34.611, -58.362, 9_600_000, 340_000_000, 840_000, 26_000, [52, 8, 27, 13], [41, 6, 42, 11], [54, 9, 25, 12], [52, 9, 27, 12], 'commerce'),
        area('eze-palermo', 'Palermo Soho', 'Dining & Boutiques', -34.588, -58.426, 12_800_000, 290_000_000, 1_160_000, 48_000, [61, 8, 19, 12], [51, 6, 32, 11], [63, 9, 17, 11], [62, 9, 18, 11], 'nightlife'),
      ]),
    ]),
  ]),

  buildContinent('africa', 'Africa', 3.5, 21.0, 21, 'remittance', [
    buildCountry('ke', '404', 'Kenya', 'africa', -0.02, 37.9, 'KES', 2.9, 'remittance', [
      buildCity('nairobi', 'Nairobi', 'ke', -1.29, 36.82, '5.3M Metro', 'remittance', [
        area('nbo-cbd', 'Nairobi CBD', 'M-Pesa & Commerce', -1.284, 36.823, 14_200_000, 310_000_000, 1_580_000, 82_000, [16, 66, 13, 5], [13, 56, 26, 5], [17, 68, 11, 4], [15, 72, 9, 4], 'remittance'),
        area('nbo-westlands', 'Westlands', 'Tech & Corporate', -1.264, 36.803, 9_800_000, 260_000_000, 940_000, 38_000, [24, 48, 19, 9], [19, 39, 34, 8], [25, 50, 17, 8], [23, 53, 16, 8], 'commerce'),
        area('nbo-kilimani', 'Kilimani', 'Urban Residential', -1.290, 36.783, 8_400_000, 175_000_00, 890_000, 41_000, [22, 57, 14, 7], [18, 49, 26, 7], [23, 59, 12, 6], [21, 62, 11, 6], 'nightlife'),
      ]),
      buildCity('mombasa', 'Mombasa', 'ke', -4.04, 39.66, '1.4M Metro', 'remittance', [
        area('mba-mvita', 'Mvita Port CBD', 'Maritime Trade', -4.060, 39.668, 4_800_000, 115_000_000, 540_000, 32_000, [15, 68, 13, 4], [12, 59, 25, 4], [16, 70, 10, 4], [14, 74, 9, 3], 'remittance'),
        area('mba-nyali', 'Nyali Coastal', 'Hospitality & Retail', -4.022, 39.708, 3_600_000, 88_000_000, 390_000, 21_000, [21, 56, 16, 7], [17, 48, 29, 6], [22, 58, 14, 6], [20, 61, 13, 6], 'nightlife'),
      ]),
    ]),
    buildCountry('ng', '566', 'Nigeria', 'africa', 9.08, 8.67, 'NGN', 3.5, 'remittance', [
      buildCity('lagos', 'Lagos', 'ng', 6.52, 3.37, '16.5M Metro', 'commerce', [
        area('los-vi', 'Victoria Island', 'Banking & Energy', 6.428, 3.421, 15_400_000, 480_000_000, 1_320_000, 54_000, [34, 34, 23, 9], [26, 27, 39, 8], [35, 36, 21, 8], [34, 38, 21, 7], 'commerce'),
        area('los-yaba', 'Yaba Tech Hub', 'Fintech & Campus', 6.509, 3.378, 12_800_000, 240_000_000, 1_240_000, 58_000, [42, 36, 15, 7], [34, 30, 29, 7], [44, 37, 13, 6], [43, 39, 12, 6], 'commuter'),
        area('los-ikeja', 'Ikeja Computer Village', 'Electronics & Trade', 6.596, 3.342, 16_900_000, 360_000_000, 1_650_000, 92_000, [36, 41, 18, 5], [29, 34, 32, 5], [38, 42, 16, 4], [37, 44, 15, 4], 'commerce'),
      ]),
      buildCity('abuja', 'Abuja', 'ng', 9.07, 7.39, '3.8M Metro', 'balanced', [
        area('abv-cbd', 'Abuja Central District', 'Federal & Corporate', 9.057, 7.495, 7_200_000, 220_000_000, 680_000, 28_000, [31, 35, 25, 9], [24, 28, 40, 8], [32, 37, 23, 8], [31, 39, 23, 7], 'commerce'),
        area('abv-wuse', 'Wuse II', 'Commercial & Dining', 9.076, 7.476, 6_400_000, 165_000_000, 620_000, 32_000, [35, 37, 20, 8], [28, 31, 34, 7], [37, 38, 18, 7], [36, 40, 18, 6], 'nightlife'),
      ]),
    ]),
    buildCountry('za', '710', 'South Africa', 'africa', -30.5, 22.9, 'ZAR', 2.6, 'commerce', [
      buildCity('joburg', 'Johannesburg', 'za', -26.20, 28.04, '6.2M Metro', 'commerce', [
        area('jnb-sandton', 'Sandton CBD', 'African Financial Hub', -26.107, 28.056, 11_400_000, 560_000_000, 960_000, 32_000, [24, 14, 37, 25], [17, 10, 53, 20], [25, 15, 35, 25], [23, 16, 37, 24], 'commerce'),
        area('jnb-soweto', 'Soweto Orlando', 'Community Retail', -26.248, 27.908, 9_200_000, 175_000_000, 940_000, 48_000, [28, 34, 25, 13], [22, 29, 38, 11], [29, 36, 23, 12], [28, 38, 22, 12], 'remittance'),
      ]),
      buildCity('capetown', 'Cape Town', 'za', -33.92, 18.42, '4.9M Metro', 'nightlife', [
        area('cpt-waterfront', 'V&A Waterfront', 'Tourism & Retail', -33.903, 18.419, 8_200_000, 340_000_000, 710_000, 28_000, [25, 11, 36, 28], [18, 8, 51, 23], [26, 12, 34, 28], [24, 12, 36, 28], 'nightlife'),
        area('cpt-cbd', 'Cape Town CBD', 'Tech & Services', -33.924, 18.424, 7_600_000, 295_000_000, 640_000, 26_000, [26, 13, 34, 27], [19, 10, 49, 22], [27, 14, 32, 27], [25, 14, 34, 27], 'commerce'),
      ]),
    ]),
    buildCountry('eg', '818', 'Egypt', 'africa', 26.8, 30.8, 'EGP', 2.8, 'remittance', [
      buildCity('cairo', 'Cairo', 'eg', 30.04, 31.23, '22.1M Metro', 'remittance', [
        area('cai-downtown', 'Downtown Cairo', 'Urban Commerce', 30.044, 31.235, 14_600_000, 310_000_000, 1_540_000, 78_000, [29, 38, 24, 9], [22, 31, 39, 8], [30, 40, 22, 8], [29, 43, 21, 7], 'nightlife'),
        area('cai-new', 'New Cairo Financial', 'Banking & Tech', 30.025, 31.471, 10_200_000, 340_000_000, 920_000, 34_000, [34, 24, 28, 14], [25, 18, 45, 12], [35, 25, 27, 13], [34, 26, 28, 12], 'commerce'),
      ]),
      buildCity('alexandria', 'Alexandria', 'eg', 31.20, 29.91, '5.6M Metro', 'balanced', [
        area('aly-smouha', 'Smouha Commercial', 'Retail & Port', 31.215, 29.942, 7_400_000, 165_000_000, 780_000, 42_000, [28, 41, 23, 8], [21, 34, 38, 7], [29, 43, 21, 7], [28, 45, 20, 7], 'balanced'),
      ]),
    ]),
  ]),

  buildContinent('oceania', 'Oceania', -25.2, 138.0, 19.5, 'commuter', [
    buildCountry('au', '036', 'Australia', 'oceania', -25.27, 133.77, 'AUD', 2.6, 'commuter', [
      buildCity('sydney', 'Sydney', 'au', -33.868, 151.209, '5.4M Metro', 'commuter', [
        area('syd-cbd', 'Sydney CBD', 'Financial Core', -33.868, 151.207, 12_800_000, 860_000_000, 1_040_000, 32_000, [27, 2, 26, 45], [19, 1, 44, 36], [28, 2, 25, 45], [26, 2, 27, 45], 'commuter'),
        area('syd-barangaroo', 'Barangaroo', 'Fintech & Dining', -33.861, 151.201, 9_400_000, 490_000_000, 780_000, 24_000, [30, 2, 23, 45], [22, 1, 40, 37], [31, 2, 22, 45], [29, 2, 24, 45], 'nightlife'),
        area('syd-parramatta', 'Parramatta', 'Western Metro Hub', -33.815, 151.001, 8_200_000, 320_000_000, 720_000, 28_000, [29, 3, 25, 43], [21, 2, 41, 36], [30, 3, 24, 43], [28, 3, 26, 43], 'commuter'),
      ]),
      buildCity('melbourne', 'Melbourne', 'au', -37.813, 144.963, '5.2M Metro', 'balanced', [
        area('mel-cbd', 'Melbourne CBD', 'Laneways & Finance', -37.813, 144.963, 11_800_000, 690_000_000, 980_000, 34_000, [28, 2, 25, 45], [20, 1, 43, 36], [29, 2, 24, 45], [27, 2, 26, 45], 'commuter'),
        area('mel-fitzroy', 'Fitzroy', 'Cafes & Creative', -37.798, 144.978, 6_400_000, 210_000_000, 560_000, 24_000, [31, 2, 21, 46], [23, 1, 37, 39], [32, 2, 20, 46], [30, 2, 22, 46], 'nightlife'),
      ]),
    ]),
    buildCountry('nz', '554', 'New Zealand', 'oceania', -40.9, 174.8, 'NZD', 1.8, 'commuter', [
      buildCity('auckland', 'Auckland', 'nz', -36.848, 174.763, '1.7M Metro', 'commuter', [
        area('akl-cbd', 'Auckland CBD', 'Harbour Commerce', -36.848, 174.763, 6_200_000, 310_000_000, 520_000, 19_000, [25, 2, 31, 42], [18, 1, 46, 35], [26, 2, 30, 42], [24, 2, 32, 42], 'commuter'),
        area('akl-newmarket', 'Newmarket', 'Retail Precinct', -36.868, 174.777, 4_800_000, 185_000_000, 410_000, 16_000, [27, 2, 29, 42], [20, 1, 44, 35], [28, 2, 28, 42], [26, 2, 30, 42], 'commerce'),
      ]),
    ]),
  ]),
];

// ============================================================================
// DYNAMIC REGIONAL SYNTHESIZER FOR ALL OTHER WORLD COUNTRIES (ZERO DEAD CLICKS)
// ============================================================================

const syntheticCountryCache = new Map<string, CountryNode>();

function inferContinentForLatLon(lat: number, lon: number): string {
  if (lon < -30) {
    return lat > 12 ? 'north_america' : 'south_america';
  }
  if (lon >= -30 && lon <= 60) {
    if (lat > 35) return 'europe';
    if (lat > 12 && lon > 34) return 'asia'; // Middle East
    return 'africa';
  }
  if (lat < -10 && lon > 110) return 'oceania';
  return 'asia';
}

export function getOrCreateCountryForGeo(geo: GeoCountryFeature): CountryNode {
  // Check if ISO numeric or name matches a flagship country
  for (const cont of CONTINENTS) {
    const match = cont.countries.find(
      (c) =>
        (c.isoNumeric && c.isoNumeric === geo.isoNumeric) ||
        c.name.toLowerCase() === geo.name.toLowerCase()
    );
    if (match) return match;
  }

  const cached = syntheticCountryCache.get(geo.isoNumeric || geo.name);
  if (cached) return cached;

  const continentId = inferContinentForLatLon(geo.centroid.lat, geo.centroid.lon);
  const continent = CONTINENTS.find((c) => c.id === continentId) || CONTINENTS[0];
  const base = continent.profile;

  // Deterministic seed from country name
  let seed = 0;
  for (let i = 0; i < geo.name.length; i++) seed = (seed * 31 + geo.name.charCodeAt(i)) % 997;

  const jitter = (offset: number) => 0.8 + ((seed + offset) % 45) / 100;
  const scaleFactor = 0.08 + ((seed % 25) / 100);

  const cityAId = `syn-${geo.isoNumeric || seed}-cap`;
  const cityBId = `syn-${geo.isoNumeric || seed}-port`;

  const makeLocal = (id: string, name: string, type: string, dLat: number, dLon: number, mult: number, bias: PaymentProfile['diurnalBias']) =>
    area7(
      id,
      name,
      type,
      geo.centroid.lat + dLat,
      geo.centroid.lon + dLon,
      Math.round(base.annualVolumeCount * scaleFactor * 0.08 * mult),
      Math.round(base.dailyAmountUsd * scaleFactor * 0.08 * mult),
      Math.round(base.activeCustomers * scaleFactor * 0.08 * mult),
      Math.round(base.activeMerchants * scaleFactor * 0.08 * mult),
      [
        base.volumeMix.mobileWallets * jitter(1),
        base.volumeMix.mfs * jitter(2),
        base.volumeMix.cardPayments * jitter(3),
        base.volumeMix.nfcContactless * jitter(4),
        base.volumeMix.bankingApps * jitter(17),
        base.volumeMix.paymentGateways * jitter(18),
        base.volumeMix.pspPso * jitter(19),
      ],
      [
        base.amountMix.mobileWallets * jitter(5),
        base.amountMix.mfs * jitter(6),
        base.amountMix.cardPayments * jitter(7),
        base.amountMix.nfcContactless * jitter(8),
        base.amountMix.bankingApps * jitter(20),
        base.amountMix.paymentGateways * jitter(21),
        base.amountMix.pspPso * jitter(22),
      ],
      [
        base.customerMix.mobileWallets * jitter(9),
        base.customerMix.mfs * jitter(10),
        base.customerMix.cardPayments * jitter(11),
        base.customerMix.nfcContactless * jitter(12),
        base.customerMix.bankingApps * jitter(23),
        base.customerMix.paymentGateways * jitter(24),
        base.customerMix.pspPso * jitter(25),
      ],
      [
        base.merchantMix.mobileWallets * jitter(13),
        base.merchantMix.mfs * jitter(14),
        base.merchantMix.cardPayments * jitter(15),
        base.merchantMix.nfcContactless * jitter(16),
        base.merchantMix.bankingApps * jitter(26),
        base.merchantMix.paymentGateways * jitter(27),
        base.merchantMix.pspPso * jitter(28),
      ],
      bias
    );

  const capitalCity = buildCity(
    cityAId,
    `${geo.name} Metro`,
    `syn-${geo.isoNumeric || seed}`,
    geo.centroid.lat,
    geo.centroid.lon,
    'Primary Metro',
    'commerce',
    [
      makeLocal(`${cityAId}-fin`, 'Central Financial District', 'Banking Core', 0.08, 0.06, 1.3, 'commerce'),
      makeLocal(`${cityAId}-ret`, 'Central Market & Retail', 'Urban Commerce', -0.06, -0.05, 1.1, 'nightlife'),
      makeLocal(`${cityAId}-trn`, 'Transit & Rail Corridor', 'Commuter Hub', 0.04, -0.09, 0.9, 'commuter'),
    ]
  );

  const secondaryCity = buildCity(
    cityBId,
    `${geo.name} Commercial Hub`,
    `syn-${geo.isoNumeric || seed}`,
    geo.centroid.lat + 0.65,
    geo.centroid.lon - 0.75,
    'Regional Hub',
    'balanced',
    [
      makeLocal(`${cityBId}-trd`, 'Trade & Logistics Zone', 'Commercial Hub', 0.05, 0.04, 0.95, 'commerce'),
      makeLocal(`${cityBId}-nbh`, 'Digital Retail District', 'Neighborhood Hub', -0.04, 0.06, 0.85, 'balanced'),
    ]
  );

  const synthetic = buildCountry(
    `syn-${geo.isoNumeric || seed}`,
    geo.isoNumeric,
    geo.name,
    continentId,
    geo.centroid.lat,
    geo.centroid.lon,
    'USD',
    1.8,
    base.diurnalBias,
    [capitalCity, secondaryCity]
  );

  syntheticCountryCache.set(geo.isoNumeric || geo.name, synthetic);
  return synthetic;
}

export function getAllFlagshipCountries(): CountryNode[] {
  return CONTINENTS.flatMap((c) => c.countries);
}

export function getGlobalProfile(): PaymentProfile {
  const volSum = CONTINENTS.reduce((s, c) => s + c.profile.annualVolumeCount, 0);
  const amtSum = CONTINENTS.reduce((s, c) => s + c.profile.dailyAmountUsd, 0);
  const custSum = CONTINENTS.reduce((s, c) => s + c.profile.activeCustomers, 0);
  const merchSum = CONTINENTS.reduce((s, c) => s + c.profile.activeMerchants, 0);

  return {
    annualVolumeCount: volSum,
    dailyAmountUsd: amtSum,
    activeCustomers: custSum,
    activeMerchants: merchSum,
    volumeMix: averageSplits(
      CONTINENTS.map((c) => ({ weight: c.profile.annualVolumeCount, split: c.profile.volumeMix }))
    ),
    amountMix: averageSplits(
      CONTINENTS.map((c) => ({ weight: c.profile.dailyAmountUsd, split: c.profile.amountMix }))
    ),
    customerMix: averageSplits(
      CONTINENTS.map((c) => ({ weight: c.profile.activeCustomers, split: c.profile.customerMix }))
    ),
    merchantMix: averageSplits(
      CONTINENTS.map((c) => ({ weight: c.profile.activeMerchants, split: c.profile.merchantMix }))
    ),
    diurnalBias: 'balanced',
  };
}

// ============================================================================
// DIURNAL TIME-OF-DAY PAYMENT CURVE ENGINE
// ============================================================================

function gaussian(x: number, mu: number, sigma: number): number {
  let dx = Math.abs(x - mu);
  if (dx > 12) dx = 24 - dx;
  return Math.exp(-(dx * dx) / (2 * sigma * sigma));
}

export function formatCompactNumber(val: number, isCurrency = false): string {
  const prefix = isCurrency ? '$' : '';
  if (val >= 1_000_000_000_000) return `${prefix}${(val / 1_000_000_000_000).toFixed(2)}T`;
  if (val >= 1_000_000_000) return `${prefix}${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${prefix}${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${prefix}${(val / 1_000).toFixed(1)}K`;
  return `${prefix}${Math.round(val).toLocaleString()}`;
}

export function computeSnapshotForHour(
  profile: PaymentProfile,
  hourFloat: number
): ComputedPaymentSnapshot {
  const h = ((hourFloat % 24) + 24) % 24;

  // Channel diurnal modulation waves:
  // Morning commute (07:30) + Evening commute (17:45) -> NFC Contactless surge
  const nfcWave = 1 + 0.34 * gaussian(h, 7.8, 1.8) + 0.24 * gaussian(h, 17.8, 1.7) - 0.22 * gaussian(h, 3.0, 2.2);
  // Midday commercial & B2B hours (12:30) -> Card Payments surge
  const cardWave = 1 + 0.30 * gaussian(h, 13.0, 3.0) - 0.18 * gaussian(h, 2.5, 2.5);
  // Evening dining, retail & mobile e-commerce (19:30) -> Mobile Wallets surge
  const walletWave = 1 + 0.32 * gaussian(h, 19.5, 2.8) + 0.12 * gaussian(h, 12.0, 2.0) - 0.12 * gaussian(h, 4.0, 2.0);
  // Late evening / cross-timezone remittance & P2P (21:30 & 06:00) -> MFS surge
  const mfsWave = 1 + 0.36 * gaussian(h, 21.8, 3.0) + 0.18 * gaussian(h, 7.0, 2.0);
  // Banking hours A2A, payroll, bill-pay (10:30 & 15:30) + evening transfers (20:00) -> Banking Apps surge
  const bankAppWave = 1 + 0.32 * gaussian(h, 11.0, 2.4) + 0.24 * gaussian(h, 15.5, 2.0) + 0.14 * gaussian(h, 20.0, 2.0) - 0.25 * gaussian(h, 3.0, 2.5);
  // Midday desk checkout (13:00) & prime evening e-commerce (20:45) -> Payment Gateways surge
  const gatewayWave = 1 + 0.22 * gaussian(h, 13.0, 2.5) + 0.36 * gaussian(h, 20.8, 2.6) - 0.18 * gaussian(h, 4.5, 2.2);
  // Afternoon merchant settlement/clearing (15:00) & retail aggregation (18:30) -> PSP & PSO surge
  const pspWave = 1 + 0.30 * gaussian(h, 15.0, 2.5) + 0.24 * gaussian(h, 18.5, 2.2) - 0.20 * gaussian(h, 3.5, 2.4);

  // Activity curve by location diurnalBias
  let activityIndex = 0.85;
  switch (profile.diurnalBias) {
    case 'commuter':
      activityIndex = 0.55 + 0.65 * gaussian(h, 8.2, 2.0) + 0.68 * gaussian(h, 17.8, 2.1) + 0.25 * gaussian(h, 13.0, 2.5);
      break;
    case 'commerce':
      activityIndex = 0.45 + 0.85 * gaussian(h, 13.5, 3.4) + 0.25 * gaussian(h, 18.5, 2.0);
      break;
    case 'nightlife':
      activityIndex = 0.48 + 0.92 * gaussian(h, 20.5, 2.7) + 0.28 * gaussian(h, 13.5, 2.5);
      break;
    case 'remittance':
      activityIndex = 0.62 + 0.55 * gaussian(h, 20.0, 3.2) + 0.42 * gaussian(h, 10.5, 2.8);
      break;
    default:
      activityIndex = 0.55 + 0.65 * gaussian(h, 14.5, 4.2);
  }

  const modulate = (base: ChannelSplit, damping: number): ChannelSplit =>
    normalizeSplit({
      mobileWallets: base.mobileWallets * (1 + (walletWave - 1) * damping),
      mfs: base.mfs * (1 + (mfsWave - 1) * damping),
      cardPayments: base.cardPayments * (1 + (cardWave - 1) * damping),
      nfcContactless: base.nfcContactless * (1 + (nfcWave - 1) * damping),
      bankingApps: base.bankingApps * (1 + (bankAppWave - 1) * damping),
      paymentGateways: base.paymentGateways * (1 + (gatewayWave - 1) * damping),
      pspPso: base.pspPso * (1 + (pspWave - 1) * damping),
    });

  // Volume shifts strongly by hour; Merchant acceptance shifts gently
  const volumePercentages = modulate(profile.volumeMix, 1.0);
  const amountPercentages = modulate(profile.amountMix, 0.85);
  const customerPercentages = modulate(profile.customerMix, 0.65);
  const merchantPercentages = modulate(profile.merchantMix, 0.28);

  const volRaw = profile.annualVolumeCount * activityIndex;
  const amtRaw = profile.dailyAmountUsd * activityIndex;
  const custRaw = profile.activeCustomers * (0.68 + 0.38 * activityIndex);
  const merchRaw = profile.activeMerchants * (0.85 + 0.16 * activityIndex);

  const volMeta = METRIC_META[PaymentMetric.VOLUME];
  const amtMeta = METRIC_META[PaymentMetric.AMOUNT];
  const custMeta = METRIC_META[PaymentMetric.CUSTOMER_COUNT];
  const merchMeta = METRIC_META[PaymentMetric.MERCHANT_COUNT];

  const volume: ComputedMetricBreakdown = {
    metric: PaymentMetric.VOLUME,
    label: volMeta.label,
    totalFormatted: formatCompactNumber(volRaw, false),
    rawTotal: volRaw,
    percentages: volumePercentages,
  };
  const amount: ComputedMetricBreakdown = {
    metric: PaymentMetric.AMOUNT,
    label: amtMeta.label,
    totalFormatted: formatCompactNumber(amtRaw, true),
    rawTotal: amtRaw,
    percentages: amountPercentages,
  };
  const customerCount: ComputedMetricBreakdown = {
    metric: PaymentMetric.CUSTOMER_COUNT,
    label: custMeta.label,
    totalFormatted: formatCompactNumber(custRaw, false),
    rawTotal: custRaw,
    percentages: customerPercentages,
  };
  const merchantCount: ComputedMetricBreakdown = {
    metric: PaymentMetric.MERCHANT_COUNT,
    label: merchMeta.label,
    totalFormatted: formatCompactNumber(merchRaw, false),
    rawTotal: merchRaw,
    percentages: merchantPercentages,
  };

  // Determine peak channel by volume
  const entries: Array<[PaymentChannel, number]> = ALL_PAYMENT_CHANNELS.map((ch) => [
    ch,
    volumePercentages[CHANNEL_META[ch].key],
  ]);
  entries.sort((a, b) => b[1] - a[1]);

  return {
    volume,
    amount,
    customerCount,
    merchantCount,
    activityIndex,
    peakChannel: entries[0][0],
  };
}

export function getMetricBreakdown(
  snapshot: ComputedPaymentSnapshot,
  metric: PaymentMetric
): ComputedMetricBreakdown {
  switch (metric) {
    case PaymentMetric.AMOUNT:
      return snapshot.amount;
    case PaymentMetric.CUSTOMER_COUNT:
      return snapshot.customerCount;
    case PaymentMetric.MERCHANT_COUNT:
      return snapshot.merchantCount;
    default:
      return snapshot.volume;
  }
}

export interface CrossBorderArcSpec {
  id: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  channel: PaymentChannel;
  label: string;
}

export const GLOBAL_PAYMENT_ARCS: CrossBorderArcSpec[] = [
  { id: 'arc-nyc-lon', fromLat: 40.71, fromLon: -74.0, toLat: 51.51, toLon: -0.13, channel: PaymentChannel.NFC_CONTACTLESS, label: 'NY ↔ London' },
  { id: 'arc-lon-fra', fromLat: 51.51, fromLon: -0.13, toLat: 50.11, toLon: 8.68, channel: PaymentChannel.BANKING_APPS, label: 'London ↔ Frankfurt Open Banking' },
  { id: 'arc-lon-dxb', fromLat: 51.51, fromLon: -0.13, toLat: 25.2, toLon: 55.27, channel: PaymentChannel.CARD_PAYMENTS, label: 'London ↔ Dubai' },
  { id: 'arc-dxb-dac', fromLat: 25.2, fromLon: 55.27, toLat: 23.81, toLon: 90.41, channel: PaymentChannel.MFS, label: 'Dubai ↔ Dhaka MFS' },
  { id: 'arc-sg-dac', fromLat: 1.35, fromLon: 103.82, toLat: 23.81, toLon: 90.41, channel: PaymentChannel.PSP_PSO, label: 'Singapore ↔ Dhaka PSO Switch' },
  { id: 'arc-sg-sh', fromLat: 1.35, fromLon: 103.82, toLat: 31.23, toLon: 121.47, channel: PaymentChannel.MOBILE_WALLETS, label: 'Singapore ↔ Shanghai' },
  { id: 'arc-sh-tyo', fromLat: 31.23, fromLon: 121.47, toLat: 35.68, toLon: 139.65, channel: PaymentChannel.NFC_CONTACTLESS, label: 'Shanghai ↔ Tokyo' },
  { id: 'arc-tyo-sf', fromLat: 35.68, fromLon: 139.65, toLat: 37.77, toLon: -122.42, channel: PaymentChannel.PAYMENT_GATEWAYS, label: 'Tokyo ↔ San Francisco Gateway' },
  { id: 'arc-sf-nyc', fromLat: 37.77, fromLon: -122.42, toLat: 40.71, toLon: -74.0, channel: PaymentChannel.PAYMENT_GATEWAYS, label: 'SF ↔ NY Checkout API' },
  { id: 'arc-lon-nbo', fromLat: 51.51, fromLon: -0.13, toLat: -1.29, toLon: 36.82, channel: PaymentChannel.MFS, label: 'London ↔ Nairobi MFS' },
  { id: 'arc-bom-sg', fromLat: 19.07, fromLon: 72.87, toLat: 1.35, toLon: 103.82, channel: PaymentChannel.BANKING_APPS, label: 'Mumbai ↔ Singapore Instant A2A' },
  { id: 'arc-dxb-bom', fromLat: 25.2, fromLon: 55.27, toLat: 19.07, toLon: 72.87, channel: PaymentChannel.PSP_PSO, label: 'Dubai ↔ Mumbai PSP Corridor' },
  { id: 'arc-gru-nyc', fromLat: -23.55, fromLon: -46.63, toLat: 40.71, toLon: -74.0, channel: PaymentChannel.MOBILE_WALLETS, label: 'São Paulo ↔ NY' },
  { id: 'arc-syd-sg', fromLat: -33.87, fromLon: 151.21, toLat: 1.35, toLon: 103.82, channel: PaymentChannel.NFC_CONTACTLESS, label: 'Sydney ↔ Singapore' },
  { id: 'arc-los-lon', fromLat: 6.52, fromLon: 3.37, toLat: 51.51, toLon: -0.13, channel: PaymentChannel.PSP_PSO, label: 'Lagos ↔ London PSP Settlement' },
];

export function resolveSelectionData(
  level: HierarchyLevel,
  continentId: string | null,
  countryId: string | null,
  cityId: string | null,
  localAreaId: string | null,
  syntheticCountries: Map<string, CountryNode>
): {
  title: string;
  subtitle: string;
  profile: PaymentProfile;
  continent: ContinentNode | null;
  country: CountryNode | null;
  city: CityNode | null;
  localArea: LocalAreaNode | null;
} {
  const continent = continentId ? CONTINENTS.find((c) => c.id === continentId) || null : null;
  const country =
    countryId
      ? continent?.countries.find((c) => c.id === countryId) ||
        getAllFlagshipCountries().find((c) => c.id === countryId) ||
        syntheticCountries.get(countryId) ||
        null
      : null;
  const city = cityId && country ? country.cities.find((ct) => ct.id === cityId) || null : null;
  const localArea =
    localAreaId && city ? city.localAreas.find((la) => la.id === localAreaId) || null : null;

  if (level === HierarchyLevel.LOCAL_AREA && localArea && city && country) {
    return {
      title: localArea.name,
      subtitle: `${localArea.districtType} · ${city.name}, ${country.name}`,
      profile: localArea.profile,
      continent,
      country,
      city,
      localArea,
    };
  }
  if (level === HierarchyLevel.CITY && city && country) {
    return {
      title: city.name,
      subtitle: `${city.populationLabel} · ${country.name}`,
      profile: city.profile,
      continent,
      country,
      city,
      localArea: null,
    };
  }
  if (level === HierarchyLevel.COUNTRY && country) {
    return {
      title: country.name,
      subtitle: `${country.cities.length} Major Cities · ${country.currencyCode} Rails`,
      profile: country.profile,
      continent: continent || CONTINENTS.find((c) => c.id === country.continentId) || null,
      country,
      city: null,
      localArea: null,
    };
  }
  if (level === HierarchyLevel.CONTINENT && continent) {
    return {
      title: continent.name,
      subtitle: `${continent.countries.length} Digital Payment Markets`,
      profile: continent.profile,
      continent,
      country: null,
      city: null,
      localArea: null,
    };
  }
  return {
    title: 'Global Digital Payments',
    subtitle: '6 Continents · All Digital Rails',
    profile: getGlobalProfile(),
    continent: null,
    country: null,
    city: null,
    localArea: null,
  };
}

// Keep getGeoCountries warm on import if needed
export { getGeoCountries };
