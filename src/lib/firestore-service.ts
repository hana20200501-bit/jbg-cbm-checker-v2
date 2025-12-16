/**
 * ERP Firestore 서비스
 * 
 * 📌 컬렉션 구조:
 * 
 * customers/{customerName}
 *   - Master Data (고객 원장)
 *   - Document ID = 한글 고객명
 * 
 * voyages/{voyageId}
 *   - 항차 데이터
 *   - Document ID = "2025-12-01-1" 형식
 * 
 * voyages/{voyageId}/shipments/{shipmentId}
 *   - 화물 데이터 (항차 하위)
 *   - Sub-collection으로 관리
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    writeBatch,
    serverTimestamp,
    Timestamp,
    increment,
    type DocumentData,
    type QueryConstraint,
} from 'firebase/firestore';
import { db, CUSTOMER_COLLECTION, VOYAGE_COLLECTION, SHIPMENT_COLLECTION } from './firebase';
import type { Customer, Voyage, Shipment, VoyageStatus, ShipmentStatus } from '@/types';

// =============================================================================
// 타입 변환 유틸리티
// =============================================================================

const toTimestamp = (date: Date | number): Timestamp => {
    if (typeof date === 'number') {
        return Timestamp.fromMillis(date);
    }
    return Timestamp.fromDate(date);
};

const fromFirestore = <T>(data: DocumentData): T => {
    // Timestamp 필드를 표준 형식으로 변환
    const convertTimestamp = (obj: any): any => {
        if (!obj) return obj;
        if (obj instanceof Timestamp) {
            return { seconds: obj.seconds, nanoseconds: obj.nanoseconds };
        }
        if (Array.isArray(obj)) {
            return obj.map(convertTimestamp);
        }
        if (typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
                result[key] = convertTimestamp(obj[key]);
            }
            return result;
        }
        return obj;
    };
    return convertTimestamp(data) as T;
};

// =============================================================================
// Customer (고객) CRUD
// =============================================================================

/**
 * 고객 저장 (생성 또는 업데이트)
 * Document ID = 고객명
 */
export async function saveCustomer(customer: Omit<Customer, 'createdAt'> & { createdAt?: any }): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, CUSTOMER_COLLECTION, customer.name);

    // 기존 문서 확인
    const existing = await getDoc(docRef);

    if (existing.exists()) {
        // 업데이트 - createdAt 유지
        const { createdAt, ...updateData } = customer;
        await updateDoc(docRef, {
            ...updateData,
            updatedAt: serverTimestamp(),
        });
    } else {
        // 신규 생성
        await setDoc(docRef, {
            ...customer,
            id: customer.name,
            createdAt: serverTimestamp(),
        });
    }
}

/**
 * 고객 조회 (단일)
 */
export async function getCustomer(customerName: string): Promise<Customer | null> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, CUSTOMER_COLLECTION, customerName);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return fromFirestore<Customer>({ id: docSnap.id, ...docSnap.data() });
}

/**
 * 모든 고객 조회
 */
export async function getAllCustomers(activeOnly: boolean = true): Promise<Customer[]> {
    if (!db) throw new Error('Firestore not initialized');

    const constraints: QueryConstraint[] = [];
    if (activeOnly) {
        constraints.push(where('isActive', '==', true));
    }
    constraints.push(orderBy('podCode', 'asc'));

    const q = query(collection(db, CUSTOMER_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => fromFirestore<Customer>({ id: doc.id, ...doc.data() }));
}

/**
 * 고객 통계 업데이트 (화물 저장 시 호출)
 */
export async function updateCustomerStats(
    customerName: string,
    amountDelta: number,
    cbmDelta: number = 0
): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, CUSTOMER_COLLECTION, customerName);
    await updateDoc(docRef, {
        'stats.count': increment(1),
        'stats.totalAmount': increment(amountDelta),
        'stats.totalCbm': increment(cbmDelta),
        updatedAt: serverTimestamp(),
    });
}

/**
 * 고객 비활성화 (소프트 삭제)
 */
export async function deactivateCustomer(customerName: string): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, CUSTOMER_COLLECTION, customerName);
    await updateDoc(docRef, {
        isActive: false,
        updatedAt: serverTimestamp(),
    });
}

// =============================================================================
// Voyage (항차) CRUD
// =============================================================================

/**
 * 항차 생성
 */
export async function createVoyage(voyage: Omit<Voyage, 'id' | 'createdAt' | 'totalShipments' | 'totalCbm' | 'totalAmount'>): Promise<string> {
    if (!db) throw new Error('Firestore not initialized');

    // ID 생성: "2025-12-01-1" 형식
    const voyageId = voyage.name.replace(/\s+/g, '-').replace(/\./g, '-');
    const docRef = doc(db, VOYAGE_COLLECTION, voyageId);

    await setDoc(docRef, {
        ...voyage,
        id: voyageId,
        totalShipments: 0,
        totalCbm: 0,
        totalAmount: 0,
        createdAt: serverTimestamp(),
    });

    return voyageId;
}

/**
 * 항차 조회 (단일)
 */
export async function getVoyage(voyageId: string): Promise<Voyage | null> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, VOYAGE_COLLECTION, voyageId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return fromFirestore<Voyage>({ id: docSnap.id, ...docSnap.data() });
}

/**
 * 모든 항차 조회
 */
export async function getAllVoyages(statuses?: VoyageStatus[]): Promise<Voyage[]> {
    if (!db) throw new Error('Firestore not initialized');

    const constraints: QueryConstraint[] = [];
    if (statuses && statuses.length > 0) {
        constraints.push(where('status', 'in', statuses));
    }
    constraints.push(orderBy('departureDate', 'desc'));

    const q = query(collection(db, VOYAGE_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => fromFirestore<Voyage>({ id: doc.id, ...doc.data() }));
}

/**
 * 항차 상태 업데이트
 */
export async function updateVoyageStatus(voyageId: string, status: VoyageStatus): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, VOYAGE_COLLECTION, voyageId);
    const updates: any = { status, updatedAt: serverTimestamp() };

    if (status === 'ARRIVED') {
        updates.arrivalDate = serverTimestamp();
    }

    await updateDoc(docRef, updates);
}

/**
 * 항차 통계 업데이트 (화물 저장 시 자동)
 */
export async function updateVoyageStats(
    voyageId: string,
    shipmentsDelta: number,
    cbmDelta: number,
    amountDelta: number
): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, VOYAGE_COLLECTION, voyageId);
    await updateDoc(docRef, {
        totalShipments: increment(shipmentsDelta),
        totalCbm: increment(cbmDelta),
        totalAmount: increment(amountDelta),
        updatedAt: serverTimestamp(),
    });
}

// =============================================================================
// Shipment (화물) CRUD
// =============================================================================

/**
 * 화물 일괄 저장 (Import 시 사용) - with Progress
 * 
 * 📌 개선사항:
 * - Root Collection 사용 (전체 조회 가능)
 * - 400건 단위 배치 처리 (Firestore 제한 500 대응)
 * - Progress callback 지원
 * - CustomerSnapshot 포함
 */
export async function saveShipmentsBatch(
    voyageId: string,
    shipments: Array<{
        customerId: string;
        customerName: string;
        podCode: number;
        phone?: string;
        region?: string;
        address?: string;
        discountRate?: number;
        discountReason?: string;
        quantity: number;
        description?: string;
        memo?: string;
        courier?: string;
        rawInput?: string;
    }>,
    onProgress?: (progress: number, message: string) => void
): Promise<{ savedCount: number; errors: string[] }> {
    if (!db) throw new Error('Firestore not initialized');

    const BATCH_SIZE = 400; // Firestore limit: 500
    const errors: string[] = [];
    let savedCount = 0;

    // 배치 분할
    const batches: typeof shipments[] = [];
    for (let i = 0; i < shipments.length; i += BATCH_SIZE) {
        batches.push(shipments.slice(i, i + BATCH_SIZE));
    }

    onProgress?.(0, `${shipments.length}건 처리 시작...`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchShipments = batches[batchIndex];
        const batch = writeBatch(db);

        for (const shipment of batchShipments) {
            try {
                // ⭐ Root Collection 사용
                const shipmentRef = doc(collection(db, SHIPMENT_COLLECTION));

                batch.set(shipmentRef, {
                    id: shipmentRef.id,
                    voyageId,
                    customerId: shipment.customerId,

                    // ⭐⭐⭐ SNAPSHOT: 불변 고객 정보
                    snapshot: {
                        customerName: shipment.customerName,
                        customerPodCode: shipment.podCode,
                        customerPhone: shipment.phone || '',
                        customerRegion: shipment.region || '',
                        customerAddress: shipment.address || '',
                        discountRate: shipment.discountRate || 0,
                        discountReason: shipment.discountReason || null,
                    },

                    // 화물 정보
                    courier: shipment.courier || null,
                    quantity: shipment.quantity,
                    rawInput: shipment.rawInput || null,
                    memo: shipment.memo || null,

                    // 초기값
                    items: [],
                    status: 'PENDING' as ShipmentStatus,
                    totalCbm: 0,
                    subtotal: 0,
                    discountPercent: (shipment.discountRate || 0) * 100,
                    discountAmount: 0,
                    shippingFee: 0,
                    packingFee: 0,
                    customsFee: 0,
                    otherFee: 0,
                    totalAmount: 0,
                    currency: 'USD',
                    isPaid: false,

                    createdAt: serverTimestamp(),
                });

                savedCount++;
            } catch (error) {
                errors.push(`${shipment.customerName}: ${error}`);
            }
        }

        // 배치 커밋
        await batch.commit();

        // Progress 업데이트
        const progress = Math.round((savedCount / shipments.length) * 100);
        onProgress?.(progress, `${savedCount}/${shipments.length}건 저장됨...`);
    }

    // 항차 통계 업데이트 (별도 트랜잭션)
    if (savedCount > 0) {
        const voyageRef = doc(db, VOYAGE_COLLECTION, voyageId);
        await updateDoc(voyageRef, {
            totalShipments: increment(savedCount),
            updatedAt: serverTimestamp(),
        });
    }

    onProgress?.(100, `완료! ${savedCount}건 저장됨`);

    return { savedCount, errors };
}

/**
 * 항차의 모든 화물 조회 (Root Collection)
 */
export async function getShipmentsByVoyage(voyageId: string): Promise<Shipment[]> {
    if (!db) throw new Error('Firestore not initialized');

    // ⭐ Root Collection에서 voyageId로 필터
    const q = query(
        collection(db, SHIPMENT_COLLECTION),
        where('voyageId', '==', voyageId),
        orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => fromFirestore<Shipment>({ id: doc.id, ...doc.data() }));
}

/**
 * 화물 상태 업데이트 (Root Collection)
 */
export async function updateShipmentStatus(
    voyageId: string,
    shipmentId: string,
    status: ShipmentStatus
): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    // ⭐ Root Collection
    const docRef = doc(db, SHIPMENT_COLLECTION, shipmentId);
    await updateDoc(docRef, {
        status,
        updatedAt: serverTimestamp(),
    });
}

/**
 * 화물 CBM 업데이트 (측정 완료 시) - Root Collection
 */
export async function updateShipmentCbm(
    voyageId: string,
    shipmentId: string,
    totalCbm: number,
    boxDimensions?: { length: number; width: number; height: number; quantity: number }[]
): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    // ⭐ Root Collection
    const docRef = doc(db, SHIPMENT_COLLECTION, shipmentId);
    await updateDoc(docRef, {
        totalCbm,
        boxDimensions: boxDimensions || [],
        status: 'CBM_DONE' as ShipmentStatus,
        updatedAt: serverTimestamp(),
    });

    // 항차 통계도 업데이트
    await updateVoyageStats(voyageId, 0, totalCbm, 0);
}

// =============================================================================
// 실시간 구독 (Hooks에서 사용)
// =============================================================================

/**
 * 고객 목록 실시간 구독
 */
export function subscribeToCustomers(
    callback: (customers: Customer[]) => void,
    activeOnly: boolean = true
) {
    if (!db) throw new Error('Firestore not initialized');

    const constraints: QueryConstraint[] = [];
    if (activeOnly) {
        constraints.push(where('isActive', '==', true));
    }
    constraints.push(orderBy('podCode', 'asc'));

    const q = query(collection(db, CUSTOMER_COLLECTION), ...constraints);

    return onSnapshot(q,
        (snapshot) => {
            const customers = snapshot.docs.map(doc =>
                fromFirestore<Customer>({ id: doc.id, ...doc.data() })
            );
            callback(customers);
        },
        (error) => {
            console.error('Customer subscription error:', error);
            callback([]); // 에러 시 빈 배열 반환
        }
    );
}

/**
 * 항차 목록 실시간 구독
 */
export function subscribeToVoyages(
    callback: (voyages: Voyage[]) => void,
    statuses?: VoyageStatus[]
) {
    if (!db) throw new Error('Firestore not initialized');

    const constraints: QueryConstraint[] = [];
    if (statuses && statuses.length > 0) {
        constraints.push(where('status', 'in', statuses));
    }
    constraints.push(orderBy('departureDate', 'desc'));

    const q = query(collection(db, VOYAGE_COLLECTION), ...constraints);

    return onSnapshot(q,
        (snapshot) => {
            const voyages = snapshot.docs.map(doc =>
                fromFirestore<Voyage>({ id: doc.id, ...doc.data() })
            );
            callback(voyages);
        },
        (error) => {
            console.error('Voyage subscription error:', error);
            callback([]); // 에러 시 빈 배열 반환
        }
    );
}

/**
 * 특정 항차의 화물 실시간 구독
 */
export function subscribeToShipments(
    voyageId: string,
    callback: (shipments: Shipment[]) => void
) {
    if (!db) throw new Error('Firestore not initialized');

    const shipmentsRef = collection(db, VOYAGE_COLLECTION, voyageId, SHIPMENT_COLLECTION);
    const q = query(shipmentsRef, orderBy('createdAt', 'asc'));

    return onSnapshot(q,
        (snapshot) => {
            const shipments = snapshot.docs.map(doc =>
                fromFirestore<Shipment>({ id: doc.id, ...doc.data() })
            );
            callback(shipments);
        },
        (error) => {
            console.error('Shipment subscription error:', error);
            callback([]); // 에러 시 빈 배열 반환
        }
    );
}
