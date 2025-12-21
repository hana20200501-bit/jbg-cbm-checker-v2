'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { StagingItem, StagingMatchStatus, StagingStats } from '@/types/staging';
import type { Customer } from '@/types';

// =============================================================================
// 📌 한글 초성 검색 유틸리티
// =============================================================================

// 초성 리스트 (ㄱ~ㅎ)
const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// 한글 문자인지 체크
const isKorean = (char: string) => {
    const code = char.charCodeAt(0);
    return (code >= 0xAC00 && code <= 0xD7A3);
};

// 초성인지 체크
const isChosung = (char: string) => CHOSUNG_LIST.includes(char);

// 한글 문자에서 초성 추출
const getChosung = (char: string): string => {
    if (!isKorean(char)) return char.toLowerCase();
    const code = char.charCodeAt(0) - 0xAC00;
    const chosungIndex = Math.floor(code / 588);
    return CHOSUNG_LIST[chosungIndex];
};

// 문자열에서 초성만 추출
const extractChosungs = (str: string): string => {
    return str.split('').map(getChosung).join('');
};

// 초성 검색 매칭 함수
const matchesChosungSearch = (name: string, searchTerm: string): boolean => {
    const lowerSearch = searchTerm.toLowerCase();
    const lowerName = name.toLowerCase();

    // 일반 검색 (이름에 검색어 포함)
    if (lowerName.includes(lowerSearch)) return true;

    // 초성 검색: 검색어가 모두 초성인 경우
    const isAllChosung = searchTerm.split('').every(isChosung);
    if (isAllChosung) {
        const nameCho = extractChosungs(name);
        return nameCho.includes(lowerSearch);
    }

    return false;
};

// =============================================================================
// Types
// =============================================================================

type TabKey = 'action' | 'verified' | 'untracked' | 'all';
type SortKey = 'arrivalDate' | 'name' | 'rowIndex';
type SortDir = 'asc' | 'desc' | null;

interface StagingGridProps {
    items: StagingItem[];
    customers: Customer[];  // 📌 고객 DB for 검색
    onUpdateItem: (id: string, updates: Partial<StagingItem['edited']>) => void;
    onArchiveItem: (id: string) => void;
    onQuickRegister: (item: StagingItem) => void;
    onLinkCustomer: (itemId: string, customerId: string) => void;
    onSaveAll: () => void;
    isSaving?: boolean;
}

// =============================================================================
// 📌 STAGING GRID - Clean Layout with Sorting & Customer Search
// =============================================================================

export function StagingGrid({
    items,
    customers,
    onUpdateItem,
    onArchiveItem,
    onQuickRegister,
    onLinkCustomer,
    onSaveAll,
    isSaving = false,
}: StagingGridProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('all');
    const [editingCell, setEditingCell] = useState<{ id: string; field: 'name' | 'qty' } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('rowIndex');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);  // 📌 검색 드롭다운
    const [selectedIndex, setSelectedIndex] = useState(0);  // 📌 키보드 네비게이션용
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Focus input when editing starts + calculate dropdown position
    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
            // 📌 Calculate position for Portal dropdown
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.top,  // Position above the input
                left: rect.left,
                width: Math.max(rect.width, 300),  // Minimum 300px width
            });
        } else {
            setDropdownPosition(null);
        }
    }, [editingCell]);

    // ---------------------------------------------------------------------------
    // 📌 SORTING HANDLER
    // ---------------------------------------------------------------------------
    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            // Toggle direction: asc -> desc -> null(default)
            if (sortDir === 'asc') setSortDir('desc');
            else if (sortDir === 'desc') { setSortDir(null); setSortKey('rowIndex'); }
            else setSortDir('asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }, [sortKey, sortDir]);

    // ---------------------------------------------------------------------------
    // Statistics (Footer)
    // ---------------------------------------------------------------------------
    const stats: StagingStats & { totalQty: number } = useMemo(() => {
        return items.reduce(
            (acc, item) => {
                acc.total++;
                acc.totalQty += item.parsed.qty || 1;
                if (item.isArchived) {
                    acc.archived++;
                } else {
                    switch (item.matchStatus) {
                        case 'VERIFIED': acc.verified++; break;
                        case 'NEW': acc.newCustomer++; break;
                        case 'WARNING': acc.warning++; break;
                        case 'UNTRACKED': acc.untracked++; break;
                    }
                }
                return acc;
            },
            { total: 0, verified: 0, newCustomer: 0, warning: 0, untracked: 0, archived: 0, totalQty: 0 }
        );
    }, [items]);

    // ---------------------------------------------------------------------------
    // Tab Filtering + Sorting
    // ---------------------------------------------------------------------------
    const filteredItems = useMemo(() => {
        let result = items.filter((item) => {
            if (item.isArchived) return activeTab === 'untracked';
            switch (activeTab) {
                case 'action': return item.matchStatus === 'NEW' || item.matchStatus === 'WARNING';
                case 'verified': return item.matchStatus === 'VERIFIED';
                case 'untracked': return item.matchStatus === 'UNTRACKED' || item.isArchived;
                case 'all': return true;
                default: return true;
            }
        });

        // 📌 Apply sorting
        if (sortKey && sortDir) {
            result = [...result].sort((a, b) => {
                let valA: string | number = '';
                let valB: string | number = '';

                if (sortKey === 'arrivalDate') {
                    valA = a.parsed.arrivalDate || '';
                    valB = b.parsed.arrivalDate || '';
                } else if (sortKey === 'name') {
                    valA = a.edited.name.toLowerCase();
                    valB = b.edited.name.toLowerCase();
                } else if (sortKey === 'rowIndex') {
                    valA = a.rowIndex;
                    valB = b.rowIndex;
                }

                if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [items, activeTab, sortKey, sortDir]);

    // ---------------------------------------------------------------------------
    // Inline Edit Handlers
    // ---------------------------------------------------------------------------
    const startEdit = useCallback((id: string, field: 'name' | 'qty', currentValue: string | number) => {
        setEditingCell({ id, field });
        setEditValue(String(currentValue).trim());
    }, []);

    const confirmEdit = useCallback(() => {
        if (!editingCell) return;
        const trimmedValue = editValue.trim();
        if (editingCell.field === 'name' && trimmedValue) {
            onUpdateItem(editingCell.id, { name: trimmedValue });
        } else if (editingCell.field === 'qty') {
            const qty = parseInt(trimmedValue) || 1;
            onUpdateItem(editingCell.id, { qty });
        }
        setEditingCell(null);
        setEditValue('');
    }, [editingCell, editValue, onUpdateItem]);

    const cancelEdit = useCallback(() => {
        setEditingCell(null);
        setEditValue('');
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
        else if (e.key === 'Escape') { cancelEdit(); }
    }, [confirmEdit, cancelEdit]);

    // ---------------------------------------------------------------------------
    // Sort Icon Component
    // ---------------------------------------------------------------------------
    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortKey !== column) return <ChevronsUpDown className="w-3 h-3 text-gray-400" />;
        if (sortDir === 'asc') return <ChevronUp className="w-3 h-3 text-blue-600" />;
        if (sortDir === 'desc') return <ChevronDown className="w-3 h-3 text-blue-600" />;
        return <ChevronsUpDown className="w-3 h-3 text-gray-400" />;
    };

    // ---------------------------------------------------------------------------
    // Status Dot
    // ---------------------------------------------------------------------------
    const StatusDot = ({ status }: { status: StagingMatchStatus }) => {
        const colors = {
            VERIFIED: 'bg-green-500',
            NEW: 'bg-purple-500',
            WARNING: 'bg-red-500',
            UNTRACKED: 'bg-gray-400',
        };
        return <span className={cn('inline-block w-2 h-2 rounded-full', colors[status])} />;
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="flex flex-col h-full border border-gray-300 bg-white">
            {/* ===== TABS ===== */}
            <div className="flex items-center border-b border-gray-300 bg-gray-50">
                {[
                    { key: 'all' as TabKey, label: '📋 전체', count: stats.total, color: 'text-gray-700' },
                    { key: 'action' as TabKey, label: '🚨 확인필요', count: stats.newCustomer + stats.warning, color: 'text-red-600' },
                    { key: 'verified' as TabKey, label: '✅ 완료', count: stats.verified, color: 'text-green-600' },
                    { key: 'untracked' as TabKey, label: '📁 기타', count: stats.untracked + stats.archived, color: 'text-gray-500' },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            'px-3 py-1.5 text-xs font-medium border-r border-gray-300 transition-colors',
                            activeTab === tab.key ? 'bg-white border-b-2 border-b-blue-500' : 'hover:bg-gray-100'
                        )}
                    >
                        <span className={activeTab === tab.key ? tab.color : 'text-gray-600'}>
                            {tab.label}
                        </span>
                        <span className="ml-1 px-1 py-0.5 text-[10px] bg-gray-200 rounded">{tab.count}</span>
                    </button>
                ))}
            </div>

            {/* ===== TABLE ===== */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-100">
                        <tr>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-6">●</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-8">#</th>
                            {/* 📌 입고일 - 정렬 가능 */}
                            <th
                                className="border border-gray-300 px-1 py-1.5 text-center w-20 cursor-pointer hover:bg-gray-200"
                                onClick={() => handleSort('arrivalDate')}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    입고일 <SortIcon column="arrivalDate" />
                                </div>
                            </th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-16">택배사</th>
                            {/* 📌 이름 - 정렬 가능 */}
                            <th
                                className="border border-gray-300 px-2 py-1.5 text-left min-w-[120px] cursor-pointer hover:bg-gray-200"
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center gap-1">
                                    이름 <SortIcon column="name" />
                                </div>
                            </th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-10">수량</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-12">중량</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-8">국적</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-16">분류</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-20">특징</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-24">송장</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left">카테고리</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left">화물설명</th>
                            <th className="border border-gray-300 px-2 py-1.5 text-left min-w-[80px]">매칭</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-12">액션</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((item) => {
                            const isEditingName = editingCell?.id === item.id && editingCell?.field === 'name';
                            const nameChanged = item.edited.name !== item.parsed.name;

                            return (
                                <tr
                                    key={item.id}
                                    className={cn(
                                        'hover:bg-blue-50',
                                        item.matchStatus === 'VERIFIED' && 'bg-green-50/50',
                                        item.matchStatus === 'NEW' && 'bg-purple-50/50',
                                        item.matchStatus === 'WARNING' && 'bg-red-50/50',
                                        item.matchStatus === 'UNTRACKED' && 'bg-gray-50 text-gray-400'
                                    )}
                                >
                                    {/* Status */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        <StatusDot status={item.matchStatus} />
                                    </td>

                                    {/* # */}
                                    <td className="border border-gray-300 px-1 py-1 text-center text-gray-400">
                                        {item.rowIndex}
                                    </td>

                                    {/* 입고일 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center text-gray-600">
                                        {item.parsed.arrivalDate || '-'}
                                    </td>

                                    {/* 택배사 */}
                                    <td className="border border-gray-300 px-1 py-1">
                                        {item.parsed.courier ? (
                                            <span className={cn(
                                                'text-[10px] px-1 py-0.5 rounded',
                                                item.parsed.courier.toLowerCase().includes('hana') ? 'bg-yellow-200' : 'bg-gray-100'
                                            )}>
                                                {item.parsed.courier}
                                            </span>
                                        ) : '-'}
                                    </td>

                                    {/* 이름 (클릭하여 편집) - 고객 검색 기능 포함 */}
                                    <td
                                        className="border border-gray-300 px-2 py-1 cursor-pointer relative"
                                        onClick={() => !isEditingName && startEdit(item.id, 'name', item.edited.name)}
                                    >
                                        {isEditingName ? (() => {
                                            // 📌 초성 검색어를 사용한 필터링 + 기존 podCode 검색
                                            const filteredCustomers = customers
                                                .filter(c =>
                                                    matchesChosungSearch(c.name, editValue) ||
                                                    String(c.podCode).toLowerCase().includes(editValue.toLowerCase())
                                                )
                                                .slice(0, 10);

                                            return (
                                                <div className="relative">
                                                    <input
                                                        ref={inputRef}
                                                        value={editValue}
                                                        onChange={(e) => {
                                                            setEditValue(e.target.value);
                                                            setShowSearchDropdown(e.target.value.length >= 1);
                                                            setSelectedIndex(0);  // 검색어 바뀌면 선택 초기화
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'ArrowDown') {
                                                                e.preventDefault();
                                                                setSelectedIndex(prev => Math.min(prev + 1, filteredCustomers.length - 1));
                                                            } else if (e.key === 'ArrowUp') {
                                                                e.preventDefault();
                                                                setSelectedIndex(prev => Math.max(prev - 1, 0));
                                                            } else if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                // 📌 Enter: 드롭다운에 결과가 있으면 선택, 없으면 직접 입력 확정
                                                                if (showSearchDropdown && filteredCustomers.length > 0) {
                                                                    const selected = filteredCustomers[selectedIndex];
                                                                    if (selected) {
                                                                        onLinkCustomer(item.id, selected.id);
                                                                        setEditingCell(null);
                                                                        setShowSearchDropdown(false);
                                                                        return;
                                                                    }
                                                                }
                                                                confirmEdit();
                                                                setShowSearchDropdown(false);
                                                            } else if (e.key === 'Escape') {
                                                                cancelEdit();
                                                                setShowSearchDropdown(false);
                                                            }
                                                        }}
                                                        onBlur={() => setTimeout(() => { setShowSearchDropdown(false); confirmEdit(); }, 150)}
                                                        className="w-full px-1 py-0.5 text-xs border border-blue-400 outline-none"
                                                        placeholder="이름 입력 (초성 검색 가능)"
                                                    />
                                                    {/* 📌 고객 검색 드롭다운 - React Portal로 렌더링 (overflow 문제 해결) */}
                                                    {showSearchDropdown && editValue.length >= 1 && dropdownPosition && typeof document !== 'undefined' && createPortal(
                                                        <div
                                                            ref={dropdownRef}
                                                            className="fixed bg-white border-2 border-blue-400 shadow-2xl rounded-lg overflow-hidden"
                                                            style={{
                                                                top: dropdownPosition.top - 10,  // Position above input
                                                                left: dropdownPosition.left,
                                                                width: dropdownPosition.width,
                                                                maxHeight: '300px',
                                                                overflowY: 'auto',
                                                                zIndex: 9999,
                                                                transform: 'translateY(-100%)',  // Move up by its own height
                                                            }}
                                                        >
                                                            {/* 드롭다운 헤더 */}
                                                            <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-700 font-medium">
                                                                🔍 고객 검색 결과 ({filteredCustomers.length}건)
                                                            </div>
                                                            {filteredCustomers.map((customer, idx) => (
                                                                <div
                                                                    key={customer.id}
                                                                    className={cn(
                                                                        "px-3 py-2.5 text-sm cursor-pointer border-b border-gray-100 transition-colors",
                                                                        idx === selectedIndex ? "bg-blue-100" : "hover:bg-blue-50"
                                                                    )}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        onLinkCustomer(item.id, customer.id);
                                                                        setEditingCell(null);
                                                                        setShowSearchDropdown(false);
                                                                    }}
                                                                    onMouseEnter={() => setSelectedIndex(idx)}
                                                                >
                                                                    <div className="flex justify-between items-center gap-4">
                                                                        <span className={cn("font-medium", idx === selectedIndex && "text-blue-700 font-semibold")}>{customer.name}</span>
                                                                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{customer.podCode}</span>
                                                                    </div>
                                                                    {customer.phone && (
                                                                        <div className="text-xs text-gray-400 mt-0.5">📞 {customer.phone}</div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {filteredCustomers.length === 0 && (
                                                                <div className="px-3 py-4 text-sm text-gray-400 text-center">
                                                                    일치하는 고객이 없습니다
                                                                </div>
                                                            )}
                                                        </div>,
                                                        document.body
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                            <div className="leading-tight">
                                                <div className={cn('text-[11px]', nameChanged && 'text-blue-600 font-medium')}>
                                                    {item.edited.name}
                                                </div>
                                                {nameChanged && (
                                                    <div className="text-[9px] text-gray-400 line-through">{item.parsed.name}</div>
                                                )}
                                            </div>
                                        )}
                                    </td>

                                    {/* 수량 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center font-medium">
                                        {item.parsed.qty}
                                    </td>

                                    {/* 중량 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center text-gray-500">
                                        {item.parsed.weight || '-'}
                                    </td>

                                    {/* 국적 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        {item.parsed.nationality === 'k' && '🇰🇷'}
                                        {item.parsed.nationality === 'c' && '🇰🇭'}
                                        {!item.parsed.nationality && '-'}
                                    </td>

                                    {/* 📌 분류 (customer/agency 등) */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        {item.parsed.classification ? (
                                            <span className={cn(
                                                'text-[10px] px-1 py-0.5 rounded',
                                                item.parsed.classification === 'customer' && 'bg-blue-100 text-blue-700',
                                                item.parsed.classification === 'agency' && 'bg-orange-100 text-orange-700',
                                                item.parsed.classification === 'coupang' && 'bg-yellow-100 text-yellow-700',
                                                item.parsed.classification === 'gmarket' && 'bg-green-100 text-green-700',
                                                item.parsed.classification === 'hana' && 'bg-purple-100 text-purple-700',
                                                !['customer', 'agency', 'coupang', 'gmarket', 'hana'].includes(item.parsed.classification || '') && 'bg-gray-100 text-gray-600'
                                            )}>
                                                {item.parsed.classification}
                                            </span>
                                        ) : '-'}
                                    </td>

                                    {/* 📌 특징 (메모용) */}
                                    <td className="border border-gray-300 px-1 py-1 text-gray-600 truncate max-w-[80px]" title={item.parsed.feature}>
                                        {item.parsed.feature || '-'}
                                    </td>

                                    {/* 📌 송장 (메모용) */}
                                    <td className="border border-gray-300 px-1 py-1 text-gray-600 truncate max-w-[100px]" title={item.parsed.invoice}>
                                        {item.parsed.invoice || '-'}
                                    </td>

                                    {/* 카테고리 */}
                                    <td className="border border-gray-300 px-1 py-1 text-gray-600 truncate max-w-[80px]" title={item.parsed.cargoCategory}>
                                        {item.parsed.cargoCategory || '-'}
                                    </td>

                                    {/* 📌 화물설명 */}
                                    <td className="border border-gray-300 px-1 py-1 text-gray-600 truncate max-w-[100px]" title={item.parsed.cargoDesc}>
                                        {item.parsed.cargoDesc || '-'}
                                    </td>

                                    {/* 매칭 */}
                                    <td className="border border-gray-300 px-2 py-1">
                                        {item.linkedCustomer ? (
                                            <span className="text-green-700 font-medium text-[10px]">
                                                {item.linkedCustomer.name}
                                                <span className="text-green-500 ml-0.5">#{item.linkedCustomer.podCode}</span>
                                            </span>
                                        ) : item.matchStatus === 'NEW' ? (
                                            <span className="text-purple-600 text-[10px]">신규</span>
                                        ) : (
                                            <span className="text-gray-400 text-[10px]">-</span>
                                        )}
                                    </td>

                                    {/* 액션 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        {item.matchStatus === 'NEW' && (
                                            <button
                                                onClick={() => onQuickRegister(item)}
                                                className="text-[9px] px-1 py-0.5 bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                            >
                                                +등록
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ===== FOOTER ===== */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-t border-gray-300 text-xs">
                <div className="flex items-center gap-3">
                    <span>Total: <strong>{stats.total}</strong></span>
                    <span className="text-green-600">✓ {stats.verified}</span>
                    <span className="text-red-600">⚠ {stats.newCustomer + stats.warning}</span>
                    <span className="text-gray-500">📦 {stats.totalQty}개</span>
                </div>
                <Button
                    size="sm"
                    onClick={onSaveAll}
                    disabled={isSaving}
                    className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700"
                >
                    {isSaving ? '저장 중...' : `💾 전체 저장 (${stats.total}건)`}
                </Button>
            </div>
        </div>
    );
}

export default StagingGrid;
