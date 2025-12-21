'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CustomerDetailView } from '@/components/customer/CustomerDetailView';
import { getCustomerById } from '@/lib/customer-service';
import type { Customer } from '@/types';

export default function CustomerDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Customer ID from URL (URL encoded Korean name)
    const customerId = decodeURIComponent(params.id as string);

    useEffect(() => {
        async function loadCustomer() {
            setLoading(true);
            setError(null);

            try {
                const data = await getCustomerById(customerId);
                if (data) {
                    setCustomer(data);
                } else {
                    setError('고객을 찾을 수 없습니다');
                }
            } catch (err) {
                console.error('Failed to load customer:', err);
                setError('고객 정보를 불러오는 중 오류가 발생했습니다');
            } finally {
                setLoading(false);
            }
        }

        if (customerId) {
            loadCustomer();
        }
    }, [customerId]);

    const handleBack = () => {
        router.push('/admin/customers');
    };

    const handleRefresh = async () => {
        const data = await getCustomerById(customerId);
        if (data) setCustomer(data);
    };

    // Loading State
    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
                    <p className="text-gray-500">고객 정보 로딩 중...</p>
                </div>
            </div>
        );
    }

    // Error State
    if (error || !customer) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-500 mb-4">{error || '고객을 찾을 수 없습니다'}</p>
                    <button
                        onClick={handleBack}
                        className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                    >
                        목록으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <CustomerDetailView
            customer={customer}
            onBack={handleBack}
            onRefresh={handleRefresh}
        />
    );
}
