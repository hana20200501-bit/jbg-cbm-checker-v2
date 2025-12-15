
"use client";

import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle, ClipboardList, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { db, SHIPPER_COLLECTION, BOX_COLLECTION } from '@/lib/firebase';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import type { Shipper, Box } from '@/types';

type BulkShipperData = {
    shipper: Omit<Shipper, 'id' | 'createdAt'>;
    boxCount: number;
}

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ParsedRow = {
  data: BulkShipperData;
  original: string[];
  isValid: boolean;
  error?: string;
};

type SubmissionStatus = 'idle' | 'parsing' | 'saving' | 'complete';

const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [view, setView] = useState<'input' | 'preview'>('input');
  
  const isSubmitting = useMemo(() => submissionStatus === 'saving' || submissionStatus === 'parsing', [submissionStatus]);

  const handleParse = () => {
    setSubmissionStatus('parsing');
    const rows = pastedText.trim().split('\n').filter(row => row.trim() !== '');
    const parsedData: ParsedRow[] = rows.map(row => {
      const columns = row.split('\t');
      
      const nameKr = (columns[0] || '').trim();
      const uniqueNumber = (columns[1] || '').trim();
      const nameEn = (columns[2] || '').trim();
      const boxCountStr = (columns[3] || '0').trim();
      const contact = (columns[4] || '').trim();
      const boxFeature1 = (columns[5] || '').trim();
      const invoiceNumber = (columns[6] || '').trim();
      const region = (columns[7] || '').trim();

      const boxCount = parseInt(boxCountStr, 10);
      
      let isValid = true;
      let error = '';

      if (!nameKr) {
        isValid = false;
        error = '화주 이름(한글)은 필수입니다.';
      } else if (isNaN(boxCount) || boxCount <= 0) {
        isValid = false;
        error = '박스 수량은 0보다 큰 숫자여야 합니다.';
      }

      return {
        data: {
          shipper: { 
            nameKr,
            uniqueNumber,
            nameEn,
            contact,
            boxFeature1,
            invoiceNumber,
            region,
          },
          boxCount: isValid ? boxCount : 0
        },
        original: columns,
        isValid,
        error
      };
    });
    setParsedRows(parsedData);
    setView('preview');
    setSubmissionStatus('idle');
  };
  
  const handleSave = async () => {
    if (!db) {
        toast({ variant: "destructive", title: "오류", description: "데이터베이스에 연결할 수 없습니다." });
        return;
    }

    setSubmissionStatus('saving');
    const validData = parsedRows.filter(row => row.isValid).map(row => row.data);
    
    if (validData.length === 0) {
        toast({
          variant: "destructive",
          title: "저장할 데이터 없음",
          description: "유효한 데이터가 없어 저장할 수 없습니다.",
        });
        setSubmissionStatus('idle');
        return;
    }
    try {
        const batch = writeBatch(db);

        for (const { shipper, boxCount } of validData) {
            const shipperRef = doc(collection(db, SHIPPER_COLLECTION));
            const shipperPayload = { 
              ...shipper, 
              createdAt: serverTimestamp() 
            };
            batch.set(shipperRef, shipperPayload);

            for (let i = 1; i <= boxCount; i++) {
                const boxRef = doc(collection(db, BOX_COLLECTION));
                const newBox: Omit<Box, 'id'> = {
                    shipperId: shipperRef.id,
                    boxNumber: i,
                    width: '',
                    length: '',
                    height: '',
                    cbm: 0,
                    customName: '',
                };
                batch.set(boxRef, newBox);
            }
        }
        await batch.commit();

        toast({
            title: "가져오기 성공",
            description: `${validData.length}개의 화주 정보가 성공적으로 등록되었습니다.`,
        });
        setSubmissionStatus('complete');
        setTimeout(() => {
          handleClose();
        }, 1500);

    } catch (err) {
        console.error('Bulk import failed', err);
        toast({
            variant: "destructive",
            title: "오류",
            description: "대량 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        });
        setSubmissionStatus('idle');
    }
  }

  const handleClose = () => {
    setPastedText('');
    setParsedRows([]);
    setView('input');
    setSubmissionStatus('idle');
    onClose();
  }
  
  const validRowCount = parsedRows.filter(r => r.isValid).length;
  const invalidRowCount = parsedRows.length - validRowCount;

  const renderFooterContent = () => {
      if (isSubmitting) {
          return (
              <div className="w-full flex items-center gap-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <div className="w-full">
                      <Progress value={submissionStatus === 'saving' ? 50 : 0} className="h-2" />
                      <p className="text-sm text-muted-foreground mt-1">{submissionStatus === 'parsing' ? '데이터 분석 중...' : '데이터베이스에 저장 중...'}</p>
                  </div>
              </div>
          )
      }
      if (submissionStatus === 'complete') {
          return (
              <div className="w-full flex items-center gap-2 text-green-600 font-semibold">
                  <CheckCircle className="w-5 h-5" />
                  <span>완료! 목록을 갱신합니다.</span>
              </div>
          )
      }

      return (
        <>
            <Button type="button" onClick={handleClose} variant="secondary" disabled={isSubmitting}>
              취소
            </Button>
            {view === 'input' ? (
                <Button onClick={handleParse} disabled={!pastedText.trim() || isSubmitting}>
                  미리보기
                </Button>
            ) : (
              <>
                <Button onClick={() => setView('input')} variant="outline" disabled={isSubmitting}>
                  뒤로
                </Button>
                <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700" disabled={isSubmitting || validRowCount === 0}>
                  {isSubmitting ? '저장 중...' : `${validRowCount}개 저장하기`}
                </Button>
              </>
            )}
        </>
      )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 sm:p-6 border-b">
            <DialogTitle className="flex items-center gap-3 text-xl">
                <ClipboardList className="w-6 h-6 text-green-600" />
                엑셀/시트 대량 등록
            </DialogTitle>
            <p className="text-sm text-muted-foreground !mt-1">엑셀/시트에서 아래 순서대로 열을 복사하여 붙여넣으세요.</p>
        </DialogHeader>

        {view === 'input' && (
          <div className="p-4 sm:p-6 flex-grow flex flex-col">
            <div className="bg-muted p-3 text-sm text-muted-foreground rounded-md mb-4">
              <p><span className="font-bold">필수 열 순서:</span> 이름(한글) → 고유넘버 → 이름(영문) → 박스 수량 → 연락처 → 특징 → 송장번호 → 지역명</p>
              <p className="text-xs mt-1">※ 탭으로 구분된 값을 사용하세요.</p>
            </div>
            <Textarea
              className="w-full flex-grow p-3 font-mono text-sm resize-none"
              placeholder="여기에 데이터를 붙여넣으세요..."
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        )}
        
        {view === 'preview' && (
          <div className="p-4 sm:p-6 flex-grow overflow-y-auto">
            <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">{validRowCount}개</span> 유효
                </div>
                <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-semibold">{invalidRowCount}개</span> 오류
                </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상태</TableHead>
                    <TableHead>이름(한)</TableHead>
                    <TableHead>고유넘버</TableHead>
                    <TableHead>이름(영)</TableHead>
                    <TableHead>박스 수</TableHead>
                    <TableHead>연락처</TableHead>
                    <TableHead>특징</TableHead>
                    <TableHead>송장번호</TableHead>
                    <TableHead>지역명</TableHead>
                    <TableHead>오류</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, index) => (
                    <TableRow key={index} className={!row.isValid ? 'bg-destructive/10' : ''}>
                      <TableCell>
                        {row.isValid 
                          ? <CheckCircle className="w-5 h-5 text-green-500" />
                          : <AlertTriangle className="w-5 h-5 text-destructive" />
                        }
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.original[0] || ''}</TableCell>
                      <TableCell className="font-mono text-xs">{row.original[1] || ''}</TableCell>
                      <TableCell className="font-mono text-xs">{row.original[2] || ''}</TableCell>
                      <TableCell className="font-mono text-xs">{row.original[3] || ''}</TableCell>
                      <TableCell className="font-mono text-xs">{row.original[4] || ''}</TableCell>
                      <TableCell className="font-mono text-xs">{row.original[5] || ''}</TableCell>
                      <TableCell className="font-mono text-xs">{row.original[6] || ''}</TableCell>
                      <TableCell className="font-mono text-xs">{row.original[7] || ''}</TableCell>
                      <TableCell className="text-destructive text-xs">{row.error || ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="p-4 border-t bg-muted/50 min-h-[76px] flex items-center">
            {renderFooterContent()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkImportModal;
