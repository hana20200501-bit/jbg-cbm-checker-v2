/**
 * ERP 데이터 Custom Hooks
 * 
 * Firestore 실시간 구독을 React에서 사용하기 위한 Hook들
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Customer, Voyage, Shipment, VoyageStatus } from '@/types';
import {
    subscribeToCustomers,
    subscribeToVoyages,
    subscribeToShipments,
    getAllCustomers,
    getAllVoyages,
    getShipmentsByVoyage,
    getVoyage,
} from '@/lib/firestore-service';
import { isFirebaseConfigured } from '@/lib/firebase';

// =============================================================================
// useCustomers - 고객 목록 실시간 구독
// =============================================================================

export function useCustomers(activeOnly: boolean = true) {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!isFirebaseConfigured) {
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            const unsubscribe = subscribeToCustomers((data) => {
                setCustomers(data);
                setLoading(false);
            }, activeOnly);

            return () => unsubscribe();
        } catch (err) {
            setError(err as Error);
            setLoading(false);
        }
    }, [activeOnly]);

    return { customers, loading, error };
}

// =============================================================================
// useVoyages - 항차 목록 실시간 구독
// =============================================================================

export function useVoyages(statuses?: VoyageStatus[]) {
    const [voyages, setVoyages] = useState<Voyage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // ⭐ statuses 배열 의존성 안정화
    const statusesKey = statuses ? JSON.stringify(statuses.sort()) : '';

    useEffect(() => {
        if (!isFirebaseConfigured) {
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            const parsedStatuses = statusesKey ? JSON.parse(statusesKey) : undefined;
            const unsubscribe = subscribeToVoyages((data) => {
                setVoyages(data);
                setLoading(false);
            }, parsedStatuses);

            return () => unsubscribe();
        } catch (err) {
            setError(err as Error);
            setLoading(false);
        }
    }, [statusesKey]); // ⭐ 문자열로 안정화된 의존성

    return { voyages, loading, error };
}

// =============================================================================
// useVoyage - 단일 항차 정보
// =============================================================================

export function useVoyage(voyageId: string | null) {
    const [voyage, setVoyage] = useState<Voyage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!isFirebaseConfigured || !voyageId) {
            setLoading(false);
            return;
        }

        setLoading(true);

        getVoyage(voyageId)
            .then((data) => {
                setVoyage(data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err);
                setLoading(false);
            });
    }, [voyageId]);

    return { voyage, loading, error };
}

// =============================================================================
// useShipments - 항차의 화물 목록 실시간 구독
// =============================================================================

export function useShipments(voyageId: string | null) {
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!isFirebaseConfigured || !voyageId) {
            setLoading(false);
            return;
        }

        setLoading(true);

        try {
            const unsubscribe = subscribeToShipments(voyageId, (data) => {
                setShipments(data);
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (err) {
            setError(err as Error);
            setLoading(false);
        }
    }, [voyageId]);

    return { shipments, loading, error };
}

// =============================================================================
// useCustomerSearch - 고객 검색 (로컬 필터링)
// =============================================================================

export function useCustomerSearch(searchTerm: string, customers: Customer[]) {
    const [results, setResults] = useState<Customer[]>([]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setResults(customers);
            return;
        }

        const term = searchTerm.toLowerCase();
        const filtered = customers.filter(c =>
            c.name.toLowerCase().includes(term) ||
            c.nameEn?.toLowerCase().includes(term) ||
            c.phone?.includes(term) ||
            c.region?.toLowerCase().includes(term) ||
            c.podCode.toString() === term
        );

        setResults(filtered);
    }, [searchTerm, customers]);

    return results;
}
