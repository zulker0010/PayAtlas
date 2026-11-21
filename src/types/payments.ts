export enum PaymentChannel {
  MOBILE_WALLETS = 'mobile_wallets',
  MFS = 'mfs',
  CARD_PAYMENTS = 'card_payments',
  NFC_CONTACTLESS = 'nfc_contactless',
  BANKING_APPS = 'banking_apps',
  PAYMENT_GATEWAYS = 'payment_gateways',
  PSP_PSO = 'psp_pso',
}

export enum PaymentMetric {
  VOLUME = 'volume',
  AMOUNT = 'amount',
  CUSTOMER_COUNT = 'customerCount',
  MERCHANT_COUNT = 'merchantCount',
}

export enum HierarchyLevel {
  WORLD = 'world',
  CONTINENT = 'continent',
  COUNTRY = 'country',
  CITY = 'city',
  LOCAL_AREA = 'local_area',
}

export enum TimeMode {
  BROWSER_CLOCK = 'browser_clock',
  AUTO_CYCLE = 'auto_cycle',
  MANUAL = 'manual',
}

export type DiurnalPhase = 'night' | 'dawn' | 'daylight' | 'dusk';

export type MapThemeId = 'obsidian' | 'blueprint' | 'atlas';

export interface MapThemeOption {
  id: MapThemeId;
  label: string;
  shortLabel: string;
  description: string;
  swatchOcean: string;
  swatchLand: string;
  swatchAccent: string;
}

export const MAP_THEMES: MapThemeOption[] = [
  {
    id: 'obsidian',
    label: 'Midnight Vector',
    shortLabel: 'Midnight',
    description: 'Deep obsidian oceans, charcoal landmasses & crisp luminous borders',
    swatchOcean: '#060a13',
    swatchLand: '#162033',
    swatchAccent: '#38bdf8',
  },
  {
    id: 'blueprint',
    label: 'Cobalt Blueprint',
    shortLabel: 'Blueprint',
    description: 'Architectural drafting navy, cyan borders & technical grid lines',
    swatchOcean: '#061936',
    swatchLand: '#12396b',
    swatchAccent: '#22d3ee',
  },
  {
    id: 'atlas',
    label: 'Daylight Atlas',
    shortLabel: 'Atlas',
    description: 'Crisp cartographic slate oceans & warm parchment landmasses',
    swatchOcean: '#c8d9eb',
    swatchLand: '#eef3f8',
    swatchAccent: '#0284c7',
  },
];

export interface ChannelSplit {
  mobileWallets: number;
  mfs: number;
  cardPayments: number;
  nfcContactless: number;
  bankingApps: number;
  paymentGateways: number;
  pspPso: number;
}

export interface PaymentProfile {
  /** Base 24h totals */
  annualVolumeCount: number; // transactions per day (base)
  dailyAmountUsd: number; // USD value per day (base)
  activeCustomers: number;
  activeMerchants: number;
  /** Baseline channel mix (0-100, summing to 100) per metric */
  volumeMix: ChannelSplit;
  amountMix: ChannelSplit;
  customerMix: ChannelSplit;
  merchantMix: ChannelSplit;
  /** Diurnal sensitivity profile: biases shift by time of day */
  diurnalBias: 'commuter' | 'commerce' | 'remittance' | 'nightlife' | 'balanced';
}

export interface ComputedMetricBreakdown {
  metric: PaymentMetric;
  label: string;
  totalFormatted: string;
  rawTotal: number;
  percentages: ChannelSplit;
}

export interface ComputedPaymentSnapshot {
  volume: ComputedMetricBreakdown;
  amount: ComputedMetricBreakdown;
  customerCount: ComputedMetricBreakdown;
  merchantCount: ComputedMetricBreakdown;
  activityIndex: number; // 0..1.5 multiplier at current hour
  peakChannel: PaymentChannel;
}

export interface LocalAreaNode {
  id: string;
  name: string;
  districtType: string;
  lat: number;
  lon: number;
  profile: PaymentProfile;
}

export interface CityNode {
  id: string;
  name: string;
  countryId: string;
  lat: number;
  lon: number;
  populationLabel: string;
  profile: PaymentProfile;
  localAreas: LocalAreaNode[];
}

export interface CountryNode {
  id: string;
  isoNumeric?: string;
  name: string;
  continentId: string;
  lat: number;
  lon: number;
  currencyCode: string;
  profile: PaymentProfile;
  cities: CityNode[];
}

export interface ContinentNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  cameraDistance: number;
  profile: PaymentProfile;
  countries: CountryNode[];
}

export interface BreadcrumbItem {
  level: HierarchyLevel;
  id: string;
  label: string;
}

export interface HoverInfo {
  level: HierarchyLevel;
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  screenX: number;
  screenY: number;
  snapshot: ComputedPaymentSnapshot;
}

export const ALL_PAYMENT_CHANNELS: PaymentChannel[] = [
  PaymentChannel.MOBILE_WALLETS,
  PaymentChannel.MFS,
  PaymentChannel.CARD_PAYMENTS,
  PaymentChannel.NFC_CONTACTLESS,
  PaymentChannel.BANKING_APPS,
  PaymentChannel.PAYMENT_GATEWAYS,
  PaymentChannel.PSP_PSO,
];

export const CHANNEL_META: Record<
  PaymentChannel,
  {
    key: keyof ChannelSplit;
    label: string;
    shortLabel: string;
    colorHex: string;
    colorInt: number;
    description: string;
  }
> = {
  [PaymentChannel.MOBILE_WALLETS]: {
    key: 'mobileWallets',
    label: 'Mobile Wallets',
    shortLabel: 'Wallets',
    colorHex: '#0EA5E9',
    colorInt: 0x0ea5e9,
    description: 'QR & in-app super-wallets (Alipay, Apple Pay, PayPay, GCash)',
  },
  [PaymentChannel.MFS]: {
    key: 'mfs',
    label: 'MFS',
    shortLabel: 'MFS',
    colorHex: '#10B981',
    colorInt: 0x10b981,
    description: 'Mobile Financial Services & agent networks (bKash, M-Pesa, MoMo)',
  },
  [PaymentChannel.CARD_PAYMENTS]: {
    key: 'cardPayments',
    label: 'Card Payments',
    shortLabel: 'Cards',
    colorHex: '#F59E0B',
    colorInt: 0xf59e0b,
    description: 'Credit, debit & online EMV card rails (Visa, Mastercard, RuPay)',
  },
  [PaymentChannel.NFC_CONTACTLESS]: {
    key: 'nfcContactless',
    label: 'NFC & Contactless',
    shortLabel: 'NFC',
    colorHex: '#EC4899',
    colorInt: 0xec4899,
    description: 'Tap-to-pay terminals, transit gates, wearables & SoftPOS',
  },
  [PaymentChannel.BANKING_APPS]: {
    key: 'bankingApps',
    label: 'Banking Wallets & Apps',
    shortLabel: 'Bank Apps',
    colorHex: '#6366F1',
    colorInt: 0x6366f1,
    description: 'Commercial & neo-bank mobile apps, instant A2A, Zelle, Faster Payments',
  },
  [PaymentChannel.PAYMENT_GATEWAYS]: {
    key: 'paymentGateways',
    label: 'Payment Gateways',
    shortLabel: 'Gateways',
    colorHex: '#14B8A6',
    colorInt: 0x14b8a6,
    description: 'Online checkout & API gateways (Stripe, Adyen, Razorpay, SSLCommerz)',
  },
  [PaymentChannel.PSP_PSO]: {
    key: 'pspPso',
    label: 'PSP & PSO Rails',
    shortLabel: 'PSP / PSO',
    colorHex: '#F97316',
    colorInt: 0xf97316,
    description: 'Payment Service Providers, licensed PSO switches & merchant aggregators',
  },
};

export const METRIC_META: Record<
  PaymentMetric,
  { label: string; shortLabel: string; unitHint: string }
> = {
  [PaymentMetric.VOLUME]: {
    label: 'Transaction Volume',
    shortLabel: 'Volume',
    unitHint: 'Daily Tx Count',
  },
  [PaymentMetric.AMOUNT]: {
    label: 'Transaction Amount',
    shortLabel: 'Amount',
    unitHint: 'Daily Value (USD)',
  },
  [PaymentMetric.CUSTOMER_COUNT]: {
    label: 'Customer Count',
    shortLabel: 'Customers',
    unitHint: 'Active Payers',
  },
  [PaymentMetric.MERCHANT_COUNT]: {
    label: 'Merchant Count',
    shortLabel: 'Merchants',
    unitHint: 'Accepting Points',
  },
};
