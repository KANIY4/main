/**
 * Site capture domain: what an estimator records while walking a building.
 *
 * Every fact carries provenance. A value the AI inferred is never indistinguishable
 * from a value the estimator confirmed.
 */

/** Where a stored fact came from. Drives the verification UI and the risk engine. */
export type EvidenceSource =
  | 'user_confirmed'
  | 'ai_photo_detection'
  | 'ai_document_extraction'
  | 'ai_inference'
  | 'ar_measurement'
  | 'voice_dictation'
  | 'manual_entry'
  | 'imported_from_quote'
  | 'benchmark_estimate';

export type VerificationStatus =
  | 'unverified'
  | 'user_confirmed'
  | 'user_corrected'
  | 'marked_assumption'
  | 'deferred_to_client';

export interface Provenance {
  readonly source: EvidenceSource;
  readonly verification: VerificationStatus;
  /** 0-1. Only meaningful for AI-derived facts; undefined for user-entered values. */
  readonly confidence?: number;
  /** File ids backing the claim (photo, document page, scan). */
  readonly evidenceFileIds?: readonly string[];
  readonly capturedAt: string;
  readonly capturedByUserId?: string;
}

export type TrafficLevel =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high'
  | 'continuous_public'
  | 'shift_change_peaks'
  | 'event_driven'
  | 'seasonal';

export type SoilLevel =
  | 'light'
  | 'normal'
  | 'heavy'
  | 'severe'
  | 'grease'
  | 'dust'
  | 'construction_residue'
  | 'biological'
  | 'food_residue'
  | 'industrial_residue';

export type SurfaceType =
  | 'carpet'
  | 'vinyl'
  | 'tile'
  | 'concrete'
  | 'timber'
  | 'rubber'
  | 'epoxy'
  | 'stone'
  | 'glass'
  | 'stainless_steel'
  | 'painted'
  | 'fabric'
  | 'external_paving'
  | 'other';

export type FurnitureDensity = 'none' | 'sparse' | 'normal' | 'dense' | 'very_dense';

export type AccessDifficulty =
  | 'unrestricted'
  | 'minor_restriction'
  | 'escorted'
  | 'security_screened'
  | 'height_access'
  | 'confined_space'
  | 'controlled_environment';

export type ComplianceClass =
  | 'gmp'
  | 'haccp_controls'
  | 'healthcare_infection_control'
  | 'aged_care'
  | 'childcare'
  | 'food_safety'
  | 'pharmaceutical'
  | 'laboratory'
  | 'biosecurity'
  | 'clinical_waste'
  | 'security_clearance'
  | 'working_at_heights'
  | 'confined_space'
  | 'hazardous_chemicals'
  | 'site_induction'
  | 'environmental_reporting'
  | 'other';

export interface Space {
  readonly id: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly floorId?: string;
  readonly name: string;
  readonly roomType: string;
  readonly quantity: number;
  readonly floorAreaSqm?: number;
  readonly perimeterM?: number;
  readonly ceilingHeightM?: number;
  readonly surfaceTypes: readonly SurfaceType[];
  readonly traffic: TrafficLevel;
  readonly soil: SoilLevel;
  readonly furnitureDensity: FurnitureDensity;
  readonly accessDifficulty: AccessDifficulty;
  readonly notes?: string;
  readonly provenance: Provenance;
}

export interface CountedAsset {
  readonly id: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly spaceId?: string;
  readonly assetTypeCode: string;
  readonly quantity: number;
  readonly provenance: Provenance;
}

export type ObservationType =
  | 'cleaners_observed'
  | 'shift_duration_observed'
  | 'machinery_observed'
  | 'equipment_condition'
  | 'service_quality'
  | 'missed_areas'
  | 'stock_levels'
  | 'waste_volume'
  | 'traffic_level'
  | 'security_process'
  | 'supervisor_presence'
  | 'day_porter_presence'
  | 'consumable_replenishment'
  | 'cleaning_method'
  | 'access_delay'
  | 'client_complaint'
  | 'inefficiency'
  | 'tender_risk'
  | 'other';

/**
 * A point-in-time observation. Critically, an observed cleaner count is NOT an
 * incumbent labour model: `observationWindowComplete` records whether the estimator
 * saw the whole shift. The engine refuses to treat a partial window as a shift length.
 */
export interface Observation {
  readonly id: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly type: ObservationType;
  readonly summary: string;
  readonly numericValue?: number;
  readonly unit?: string;
  readonly observedFrom?: string;
  readonly observedTo?: string;
  readonly observationWindowComplete: boolean;
  readonly clientConfirmed: boolean;
  readonly provenance: Provenance;
}
