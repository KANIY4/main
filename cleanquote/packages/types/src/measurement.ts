/**
 * Cross-platform measurement abstraction.
 *
 * The app never claims survey-grade accuracy. Every record keeps the capture method and
 * the device so a disputed quantity can be traced, and high-value quotes can require
 * `verifiedByUser` before the price is released.
 */

export type MeasurementType =
  | 'length'
  | 'width'
  | 'height'
  | 'area'
  | 'perimeter'
  | 'glass_area'
  | 'floor_area'
  | 'wall_area'
  | 'count'
  | 'custom';

export type MeasurementSource =
  | 'ios_roomplan'
  | 'ios_arkit'
  | 'android_arcore'
  | 'manual_camera'
  | 'photo_scale'
  | 'manual_entry'
  | 'document'
  | 'imported';

export interface MeasurementRecord {
  readonly id: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly spaceId?: string;
  readonly type: MeasurementType;
  /** Normalised SI value: metres, square metres, or a unitless count. */
  readonly value: number;
  readonly unit: 'm' | 'm2' | 'count';
  readonly source: MeasurementSource;
  /** 0-1 where the capture method reports one. AR sources always should. */
  readonly confidence?: number;
  readonly deviceModel?: string;
  readonly verifiedByUser: boolean;
  readonly evidenceFileId?: string;
  readonly createdAt: string;
}

/** Reported by the native module so the UI can pick a capture path per device. */
export interface DeviceMeasurementCapability {
  readonly platform: 'ios' | 'android' | 'web';
  readonly supportsRoomPlan: boolean;
  readonly supportsArKit: boolean;
  readonly supportsArCore: boolean;
  readonly supportsDepthApi: boolean;
  readonly hasLidar: boolean;
  /** Always true — manual entry is the universal fallback. */
  readonly supportsManualEntry: true;
}
