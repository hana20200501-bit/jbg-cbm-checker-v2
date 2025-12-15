
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle, Loader2, Trash2, Image as ImageIcon } from 'lucide-react';
import type { ShipperWithBoxData } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  shippers: ShipperWithBoxData[];
  onDeleteSelected: (shipperIds: string[]) => Promise<{ success: boolean; count: number, error?: string }>;
  onDeleteAll: () => Promise<{ success: boolean, error?: string }>;
}

type SubmissionStatus = 'idle' | 'saving' | 'complete';
type DeleteMode = null | 'selected' | 'all';

const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({ 
  isOpen, 
  onClose, 
  shippers, 
  onDeleteSelected,
  onDeleteAll,
}) => {
  const { toast } = useToast();
  const [selectedShipperIds, setSelectedShipperIds] = useState<Set<string>>(new Set());
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [deleteMode, setDeleteMode] = useState<DeleteMode>(null);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  
  const isSubmitting = submissionStatus === 'saving';

  useEffect(() => {
    if (!isOpen) {
      setSelectedShipperIds(new Set());
      setSubmissionStatus('idle');
      setDeleteMode(null);
      setDeleteAllConfirmText('');
    }
  }, [isOpen]);

  const handleSelectShipper = (shipperId: string, checked: boolean) => {
    const newSet = new Set(selectedShipperIds);
    if (checked) {
      newSet.add(shipperId);
    } else {
      newSet.delete(shipperId);
    }
    setSelectedShipperIds(newSet);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(shippers.map(s => s.id));
      setSelectedShipperIds(allIds);
    } else {
      setSelectedShipperIds(new Set());
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedShipperIds.size === 0) {
      toast({
        variant: "destructive",
        title: "선택된 항목 없음",
        description: "삭제할 화주를 하나 이상 선택해주세요.",
      });
      return;
    }
    setDeleteMode('selected');
  };
  
  const handleDeleteAllData = async () => {
    setDeleteMode('all');
  };

  const confirmDelete = async () => {
    if (deleteMode === 'selected') {
      await executeDeleteSelected();
    } else if (deleteMode === 'all') {
      await executeDeleteAll();
    }
  }

  const executeDeleteSelected = async () => {
    setSubmissionStatus('saving');
    const idsToDelete = Array.from(selectedShipperIds);

    try {
      const result = await onDeleteSelected(idsToDelete);
      if (result.success) {
        setSubmissionStatus('complete');
        setTimeout(() => onClose(), 1500);
      } else {
        throw new Error(result.error || 'Server returned an error');
      }
    } catch (err: any) {
      setSubmissionStatus('idle');
    } finally {
        setDeleteMode(null);
    }
  };

  const executeDeleteAll = async () => {
    setSubmissionStatus('saving');
    try {
        const result = await onDeleteAll();
        if (result.success) {
            setSubmissionStatus('complete');
            setTimeout(() => onClose(), 1500);
        } else {
            throw new Error(result.error || "Server returned an error");
        }
    } catch(err: any) {
        setSubmissionStatus('idle');
    } finally {
        setDeleteMode(null);
    }
  }
  
  const isAllSelected = shippers.length > 0 && selectedShipperIds.size === shippers.length;
  const deleteAllConfirmationString = '모든 데이터 삭제';

  const renderFooterContent = () => {
      if (isSubmitting) {
          return (
              <div className="w-full flex items-center gap-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>선택한 항목을 삭제하는 중...</span>
              </div>
          )
      }
      if (submissionStatus === 'complete') {
          return (
              <div className="w-full flex items-center gap-2 text-green-600 font-semibold">
                  <CheckCircle className="w-5 h-5" />
                  <span>삭제 완료! 목록을 갱신합니다.</span>
              </div>
          )
      }

      return (
        <>
            <Button onClick={handleDeleteSelected} disabled={isSubmitting || selectedShipperIds.size === 0}>
                <Trash2 className="w-4 h-4 mr-2" />
                {`선택한 ${selectedShipperIds.size}개 항목 삭제`}
            </Button>
            <Button onClick={handleDeleteAllData} variant="destructive" disabled={isSubmitting || shippers.length === 0}>
              모든 데이터 삭제
            </Button>
        </>
      )
  }

  return (
    <>
      <Dialog open={isOpen && !deleteMode} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 sm:p-6 border-b">
              <DialogTitle className="flex items-center gap-3 text-xl">
                  <Trash2 className="w-6 h-6 text-destructive" />
                  일괄 삭제
              </DialogTitle>
              <p className="text-sm text-muted-foreground !mt-1">삭제할 화주를 선택하거나, 모든 데이터를 삭제할 수 있습니다.</p>
          </DialogHeader>
          
          <div className="p-4 sm:p-6 flex-grow overflow-y-auto space-y-6">
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>경고: 되돌릴 수 없는 작업</AlertTitle>
                <AlertDescription>
                    여기서의 삭제 작업은 영구적입니다. 특히 '모든 데이터 삭제'는 데이터베이스와 스토리지의 모든 관련 정보를 제거하므로 신중하게 진행해주세요.
                    필요한 경우, 삭제 전 관리자 페이지에서 엑셀로 데이터를 백업하세요.
                </AlertDescription>
            </Alert>

            {shippers.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="전체 선택"
                        />
                      </TableHead>
                      <TableHead>화주 (한/영)</TableHead>
                      <TableHead>고유넘버</TableHead>
                      <TableHead>특징</TableHead>
                      <TableHead>송장번호</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shippers.map((shipper) => {
                      const representativeImage = shipper.imageUrl || shipper.representativeBoxImageUrl;
                      return (
                      <TableRow key={shipper.id} className={selectedShipperIds.has(shipper.id) ? 'bg-destructive/10' : ''}>
                         <TableCell>
                           <Checkbox
                              checked={selectedShipperIds.has(shipper.id)}
                              onCheckedChange={(checked) => handleSelectShipper(shipper.id, !!checked)}
                              aria-label={`${shipper.nameKr} 선택`}
                           />
                         </TableCell>
                         <TableCell className="p-3 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                                {representativeImage ? (
                                  <Image src={representativeImage} alt={shipper.nameKr} width={40} height={40} className="w-10 h-10 object-cover rounded-md bg-muted" data-ai-hint="package" />
                                ) : (
                                  <div className="w-10 h-10 object-cover rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs">
                                      <ImageIcon className="w-5 h-5" />
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold text-foreground">{shipper.nameKr}</div>
                                  <div className="text-sm text-muted-foreground">{shipper.nameEn}</div>
                                </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{shipper.uniqueNumber || 'N/A'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{shipper.boxFeature1}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{shipper.invoiceNumber}</TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <AlertTriangle className="w-12 h-12 mb-4" />
                  <h3 className="text-lg font-semibold">삭제할 데이터가 없습니다.</h3>
                  <p>화주를 먼저 등록해주세요.</p>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t bg-muted/50 min-h-[76px] flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                  <span className="font-bold">{selectedShipperIds.size}</span> / {shippers.length}개 선택됨
              </div>
              <div className="flex items-center gap-2">
                {renderFooterContent()}
              </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deleteMode} onOpenChange={(open) => !open && setDeleteMode(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>정말로 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                    {deleteMode === 'selected' && `선택한 ${selectedShipperIds.size}개의 화주와 관련된 모든 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
                    {deleteMode === 'all' && (
                      <div>
                          <div className="mb-4">이 작업은 되돌릴 수 없으며, 애플리케이션의 **모든** 화주, 박스, 이미지 데이터가 영구적으로 사라집니다.</div>
                          <div>진행하시려면, 아래에 <strong className="text-destructive">"{deleteAllConfirmationString}"</strong>를 정확히 입력해주세요.</div>
                          <Input 
                            value={deleteAllConfirmText}
                            onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                            className="mt-2"
                            placeholder={deleteAllConfirmationString}
                          />
                      </div>
                    )}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction 
                    onClick={confirmDelete}
                    disabled={deleteMode === 'all' && deleteAllConfirmText !== deleteAllConfirmationString}
                >
                    예, 삭제합니다
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BulkDeleteModal;
