// =============================================================================
// Brand configuration — single source of truth for the whitelabel demo.
// =============================================================================

export interface BrandConfig {
  name: string;
  shortName: string;
  productName: string;
  productNameAccent: string;
  voiceAssistantName: string;
  logoUrl: string;
  logoAlt: string;
  tagline: string;
  caseStudyDescription: string;
  partnerBannerName: string;
  primaryHex: string;
  logoHasWordmark: boolean;
}

function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

export const BRAND: BrandConfig = {
  name: 'Helix Insurance',
  shortName: 'Helix',
  productName: 'Insurance AI',
  productNameAccent: 'Claims Intelligence',
  voiceAssistantName: 'Leo',
  logoUrl: publicAsset('brand-logo.png'),
  logoAlt: 'Helix Insurance',
  tagline: 'Plataforma comercial para tramitación inteligente de siniestros',
  caseStudyDescription:
    'Procesamiento de partes de seguro automatizado con IA gobernada. Resolución de siniestros auditable, trazable y en segundos.',
  partnerBannerName: 'Helix Insurance',
  primaryHex: '#2563EB',
  logoHasWordmark: false,
};
