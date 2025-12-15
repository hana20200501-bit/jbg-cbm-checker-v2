
"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import type { Shipper, ShipperWithBoxData } from '@/types';
import { db, SHIPPER_COLLECTION } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';


interface EditShipperModalProps {
  shipper: ShipperWithBoxData;
  isOpen: boolean;
  onClose: () => void;
}

const formSchema = z.object({
  nameKr: z.string().min(1, { message: '필수 항목입니다.' }),
  nameEn: z.string().min(1, { message: '필수 항목입니다.' }),
  uniqueNumber: z.string().optional(),
  contact: z.string().optional(),
  boxFeature1: z.string().optional(),
  invoiceNumber: z.string().optional(),
  region: z.string().optional(),
});

const EditShipperModal: React.FC<EditShipperModalProps> = ({ shipper, isOpen, onClose }) => {
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
      nameKr: shipper.nameKr,
      nameEn: shipper.nameEn,
      uniqueNumber: shipper.uniqueNumber || '',
      contact: shipper.contact || '',
      boxFeature1: shipper.boxFeature1 || '',
      invoiceNumber: shipper.invoiceNumber || '',
      region: shipper.region || '',
    },
  });

  const { formState: { isSubmitting } } = form;

  useEffect(() => {
    if (shipper) {
        form.reset({
            nameKr: shipper.nameKr,
            nameEn: shipper.nameEn,
            uniqueNumber: shipper.uniqueNumber || '',
            contact: shipper.contact || '',
            boxFeature1: shipper.boxFeature1 || '',
            invoiceNumber: shipper.invoiceNumber || '',
            region: shipper.region || '',
        });
    }
  }, [shipper, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!db) {
        toast({ variant: "destructive", title: "오류", description: "데이터베이스에 연결할 수 없습니다." });
        return;
    }
    
    try {
      const dataToUpdate: Partial<Omit<Shipper, 'id' | 'createdAt' | 'isUrgent' | 'isConfirmed'>> = {
        nameKr: values.nameKr,
        nameEn: values.nameEn,
        uniqueNumber: values.uniqueNumber || '',
        contact: values.contact,
        boxFeature1: values.boxFeature1,
        invoiceNumber: values.invoiceNumber,
        region: values.region,
      };

      const shipperRef = doc(db, SHIPPER_COLLECTION, shipper.id);
      await updateDoc(shipperRef, dataToUpdate);

      toast({
        title: "성공",
        description: "화주 정보가 수정되었습니다.",
      });
      onClose();
      
    } catch (err) {
      toast({
        variant: "destructive",
        title: "오류",
        description: "화주 정보 수정에 실패했습니다.",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>화주 정보 수정</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField name="nameKr" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>이름 (한글)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField name="nameEn" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>이름 (영문)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField name="uniqueNumber" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>고유넘버</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="contact" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>연락처</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="boxFeature1" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>박스 특징</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="invoiceNumber" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>송장번호</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
             <FormField name="region" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>지역명</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="secondary" disabled={isSubmitting}>취소</Button></DialogClose>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '수정하기'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditShipperModal;
