
"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { addShipperAndBoxesAction } from '@/app/actions';

interface NewShipperFormProps {
  isOpen: boolean;
  onClose: () => void;
}

const formSchema = z.object({
  nameKr: z.string().min(1, { message: '필수 항목입니다.' }),
  nameEn: z.string().min(1, { message: '필수 항목입니다.' }),
  uniqueNumber: z.string().optional(),
  contact: z.string().optional(),
  boxCount: z.coerce.number().int().min(1, { message: '최소 1개 이상이어야 합니다.' }),
  boxFeature1: z.string().optional(),
  invoiceNumber: z.string().optional(),
  region: z.string().optional(),
});

const NewShipperForm: React.FC<NewShipperFormProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nameKr: '',
      nameEn: '',
      uniqueNumber: '',
      contact: '',
      boxCount: 1,
      boxFeature1: '',
      invoiceNumber: '',
      region: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const { boxCount, ...shipperData } = values;

      const result = await addShipperAndBoxesAction(shipperData, boxCount);

      if (result.success) {
        toast({
          title: "성공",
          description: "새로운 화주가 등록되었습니다.",
        });
        form.reset();
        onClose();
      } else {
        throw new Error(result.error || "알 수 없는 오류가 발생했습니다.");
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      toast({
        variant: "destructive",
        title: "오류",
        description: `화주 등록에 실패했습니다: ${errorMessage}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>신규 화주 등록</DialogTitle>
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
              <FormItem><FormLabel>고유넘버 (그룹화 기준, 선택)</FormLabel><FormControl><Input placeholder="예: PROJECT-A" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="contact" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>연락처 (선택)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="boxCount" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>박스 수량</FormLabel><FormControl><Input type="number" min="1" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="boxFeature1" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>박스 특징</FormLabel><FormControl><Input placeholder="예: 파손주의" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="invoiceNumber" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>송장번호</FormLabel><FormControl><Input placeholder="예: 123-456-7890" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="region" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>지역명</FormLabel><FormControl><Input placeholder="예: Phnom Penh" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={isSubmitting}>취소</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '저장 중...' : '저장하기'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NewShipperForm;
