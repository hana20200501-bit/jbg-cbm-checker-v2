
import type { Timestamp } from 'firebase/firestore';

export interface Shipper {
  id: string; // Unique ID for the shipper
  uniqueNumber?: string; // User-defined unique number for grouping
  nameKr: string;
  nameEn: string;
  contact?: string;
  boxFeature1?: string;
  invoiceNumber?: string;
  imageUrl?: string | null;
  region?: string; // 지역명
  isUrgent?: boolean; // 긴급 화주 여부
  isConfirmed?: boolean; // 관리자 확인 여부
  createdAt: Timestamp | { seconds: number, nanoseconds: number };
}

export interface Box {
  id: string; // Unique ID for each box
  shipperId: string; // Foreign key linking to the Shipper
  boxNumber: number; // e.g., Box 1, Box 2
  customName?: string; // Optional custom name for the box
  width: string;
  length: string;
  height: string;
  cbm: number;
  imageUrl?: string | null; // URL for the uploaded image of the box
}


// This is a client-side-only type, for combining data for the UI
export interface ShipperWithBoxData extends Shipper {
    boxes: Box[];
    totalCbm: number;
    completedBoxes: number;
    createdAtTimestamp: number; // for sorting
    representativeBoxImageUrl?: string | null;
}

export type Role = 'manager' | 'worker' | null;

    