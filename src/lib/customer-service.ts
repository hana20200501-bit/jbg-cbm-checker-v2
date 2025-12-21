/**
 * Customer 360 Service Layer
 * 
 * 📌 고객 대시보드를 위한 핵심 비즈니스 로직
 * - 고객 정보 조회
 * - 거래 내역 (History Timeline)
 * - 통계 계산 (Meta-data Aggregation)
 * - 인보이스 관리
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    updateDoc,
    Timestamp,
    writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Customer, Shipment, CustomerStats } from '@/types';

// =============================================================================
// Types
// =============================================================================

export interface CustomerHistory {
    shipments: ShipmentHistoryItem[];
    totalCount: number;
    hasMore: boolean;
}

export interface ShipmentHistoryItem {
    id: string;
    date: string;               // 입고일 (arrivalDate)
    voyageId: string;           // 항차 ID
    voyageName?: string;        // 항차명 (조회 후 채움)
    itemName: string;           // 품목명 (rawName)
    qty: number;                // 수량
    workerMeasuredCbm?: number; // 📌 작업자 측정 CBM (핵심!)
    price?: number;             // 금액
    status: 'IN_WAREHOUSE' | 'SHIPPED' | 'INVOICED' | 'DELIVERED';
    invoiceId?: string;         // 연결된 인보이스 ID
    invoiceNumber?: string;     // 인보이스 번호 (INV-2025-001)
}

export interface CustomerInvoice {
    id: string;
    invoiceNumber: string;      // INV-2025-001
    createdAt: Date;
    dueDate?: Date;
    totalAmount: number;
    status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
    shipmentIds: string[];      // 포함된 화물 ID 목록
    pdfUrl?: string;            // 생성된 PDF URL
}

// =============================================================================
// 📌 Core Functions
// =============================================================================

/**
 * 고객 상세 정보 조회
 */
export async function getCustomerById(customerId: string): Promise<Customer | null> {
    if (!db) {
        console.warn('[CustomerService] Firebase not configured');
        return null;
    }

    try {
        const docRef = doc(db, 'customers', customerId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Customer;
        }
        return null;
    } catch (error) {
        console.error('[CustomerService] getCustomerById error:', error);
        return null;
    }
}

/**
 * 고객 거래 내역 조회 (History Timeline)
 * 📌 핵심: customerId로 shipments 조회, arrivalDate 내림차순 정렬
 */
export async function getCustomerHistory(
    customerId: string,
    limitCount: number = 50
): Promise<CustomerHistory> {
    if (!db) {
        console.warn('[CustomerService] Firebase not configured');
        return { shipments: [], totalCount: 0, hasMore: false };
    }

    try {
        const shipmentsRef = collection(db, 'shipments');
        const q = query(
            shipmentsRef,
            where('customerId', '==', customerId),
            orderBy('createdAt', 'desc'),
            limit(limitCount + 1) // +1 for hasMore check
        );

        const querySnapshot = await getDocs(q);
        const shipments: ShipmentHistoryItem[] = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data() as Shipment;

            // 상태 변환
            let status: ShipmentHistoryItem['status'] = 'IN_WAREHOUSE';
            if (data.items && data.items.length > 0) {
                status = 'INVOICED';
            } else if (data.totalCbm && data.totalCbm > 0) {
                status = 'SHIPPED';
            }

            shipments.push({
                id: docSnap.id,
                date: data.arrivalDate || formatTimestamp(data.createdAt),
                voyageId: data.voyageId,
                itemName: data.rawName || data.customerName || '(미확인)',
                qty: data.qty || 1,
                workerMeasuredCbm: data.totalCbm,
                price: data.total,
                status,
                invoiceId: (data as any).invoiceId,
                invoiceNumber: (data as any).invoiceNumber,
            });
        });

        const hasMore = shipments.length > limitCount;
        if (hasMore) shipments.pop(); // Remove the extra item

        return {
            shipments,
            totalCount: shipments.length,
            hasMore,
        };
    } catch (error) {
        console.error('[CustomerService] getCustomerHistory error:', error);
        return { shipments: [], totalCount: 0, hasMore: false };
    }
}

/**
 * 고객 통계 계산 (Meta-data Aggregation)
 * 📌 실시간 계산 또는 캐싱된 값 반환
 */
export async function calculateCustomerStats(customerId: string): Promise<CustomerStats> {
    if (!db) {
        return { count: 0, totalAmount: 0, totalCbm: 0 };
    }

    try {
        const shipmentsRef = collection(db, 'shipments');
        const q = query(
            shipmentsRef,
            where('customerId', '==', customerId)
        );

        const querySnapshot = await getDocs(q);

        let count = 0;
        let totalAmount = 0;
        let totalCbm = 0;
        let lastOrderDate: Timestamp | null = null;

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data() as Shipment;
            count++;
            totalAmount += data.total || 0;
            totalCbm += data.totalCbm || 0;

            // 가장 최근 날짜 추적
            const createdAt = data.createdAt as Timestamp;
            if (!lastOrderDate || (createdAt && createdAt.seconds > lastOrderDate.seconds)) {
                lastOrderDate = createdAt;
            }
        });

        return {
            count,
            totalAmount,
            totalCbm,
            lastOrderDate: lastOrderDate || undefined,
        };
    } catch (error) {
        console.error('[CustomerService] calculateCustomerStats error:', error);
        return { count: 0, totalAmount: 0, totalCbm: 0 };
    }
}

/**
 * 고객 인보이스 목록 조회
 */
export async function getCustomerInvoices(customerId: string): Promise<CustomerInvoice[]> {
    if (!db) {
        return [];
    }

    try {
        const invoicesRef = collection(db, 'invoices');
        const q = query(
            invoicesRef,
            where('customerId', '==', customerId),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const querySnapshot = await getDocs(q);
        const invoices: CustomerInvoice[] = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            invoices.push({
                id: docSnap.id,
                invoiceNumber: data.invoiceNumber || `INV-${docSnap.id.slice(0, 6)}`,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                dueDate: data.dueDate?.toDate?.(),
                totalAmount: data.totalAmount || 0,
                status: data.status || 'DRAFT',
                shipmentIds: data.shipmentIds || [],
                pdfUrl: data.pdfUrl,
            });
        });

        return invoices;
    } catch (error) {
        console.error('[CustomerService] getCustomerInvoices error:', error);
        return [];
    }
}

/**
 * 인보이스 생성 (선택된 화물들로부터)
 */
export async function generateInvoice(
    customerId: string,
    shipmentIds: string[]
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
    if (!db) {
        return { success: false, error: 'Firebase not configured' };
    }

    try {
        const batch = writeBatch(db);

        // 1. 인보이스 번호 생성
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        const invoiceNumber = `INV-${year}${month}-${randomPart}`;

        // 2. 선택된 화물들의 정보 수집
        let totalAmount = 0;
        for (const shipmentId of shipmentIds) {
            const shipmentRef = doc(db, 'shipments', shipmentId);
            const shipmentSnap = await getDoc(shipmentRef);

            if (shipmentSnap.exists()) {
                const data = shipmentSnap.data() as Shipment;
                totalAmount += data.total || 0;

                // 화물 상태 업데이트: BILLED
                batch.update(shipmentRef, {
                    status: 'Invoiced',
                    invoiceNumber,
                    invoicedAt: Timestamp.now(),
                });
            }
        }

        // 3. 인보이스 문서 생성
        const invoicesRef = collection(db, 'invoices');
        const newInvoiceRef = doc(invoicesRef);

        batch.set(newInvoiceRef, {
            invoiceNumber,
            customerId,
            shipmentIds,
            totalAmount,
            status: 'DRAFT',
            createdAt: Timestamp.now(),
        });

        await batch.commit();

        return { success: true, invoiceId: newInvoiceRef.id };
    } catch (error) {
        console.error('[CustomerService] generateInvoice error:', error);
        return { success: false, error: String(error) };
    }
}

/**
 * 고객 Preferences/Financials 업데이트
 */
export async function updateCustomerPreferences(
    customerId: string,
    updates: {
        preferences?: Customer['preferences'];
        financials?: Customer['financials'];
    }
): Promise<boolean> {
    if (!db) return false;

    try {
        const docRef = doc(db, 'customers', customerId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: Timestamp.now(),
        });
        return true;
    } catch (error) {
        console.error('[CustomerService] updateCustomerPreferences error:', error);
        return false;
    }
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimestamp(ts: any): string {
    if (!ts) return '-';
    const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}
