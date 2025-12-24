'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown, ChevronsUpDown, Plus, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { StagingItem, StagingMatchStatus, StagingStats } from '@/types/staging';
import type { Customer } from '@/types';

// =============================================================================
// 📌 한글 초성 검색 유틸리티
// =============================================================================

const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const isKorean = (char: string) => {
    const code = char.charCodeAt(0);
    return (code >= 0xAC00 && code <= 0xD7A3);
};

const isChosung = (char: string) => CHOSUNG_LIST.includes(char);

const getChosung = (char: string): string => {
    if (!isKorean(char)) return char.toLowerCase();
    const code = char.charCodeAt(0) - 0xAC00;
    const chosungIndex = Math.floor(code / 588);
    return CHOSUNG_LIST[chosungIndex];
};

const extractChosungs = (str: string): string => {
    return str.split('').map(getChosung).join('');
};

const matchesChosungSearch = (name: string, searchTerm: string): boolean => {
    const lowerSearch = searchTerm.toLowerCase();
    const lowerName = name.toLowerCase();
    if (lowerName.includes(lowerSearch)) return true;
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
type EditableField = 'name' | 'qty';

// 📌 Cell Reference for Excel Navigation
interface CellRef {
    rowId: string;
    field: EditableField;
}

interface StagingGridProps {
    items: StagingItem[];
    customers: Customer[];
    onUpdateItem: (id: string, updates: Partial<StagingItem['edited']>) => void;
    onArchiveItem: (id: string) => void;
    onQuickRegister: (item: StagingItem) => void;
    onLinkCustomer: (itemId: string, customerId: string) => void;
    onSaveAll: () => void;
    onManualRegister: (item: StagingItem) => void;
    onBulkDelete?: (ids: string[]) => void; // 📌 NEW: Bulk Delete
    isSaving?: boolean;
}

// 📌 FIX: Subtle Warning Colors (No more Red Blindness)
const getRowStyle = (item: StagingItem, isSelected: boolean) => {
    if (isSelected) return "bg-blue-100 ring-1 ring-blue-400";
    if (item.matchStatus === 'UNTRACKED' || (item as any).classification === 'agency') {
        return "opacity-40 bg-gray-50 hover:opacity-100 transition-opacity";
    }
    if (item.matchStatus === 'NEW') return "bg-yellow-50/50 hover:bg-yellow-100/50";
    if (item.matchStatus === 'VERIFIED') return "bg-green-50/30 hover:bg-green-100/30";
    // 📌 FIX: WARNING is now subtle (white bg, red text only on specific fields)
    if (item.matchStatus === 'WARNING') return "bg-white hover:bg-red-50/30";
    return "hover:bg-blue-50/50";
};

const StatusDot = ({ status }: { status: StagingMatchStatus }) => {
    const colors = {
        VERIFIED: 'bg-green-500',
        NEW: 'bg-purple-500',
        WARNING: 'bg-red-500',
        UNTRACKED: 'bg-gray-400',
    };
    return <span className={cn('inline-block w-2.5 h-2.5 rounded-full', colors[status || 'UNTRACKED'])} />;
};

// =============================================================================
// 📌 MAIN GRID COMPONENT (Excel-Mode Navigation)
// =============================================================================

export function StagingGrid({
    items,
    customers,
    onUpdateItem,
    onArchiveItem,
    onQuickRegister,
    onLinkCustomer,
    onSaveAll,
    onManualRegister,
    onBulkDelete,
    isSaving = false,
}: StagingGridProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('all');
    const [editingCell, setEditingCell] = useState<CellRef | null>(null);
    const [editValue, setEditValue] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('rowIndex');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    // 📌 NEW: Checkbox Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 📌 Cell IDs for focus management
    const getCellId = (rowId: string, field: EditableField) => `cell-${rowId}-${field}`;

    // Filter Logic
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

        if (sortKey && sortDir) {
            result = [...result].sort((a, b) => {
                let valA: string | number = '';
                let valB: string | number = '';
                if (sortKey === 'arrivalDate') { valA = a.parsed.arrivalDate || ''; valB = b.parsed.arrivalDate || ''; }
                else if (sortKey === 'name') { valA = a.edited.name.toLowerCase(); valB = b.edited.name.toLowerCase(); }
                else if (sortKey === 'rowIndex') { valA = a.rowIndex; valB = b.rowIndex; }
                if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [items, activeTab, sortKey, sortDir]);

    // Statistics
    const stats: StagingStats & { totalQty: number } = useMemo(() => {
        return items.reduce(
            (acc, item) => {
                acc.total++;
                acc.totalQty += item.parsed.qty || 1;
                if (item.isArchived) { acc.archived++; }
                else {
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

    // Handle Dropdown Position
    useEffect(() => {
        if (editingCell && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select(); // 📌 FIX: Auto-select text on focus
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownPosition({ top: rect.top, left: rect.left, width: Math.max(rect.width, 300) });
        } else {
            setDropdownPosition(null);
        }
    }, [editingCell]);

    // 📌 Sort Handler
    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            if (sortDir === 'asc') setSortDir('desc');
            else if (sortDir === 'desc') { setSortDir(null); setSortKey('rowIndex'); }
            else setSortDir('asc');
        } else { setSortKey(key); setSortDir('asc'); }
    }, [sortKey, sortDir]);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortKey !== column) return <ChevronsUpDown className="w-3 h-3 text-gray-400" />;
        if (sortDir === 'asc') return <ChevronUp className="w-3 h-3 text-blue-600" />;
        if (sortDir === 'desc') return <ChevronDown className="w-3 h-3 text-blue-600" />;
        return <ChevronsUpDown className="w-3 h-3 text-gray-400" />;
    };

    // ==========================================================================
    // 📌 Excel-Mode Edit & Navigation Handlers
    // ==========================================================================

    const startEdit = useCallback((rowId: string, field: EditableField, currentValue: string | number) => {
        setEditingCell({ rowId, field });
        setEditValue(String(currentValue).trim());
        if (field === 'name') {
            setShowSearchDropdown(String(currentValue).trim().length >= 1);
            setSelectedIndex(0);
        }
    }, []);

    const confirmEdit = useCallback(() => {
        if (!editingCell) return;
        const trimmedValue = editValue.trim();
        if (editingCell.field === 'name' && trimmedValue) {
            onUpdateItem(editingCell.rowId, { name: trimmedValue });
        } else if (editingCell.field === 'qty') {
            const qty = parseInt(trimmedValue) || 1;
            onUpdateItem(editingCell.rowId, { qty });
        }
        setEditingCell(null);
        setEditValue('');
        setShowSearchDropdown(false);
    }, [editingCell, editValue, onUpdateItem]);

    const cancelEdit = useCallback(() => {
        setEditingCell(null);
        setEditValue('');
        setShowSearchDropdown(false);
    }, []);

    // 📌 Navigate to cell
    const focusCell = useCallback((rowId: string, field: EditableField) => {
        setTimeout(() => {
            const cell = document.getElementById(getCellId(rowId, field));
            cell?.focus();
        }, 0);
    }, []);

    // 📌 Get adjacent cell
    const getAdjacentCell = useCallback((
        currentRowId: string,
        currentField: EditableField,
        direction: 'up' | 'down' | 'left' | 'right'
    ): CellRef | null => {
        const fields: EditableField[] = ['name', 'qty'];
        const currentRowIndex = filteredItems.findIndex(item => item.id === currentRowId);
        const currentFieldIndex = fields.indexOf(currentField);
        if (currentRowIndex === -1) return null;

        switch (direction) {
            case 'up':
                if (currentRowIndex > 0) return { rowId: filteredItems[currentRowIndex - 1].id, field: currentField };
                break;
            case 'down':
                if (currentRowIndex < filteredItems.length - 1) return { rowId: filteredItems[currentRowIndex + 1].id, field: currentField };
                break;
            case 'left':
                if (currentFieldIndex > 0) return { rowId: currentRowId, field: fields[currentFieldIndex - 1] };
                // Wrap to previous row
                if (currentRowIndex > 0) return { rowId: filteredItems[currentRowIndex - 1].id, field: fields[fields.length - 1] };
                break;
            case 'right':
                if (currentFieldIndex < fields.length - 1) return { rowId: currentRowId, field: fields[currentFieldIndex + 1] };
                // Wrap to next row
                if (currentRowIndex < filteredItems.length - 1) return { rowId: filteredItems[currentRowIndex + 1].id, field: fields[0] };
                break;
        }
        return null;
    }, [filteredItems]);

    // 📌 Master Keyboard Handler
    const handleCellKeyDown = useCallback((
        e: React.KeyboardEvent,
        item: StagingItem,
        field: EditableField,
        filteredCustomers: Customer[] = []
    ) => {
        const isEditing = editingCell?.rowId === item.id && editingCell?.field === field;

        // --- TAB: Move Right (or next row start) ---
        if (e.key === 'Tab') {
            e.preventDefault();
            if (isEditing) confirmEdit();
            const next = getAdjacentCell(item.id, field, e.shiftKey ? 'left' : 'right');
            if (next) focusCell(next.rowId, next.field);
            return;
        }

        // --- ARROW KEYS ---
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (isEditing && field === 'name' && showSearchDropdown && filteredCustomers.length > 0) {
                setSelectedIndex(prev => Math.min(prev + 1, filteredCustomers.length - 1));
            } else {
                if (isEditing) confirmEdit();
                const next = getAdjacentCell(item.id, field, 'down');
                if (next) focusCell(next.rowId, next.field);
            }
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (isEditing && field === 'name' && showSearchDropdown && filteredCustomers.length > 0) {
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else {
                if (isEditing) confirmEdit();
                const next = getAdjacentCell(item.id, field, 'up');
                if (next) focusCell(next.rowId, next.field);
            }
            return;
        }
        if (e.key === 'ArrowLeft' && !isEditing) {
            e.preventDefault();
            const next = getAdjacentCell(item.id, field, 'left');
            if (next) focusCell(next.rowId, next.field);
            return;
        }
        if (e.key === 'ArrowRight' && !isEditing) {
            e.preventDefault();
            const next = getAdjacentCell(item.id, field, 'right');
            if (next) focusCell(next.rowId, next.field);
            return;
        }

        // --- ENTER KEY ---
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isEditing) {
                // If Name field with dropdown and selection
                if (field === 'name' && showSearchDropdown && filteredCustomers.length > 0) {
                    const selected = filteredCustomers[selectedIndex];
                    if (selected) {
                        onLinkCustomer(item.id, selected.id);
                        setEditingCell(null);
                        setShowSearchDropdown(false);
                    } else {
                        confirmEdit();
                    }
                } else {
                    confirmEdit();
                }
                // 📌 Move Down after Enter
                const next = getAdjacentCell(item.id, field, 'down');
                if (next) focusCell(next.rowId, next.field);
            } else {
                // Start editing on Enter if not already
                const val = field === 'name' ? item.edited.name : item.edited.qty;
                startEdit(item.id, field, val);
            }
            return;
        }

        // --- ESCAPE ---
        if (e.key === 'Escape') {
            cancelEdit();
            return;
        }

        // --- DELETE (when not editing, archive the row) ---
        if (e.key === 'Delete' && !isEditing) {
            onArchiveItem(item.id);
            return;
        }

        // --- Type to start editing ---
        if (!isEditing && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const val = field === 'name' ? item.edited.name : item.edited.qty;
            startEdit(item.id, field, val);
            // Let the key event propagate to input
        }
    }, [editingCell, showSearchDropdown, selectedIndex, confirmEdit, cancelEdit, getAdjacentCell, focusCell, startEdit, onLinkCustomer, onArchiveItem]);

    // ==========================================================================
    // 📌 Checkbox Selection Handlers
    // ==========================================================================
    const toggleSelectAll = useCallback(() => {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map(item => item.id)));
        }
    }, [filteredItems, selectedIds.size]);

    const toggleSelectItem = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleBulkDelete = useCallback(() => {
        if (selectedIds.size > 0 && onBulkDelete) {
            onBulkDelete(Array.from(selectedIds));
            setSelectedIds(new Set());
        }
    }, [selectedIds, onBulkDelete]);

    // ==========================================================================
    // 📌 Render
    // ==========================================================================
    return (
        <div className="flex flex-col h-full border border-gray-300 bg-white rounded-lg shadow-sm">
            {/* ===== TABS ===== */}
            <div className="flex items-center border-b border-gray-300 bg-gray-50 rounded-t-lg">
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
                            'px-4 py-2 text-xs font-medium border-r border-gray-300 transition-colors',
                            activeTab === tab.key ? 'bg-white border-b-2 border-b-blue-500' : 'hover:bg-gray-100'
                        )}
                    >
                        <span className={activeTab === tab.key ? tab.color : 'text-gray-600'}>{tab.label}</span>
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-gray-200 rounded-full">{tab.count}</span>
                    </button>
                ))}

                {/* 📌 Bulk Delete Button */}
                {selectedIds.size > 0 && onBulkDelete && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                        className="ml-auto mr-2 h-7 text-xs"
                    >
                        <Trash2 className="w-3 h-3 mr-1" />
                        선택 삭제 ({selectedIds.size})
                    </Button>
                )}
            </div>

            {/* ===== TABLE ===== */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-100">
                        <tr>
                            {/* 📌 Checkbox Header */}
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-8 bg-gray-100">
                                <Checkbox
                                    checked={selectedIds.size > 0 && selectedIds.size === filteredItems.length}
                                    onCheckedChange={toggleSelectAll}
                                    className="mx-auto"
                                />
                            </th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-6">●</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-8">#</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-20 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('arrivalDate')}>
                                <div className="flex items-center justify-center gap-1">입고일 <SortIcon column="arrivalDate" /></div>
                            </th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-16">택배사</th>
                            <th className="border border-gray-300 px-2 py-1.5 text-left min-w-[150px] cursor-pointer hover:bg-gray-200" onClick={() => handleSort('name')}>
                                <div className="flex items-center gap-1">이름 <SortIcon column="name" /></div>
                            </th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-12">수량</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-12">중량</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-10">국적</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-16">분류</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-20">특징</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-left w-24">송장</th>
                            <th className="border border-gray-300 px-2 py-1.5 text-left min-w-[80px]">매칭</th>
                            <th className="border border-gray-300 px-1 py-1.5 text-center w-14">액션</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((item, index) => {
                            const isNameEditing = editingCell?.rowId === item.id && editingCell?.field === 'name';
                            const isQtyEditing = editingCell?.rowId === item.id && editingCell?.field === 'qty';
                            const nameChanged = item.edited.name !== item.parsed.name;
                            const isSelected = selectedIds.has(item.id);

                            // Filtered Customers for Dropdown
                            const filteredCustomers = isNameEditing
                                ? customers.filter((c) => matchesChosungSearch(c.name, editValue) || String(c.podCode).includes(editValue)).slice(0, 10)
                                : [];

                            return (
                                <tr
                                    key={item.id}
                                    className={cn('group transition-colors outline-none', getRowStyle(item, isSelected))}
                                >
                                    {/* Checkbox */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectItem(item.id)} />
                                    </td>

                                    {/* Status */}
                                    <td className="border border-gray-300 px-1 py-1 text-center"><StatusDot status={item.matchStatus} /></td>

                                    {/* # */}
                                    <td className="border border-gray-300 px-1 py-1 text-center text-gray-400">{item.rowIndex}</td>

                                    {/* 입고일 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center text-gray-600">{item.parsed.arrivalDate || '-'}</td>

                                    {/* 택배사 */}
                                    <td className="border border-gray-300 px-1 py-1">
                                        {item.parsed.courier ? (
                                            <span className={cn('text-[10px] px-1 py-0.5 rounded', item.parsed.courier.toLowerCase().includes('hana') ? 'bg-yellow-200' : 'bg-gray-100')}>
                                                {item.parsed.courier}
                                            </span>
                                        ) : '-'}
                                    </td>

                                    {/* 📌 이름 (Editable Cell) */}
                                    <td
                                        id={getCellId(item.id, 'name')}
                                        tabIndex={0}
                                        className={cn(
                                            "border border-gray-300 px-2 py-1 cursor-pointer relative focus:outline-none",
                                            isNameEditing && "ring-2 ring-blue-500 ring-inset bg-blue-50"
                                        )}
                                        onClick={() => !isNameEditing && startEdit(item.id, 'name', item.edited.name)}
                                        onKeyDown={(e) => handleCellKeyDown(e, item, 'name', filteredCustomers)}
                                    >
                                        {isNameEditing ? (
                                            <div className="relative">
                                                <input
                                                    ref={inputRef}
                                                    value={editValue}
                                                    onChange={(e) => {
                                                        setEditValue(e.target.value);
                                                        setShowSearchDropdown(e.target.value.length >= 1);
                                                        setSelectedIndex(0);
                                                    }}
                                                    onBlur={() => setTimeout(confirmEdit, 150)}
                                                    className="w-full px-1 py-0.5 text-xs border-none outline-none bg-transparent"
                                                    placeholder="이름 입력 (초성 검색)"
                                                />
                                                {/* Dropdown Portal */}
                                                {showSearchDropdown && editValue.length >= 1 && dropdownPosition && typeof document !== 'undefined' && createPortal(
                                                    <div
                                                        ref={dropdownRef}
                                                        className="fixed bg-white border-2 border-blue-400 shadow-2xl rounded-lg overflow-hidden"
                                                        style={{ top: dropdownPosition.top - 10, left: dropdownPosition.left, width: dropdownPosition.width, maxHeight: '300px', overflowY: 'auto', zIndex: 9999, transform: 'translateY(-100%)' }}
                                                    >
                                                        <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-xs text-blue-700 font-medium">
                                                            🔍 고객 검색 ({filteredCustomers.length}건)
                                                        </div>
                                                        {filteredCustomers.map((customer, idx) => (
                                                            <div
                                                                key={customer.id}
                                                                className={cn("px-3 py-2.5 text-sm cursor-pointer border-b border-gray-100 transition-colors", idx === selectedIndex ? "bg-blue-100" : "hover:bg-blue-50")}
                                                                onMouseDown={(e) => { e.preventDefault(); onLinkCustomer(item.id, customer.id); setEditingCell(null); setShowSearchDropdown(false); }}
                                                                onMouseEnter={() => setSelectedIndex(idx)}
                                                            >
                                                                <div className="flex justify-between items-center gap-4">
                                                                    <span className={cn("font-medium", idx === selectedIndex && "text-blue-700 font-semibold")}>{customer.name}</span>
                                                                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">#{customer.podCode}</span>
                                                                </div>
                                                                {customer.phone && <div className="text-xs text-gray-400 mt-0.5">📞 {customer.phone}</div>}
                                                            </div>
                                                        ))}
                                                        {filteredCustomers.length === 0 && <div className="px-3 py-4 text-sm text-gray-400 text-center">일치하는 고객 없음</div>}
                                                    </div>,
                                                    document.body
                                                )}
                                            </div>
                                        ) : (
                                            <div className="leading-tight">
                                                <div className={cn('text-[11px]', nameChanged && 'text-blue-600 font-medium')}>{item.edited.name}</div>
                                                {nameChanged && <div className="text-[9px] text-gray-400 line-through">{item.parsed.name}</div>}
                                            </div>
                                        )}
                                    </td>

                                    {/* 📌 수량 (Editable Cell) */}
                                    <td
                                        id={getCellId(item.id, 'qty')}
                                        tabIndex={0}
                                        className={cn(
                                            "border border-gray-300 px-1 py-1 text-center font-medium cursor-pointer relative focus:outline-none",
                                            isQtyEditing && "ring-2 ring-blue-500 ring-inset bg-blue-50"
                                        )}
                                        onClick={() => !isQtyEditing && startEdit(item.id, 'qty', item.edited.qty.toString())}
                                        onKeyDown={(e) => handleCellKeyDown(e, item, 'qty')}
                                    >
                                        {isQtyEditing ? (
                                            <input
                                                autoFocus
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onBlur={confirmEdit}
                                                className="w-full text-center border-none outline-none bg-transparent"
                                            />
                                        ) : (
                                            <span className={cn(item.edited.qty !== item.parsed.qty ? "text-blue-600 font-bold" : "")}>{item.edited.qty || item.parsed.qty}</span>
                                        )}
                                    </td>

                                    {/* 중량 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center text-gray-500">{item.parsed.weight || '-'}</td>

                                    {/* 국적 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        {item.parsed.nationality === 'k' && '🇰🇷'}
                                        {item.parsed.nationality === 'c' && '🇰🇭'}
                                        {!item.parsed.nationality && '-'}
                                    </td>

                                    {/* 분류 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        {item.parsed.classification ? (
                                            <span className={cn(
                                                'text-[10px] px-1 py-0.5 rounded',
                                                item.parsed.classification === 'customer' && 'bg-blue-100 text-blue-700',
                                                item.parsed.classification === 'agency' && 'bg-orange-100 text-orange-700',
                                                item.parsed.classification === 'coupang' && 'bg-yellow-100 text-yellow-700',
                                            )}>
                                                {item.parsed.classification}
                                            </span>
                                        ) : '-'}
                                    </td>

                                    {/* 특징 */}
                                    <td className="border border-gray-300 px-1 py-1 text-gray-600 truncate max-w-[80px]" title={item.parsed.feature}>{item.parsed.feature || '-'}</td>

                                    {/* 송장 */}
                                    <td className="border border-gray-300 px-1 py-1 text-gray-600 truncate max-w-[100px]" title={item.parsed.invoice}>{item.parsed.invoice || '-'}</td>

                                    {/* 매칭 상태 - 📌 RED TEXT ONLY for WARNING */}
                                    <td className="border border-gray-300 px-2 py-1 bg-gray-50/50">
                                        <div className="flex flex-col gap-0.5">
                                            {item.matchStatus === 'VERIFIED' && <span className="text-green-600 text-[10px] font-bold flex items-center gap-1"><Check className="w-3 h-3" /> 완료</span>}
                                            {item.matchStatus === 'NEW' && <span className="text-purple-600 text-[10px] font-bold">신규</span>}
                                            {item.matchStatus === 'WARNING' && <span className="text-red-600 text-[10px] font-bold">⚠ 확인필요</span>}
                                            {item.matchStatus === 'UNTRACKED' && <span className="text-gray-400 text-[10px]">제외</span>}
                                            {item.candidates.length > 0 && item.matchStatus !== 'VERIFIED' && (
                                                <span className="text-[9px] text-gray-400">후보 {item.candidates.length}개</span>
                                            )}
                                        </div>
                                    </td>

                                    {/* 액션 */}
                                    <td className="border border-gray-300 px-1 py-1 text-center">
                                        {(item.matchStatus === 'NEW' || item.matchStatus === 'WARNING') && (
                                            <button
                                                onClick={() => onQuickRegister(item)}
                                                className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 font-medium"
                                            >
                                                +등록
                                            </button>
                                        )}
                                        {item.matchStatus === 'UNTRACKED' && '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filteredItems.length === 0 && (
                    <div className="p-8 text-center text-gray-400">데이터가 없습니다.</div>
                )}
            </div>

            {/* ===== FOOTER ===== */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-t border-gray-300 text-xs rounded-b-lg">
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
