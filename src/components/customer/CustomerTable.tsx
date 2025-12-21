'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    ChevronUp, ChevronDown, ChevronsUpDown, Search, Users,
    Download, Plus, Edit2, Trash2, Eye, Percent, Truck, Trash
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { Customer } from '@/types';

// =============================================================================
// Types
// =============================================================================

type SortKey = 'name' | 'podCode' | 'count';
type SortDir = 'asc' | 'desc';

interface CustomerTableProps {
    customers: Customer[];
    onEdit: (customer: Customer) => void;
    onDelete: (customer: Customer) => void;
    onBulkDelete?: (customers: Customer[]) => void;
    onDeleteAll?: () => void;
    isLoading?: boolean;
}

// =============================================================================
// 📌 SIMPLIFIED CUSTOMER TABLE
// =============================================================================

export function CustomerTable({
    customers,
    onEdit,
    onDelete,
    onBulkDelete,
    onDeleteAll,
    isLoading = false,
}: CustomerTableProps) {
    const router = useRouter();

    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('podCode');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const pageSize = 50;

    // ---------------------------------------------------------------------------
    // Summary Stats (총 인원만)
    // ---------------------------------------------------------------------------
    const totalCount = customers.length;

    // ---------------------------------------------------------------------------
    // Filtered & Sorted Data
    // ---------------------------------------------------------------------------
    const filteredCustomers = useMemo(() => {
        let result = [...customers];

        // Filter by search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(term) ||
                c.nameEn?.toLowerCase().includes(term) ||
                c.phone?.includes(term) ||
                String(c.podCode).includes(term)
            );
        }

        // Sort
        result.sort((a, b) => {
            let aVal: any, bVal: any;
            switch (sortKey) {
                case 'name': aVal = a.name; bVal = b.name; break;
                case 'podCode': aVal = a.podCode; bVal = b.podCode; break;
                case 'count': aVal = a.stats?.count || 0; bVal = b.stats?.count || 0; break;
                default: aVal = a.podCode; bVal = b.podCode;
            }
            if (typeof aVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return result;
    }, [customers, searchTerm, sortKey, sortDir]);

    // ---------------------------------------------------------------------------
    // Pagination
    // ---------------------------------------------------------------------------
    const totalPages = Math.ceil(filteredCustomers.length / pageSize);
    const paginatedCustomers = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredCustomers.slice(start, start + pageSize);
    }, [filteredCustomers, currentPage, pageSize]);

    // ---------------------------------------------------------------------------
    // Handlers
    // ---------------------------------------------------------------------------
    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }, [sortKey]);

    const handleRowClick = useCallback((customer: Customer) => {
        router.push(`/admin/customers/${encodeURIComponent(customer.id)}`);
    }, [router]);

    // 전체 선택/해제
    const handleSelectAll = useCallback((checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(filteredCustomers.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    }, [filteredCustomers]);

    // 개별 선택/해제
    const handleSelectOne = useCallback((customerId: string, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) {
                next.add(customerId);
            } else {
                next.delete(customerId);
            }
            return next;
        });
    }, []);

    // 선택된 고객 목록
    const selectedCustomers = useMemo(() =>
        customers.filter(c => selectedIds.has(c.id)),
        [customers, selectedIds]
    );

    // 선택삭제 핸들러
    const handleBulkDelete = useCallback(() => {
        if (onBulkDelete && selectedCustomers.length > 0) {
            onBulkDelete(selectedCustomers);
            setSelectedIds(new Set());
        }
    }, [onBulkDelete, selectedCustomers]);

    // 전체 선택 여부
    const isAllSelected = filteredCustomers.length > 0 &&
        filteredCustomers.every(c => selectedIds.has(c.id));
    const isPartiallySelected = selectedIds.size > 0 && !isAllSelected;

    // ---------------------------------------------------------------------------
    // Sort Icon
    // ---------------------------------------------------------------------------
    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortKey !== column) return <ChevronsUpDown className="w-3 h-3 text-gray-300" />;
        return sortDir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-blue-600" />
            : <ChevronDown className="w-3 h-3 text-blue-600" />;
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="flex flex-col h-full">
            {/* ===== SIMPLE HEADER BAR ===== */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 flex items-center justify-between rounded-t-lg">
                <div className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    <span className="text-2xl font-bold">{totalCount}</span>
                    <span className="text-sm opacity-80">명</span>
                </div>
            </div>

            {/* ===== TOOLBAR ===== */}
            <div className="bg-white border-b px-4 py-2 flex items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="이름, 연락처, POD..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="pl-9 h-9"
                    />
                </div>

                {/* Result Count */}
                <span className="text-sm text-gray-500">
                    {filteredCustomers.length}건
                    {selectedIds.size > 0 && (
                        <span className="ml-1 text-blue-600">({selectedIds.size}개 선택)</span>
                    )}
                </span>

                <div className="flex-1" />

                {/* Bulk Actions */}
                {selectedIds.size > 0 && onBulkDelete && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                    >
                        <Trash className="w-4 h-4 mr-1" /> 선택삭제 ({selectedIds.size})
                    </Button>
                )}

                {onDeleteAll && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={onDeleteAll}
                    >
                        <Trash2 className="w-4 h-4 mr-1" /> 전체삭제
                    </Button>
                )}

                {/* Actions */}
                <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-1" /> Export
                </Button>
                <Button size="sm">
                    <Plus className="w-4 h-4 mr-1" /> 신규 등록
                </Button>
            </div>

            {/* ===== TABLE ===== */}
            <div className="flex-1 overflow-auto bg-white">
                <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                            <th className="border-b px-3 py-2 text-center w-10">
                                <Checkbox
                                    checked={isAllSelected}
                                    onCheckedChange={handleSelectAll}
                                    aria-label="전체 선택"
                                    className={cn(isPartiallySelected && "data-[state=checked]:bg-blue-300")}
                                />
                            </th>
                            <th className="border-b px-3 py-2 text-left w-16 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('podCode')}>
                                <div className="flex items-center gap-1"># <SortIcon column="podCode" /></div>
                            </th>
                            <th className="border-b px-3 py-2 text-left cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                                <div className="flex items-center gap-1">이름 <SortIcon column="name" /></div>
                            </th>
                            <th className="border-b px-3 py-2 text-left w-28">연락처</th>
                            <th className="border-b px-3 py-2 text-center w-16 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('count')}>
                                <div className="flex items-center justify-center gap-1">이용 <SortIcon column="count" /></div>
                            </th>
                            <th className="border-b px-3 py-2 text-left w-24">할인</th>
                            <th className="border-b px-3 py-2 text-left">배송메모</th>
                            <th className="border-b px-3 py-2 text-center w-24">액션</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={8} className="py-12 text-center text-gray-400">
                                    로딩 중...
                                </td>
                            </tr>
                        ) : paginatedCustomers.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-12 text-center text-gray-400">
                                    {searchTerm ? '검색 결과가 없습니다' : '등록된 고객이 없습니다'}
                                </td>
                            </tr>
                        ) : (
                            paginatedCustomers.map((customer) => {
                                const isSelected = selectedIds.has(customer.id);
                                return (
                                    <tr
                                        key={customer.id}
                                        onClick={() => handleRowClick(customer)}
                                        className={cn(
                                            "border-b hover:bg-blue-50 cursor-pointer transition-colors",
                                            isSelected && "bg-blue-100 hover:bg-blue-150"
                                        )}
                                    >
                                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={(checked) => handleSelectOne(customer.id, !!checked)}
                                                aria-label={`${customer.name} 선택`}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-gray-500 font-mono">
                                            #{customer.podCode}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-gray-900">{customer.name}</div>
                                            {customer.nameEn && (
                                                <div className="text-xs text-gray-400">{customer.nameEn}</div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">{customer.phone || '-'}</td>
                                        <td className="px-3 py-2 text-center font-medium">
                                            {customer.stats?.count || 0}회
                                        </td>
                                        <td className="px-3 py-2 text-xs max-w-[120px]">
                                            {customer.discountInfo ? (
                                                <span
                                                    className="text-green-700 truncate block"
                                                    title={customer.discountInfo}
                                                >
                                                    {customer.discountInfo}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600 text-xs max-w-[200px] truncate">
                                            {customer.deliveryMemo ? (
                                                <div className="flex items-center gap-1">
                                                    <Truck className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                                    <span className="truncate" title={customer.deliveryMemo}>
                                                        {customer.deliveryMemo}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => handleRowClick(customer)}
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => onEdit(customer)}
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-red-500 hover:text-red-600"
                                                    onClick={() => onDelete(customer)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ===== PAGINATION ===== */}
            {totalPages > 1 && (
                <div className="bg-white border-t px-4 py-2 flex items-center justify-between">
                    <span className="text-sm text-gray-500">
                        {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredCustomers.length)} / {filteredCustomers.length}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(1)}
                        >
                            ««
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                        >
                            «
                        </Button>
                        <span className="px-3 text-sm">
                            {currentPage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                        >
                            »
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(totalPages)}
                        >
                            »»
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerTable;
