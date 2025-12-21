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
 * 🚀 고객 대량 저장 (Batch Write - 500개씩 처리)
 * Excel Import 용 - 훨씬 빠른 성능
 */
export async function saveCustomersBatch(
    customers: Array<Omit<Customer, 'createdAt'> & { createdAt?: any }>
): Promise<{ saved: number; errors: string[] }> {
    if (!db) throw new Error('Firestore not initialized');
    if (customers.length === 0) return { saved: 0, errors: [] };

    let savedCount = 0;
    const errors: string[] = [];
    const batchSize = 500; // Firestore batch limit

    for (let i = 0; i < customers.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = customers.slice(i, i + batchSize);

        for (const customer of chunk) {
            try {
                const docRef = doc(db, CUSTOMER_COLLECTION, customer.name);
                const { createdAt, ...data } = customer;
                batch.set(docRef, {
                    ...data,
                    id: customer.name,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { merge: true }); // merge로 기존 데이터와 병합
            } catch (err) {
                errors.push(customer.name);
            }
        }

        try {
            await batch.commit();
            savedCount += chunk.length - errors.filter(e => chunk.some(c => c.name === e)).length;
        } catch (err) {
            console.error('[saveCustomersBatch] Batch commit failed:', err);
            chunk.forEach(c => errors.push(c.name));
        }
    }

    return { saved: savedCount, errors };
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

/**
 * 다중 고객 비활성화 (선택삭제)
 * Firestore batch 사용 - 최대 500개씩 처리
 */
export async function deactivateCustomers(customerNames: string[]): Promise<number> {
    if (!db) throw new Error('Firestore not initialized');
    if (customerNames.length === 0) return 0;

    let deactivatedCount = 0;
    const batchSize = 500; // Firestore batch limit

    for (let i = 0; i < customerNames.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = customerNames.slice(i, i + batchSize);

        for (const name of chunk) {
            const docRef = doc(db, CUSTOMER_COLLECTION, name);
            batch.update(docRef, {
                isActive: false,
                updatedAt: serverTimestamp(),
            });
        }

        await batch.commit();
        deactivatedCount += chunk.length;
    }

    return deactivatedCount;
}

/**
 * 모든 활성 고객 비활성화 (전체삭제)
 */
export async function deactivateAllCustomers(): Promise<number> {
    if (!db) throw new Error('Firestore not initialized');

    // 활성 고객 목록 조회
    const q = query(
        collection(db, CUSTOMER_COLLECTION),
        where('isActive', '==', true)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) return 0;

    const customerNames = snapshot.docs.map(doc => doc.id);
    return await deactivateCustomers(customerNames);
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
    const updates: any = {
        id: voyageId,
        status,
        updatedAt: serverTimestamp()
    };

    if (status === 'ARRIVED') {
        updates.arrivalDate = serverTimestamp();
    }

    // 📌 setDoc + merge:true -> 문서가 없으면 생성
    await setDoc(docRef, updates, { merge: true });
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
    // 📌 setDoc + merge:true -> 문서가 없으면 생성
    await setDoc(docRef, {
        id: voyageId,
        totalShipments: increment(shipmentsDelta),
        totalCbm: increment(cbmDelta),
        totalAmount: increment(amountDelta),
        updatedAt: serverTimestamp(),
    }, { merge: true });
}

/**
 * 🗑️ 항차 삭제
 */
export async function deleteVoyage(voyageId: string): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, VOYAGE_COLLECTION, voyageId);
    await deleteDoc(docRef);
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
                    status: 'DRAFT' as ShipmentStatus,  // 📌 Import 직후 DRAFT 상태
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
    // 📌 setDoc + merge:true 사용 -> 문서가 없으면 생성, 있으면 업데이트
    if (savedCount > 0) {
        const voyageRef = doc(db, VOYAGE_COLLECTION, voyageId);
        await setDoc(voyageRef, {
            id: voyageId,
            name: voyageId,  // 기본 이름
            status: 'READY',
            totalShipments: increment(savedCount),
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),  // 새로 생성될 때만 사용됨
        }, { merge: true });
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
// 📌 Shipment 승인 (Approval Workflow)
// =============================================================================

/**
 * 개별 화물 승인 (DRAFT → APPROVED)
 */
export async function approveShipment(shipmentId: string): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, SHIPMENT_COLLECTION, shipmentId);
    await updateDoc(docRef, {
        status: 'APPROVED' as ShipmentStatus,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

/**
 * 항차의 모든 DRAFT 화물 일괄 승인
 */
export async function approveAllShipments(voyageId: string): Promise<number> {
    if (!db) throw new Error('Firestore not initialized');

    // DRAFT 상태인 화물만 조회
    const q = query(
        collection(db, SHIPMENT_COLLECTION),
        where('voyageId', '==', voyageId),
        where('status', '==', 'DRAFT')
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) return 0;

    // 배치로 일괄 업데이트
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
        batch.update(doc(db!, SHIPMENT_COLLECTION, docSnap.id), {
            status: 'APPROVED' as ShipmentStatus,
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });

    await batch.commit();
    return snapshot.size;
}

/**
 * 화물 상태 업데이트 (범용)
 */
export async function updateShipmentApprovalStatus(
    shipmentId: string,
    status: ShipmentStatus
): Promise<void> {
    if (!db) throw new Error('Firestore not initialized');

    const docRef = doc(db, SHIPMENT_COLLECTION, shipmentId);
    await updateDoc(docRef, {
        status,
        updatedAt: serverTimestamp(),
    });
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
 * 📌 Root Collection 사용 (saveShipmentsBatch와 일치)
 */
export function subscribeToShipments(
    voyageId: string,
    callback: (shipments: Shipment[]) => void
) {
    if (!db) throw new Error('Firestore not initialized');

    // ⭐ Root Collection에서 voyageId로 필터 (saveShipmentsBatch와 일치)
    // 📌 인덱스에 맞춰 createdAt DESC 사용
    const q = query(
        collection(db, SHIPMENT_COLLECTION),
        where('voyageId', '==', voyageId),
        orderBy('createdAt', 'desc')
    );

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

// =============================================================================
// 📌 Batch Save Shipments (Atomic Operation)
// =============================================================================

interface StagingRecordForSave {
    stagingId: string;
    matchStatus: 'VERIFIED' | 'NEW_CUSTOMER' | 'UNTRACKED';
    matchedCustomer: Customer | null;
    warningFlag?: 'PHONE_MISMATCH' | 'REGION_MISMATCH' | null;
    raw: {
        name: string;
        phone?: string;
        region?: string;
        address?: string;
        quantity?: number;
    };
    edited: {
        name: string;
        phone?: string;
        region?: string;
    };
    // 확장 필드
    arrivalDate?: string;
    courier?: string;
    weight?: number;
    nationality?: string;
    classification?: string;
    feature?: string;
    invoice?: string;
    cargoCategory?: string;
    cargoDesc?: string;
    podCode?: number;
}

/**
 * 📌 Batch Save Shipments V2 (Staging 레코드용)
 * 
 * WriteBatch를 사용하여 모든 화물을 원자적으로 저장합니다.
 * - 500개 단위로 분할 (Firestore 제한)
 * - Snapshot 저장 (History Protection)
 * - Voyage 카운터 업데이트 (Denormalization)
 * - Audit 필드 포함
 */
export async function saveShipmentsBatchV2(
    records: StagingRecordForSave[],
    voyageId: string,
    createdBy?: string
): Promise<{ savedCount: number; errorCount: number }> {
    if (!db) throw new Error('Firestore not initialized');

    const BATCH_SIZE = 500;
    let savedCount = 0;
    let errorCount = 0;

    // 500개씩 분할
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const chunk = records.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const record of chunk) {
            try {
                // 화물 문서 참조 생성
                const shipmentsRef = collection(db, VOYAGE_COLLECTION, voyageId, SHIPMENT_COLLECTION);
                const shipmentRef = doc(shipmentsRef);

                // 📌 Snapshot 생성 (History Protection)
                const snapshot = record.matchedCustomer ? {
                    customerName: record.matchedCustomer.name,
                    customerPhone: record.matchedCustomer.phone || '',
                    customerAddress: record.matchedCustomer.addressDetail || '',
                    customerRegion: record.matchedCustomer.region || '',
                    discountRate: (record.matchedCustomer as any).discountRate || 0,
                    capturedAt: serverTimestamp(),
                } : null;

                // 📌 문자열 정제 (Sanitization)
                const cleanName = sanitizeString(record.edited?.name || record.raw.name);
                const cleanPhone = sanitizePhone(record.raw.phone);

                // 화물 데이터
                const shipmentData = {
                    // 관계
                    voyageId,
                    customerId: record.matchedCustomer?.id || null,

                    // Snapshot
                    snapshot,
                    customerName: record.matchedCustomer?.name || cleanName,
                    customerPhone: record.matchedCustomer?.phone || cleanPhone,
                    customerRegion: record.matchedCustomer?.region || record.raw.region || '',

                    // Raw Excel 데이터
                    rawName: record.raw.name,
                    qty: record.raw.quantity || 1,
                    weight: record.weight || 0,
                    nationality: record.nationality || '',
                    classification: record.classification || '',
                    arrivalDate: record.arrivalDate || '',
                    courier: record.courier || '',
                    feature: record.feature || '',
                    invoice: record.invoice || '',
                    cargoCategory: record.cargoCategory || '',
                    cargoDesc: record.cargoDesc || '',
                    podCode: record.podCode || 0,

                    // 상태
                    status: 'PENDING' as ShipmentStatus,
                    warningFlag: record.warningFlag || null,

                    // Audit 필드
                    originalRawRow: JSON.stringify(record.raw),
                    createdAt: serverTimestamp(),
                    createdBy: createdBy || 'unknown',

                    // Soft Delete 기본값
                    deleted: false,
                };

                batch.set(shipmentRef, shipmentData);
                savedCount++;
            } catch (error) {
                console.error('Error preparing shipment:', error);
                errorCount++;
            }
        }

        // 📌 Voyage 카운터 업데이트 (Denormalization)
        if (savedCount > 0) {
            const voyageRef = doc(db, VOYAGE_COLLECTION, voyageId);
            batch.update(voyageRef, {
                totalShipments: increment(chunk.length),
                updatedAt: serverTimestamp(),
            });
        }

        // Batch Commit
        await batch.commit();
    }

    return { savedCount, errorCount };
}

// =============================================================================
// 유틸리티 함수
// =============================================================================

/**
 * 문자열 정제 (trim + 보이지 않는 문자 제거)
 */
function sanitizeString(str: string | undefined): string {
    if (!str) return '';
    return str
        .trim()
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width 문자 제거
        .replace(/\s+/g, ' ');                  // 연속 공백 정리
}

/**
 * 전화번호 정규화 (숫자만)
 */
function sanitizePhone(phone: string | undefined): string {
    if (!phone) return '';
    return phone.replace(/[^0-9+]/g, '');
}
