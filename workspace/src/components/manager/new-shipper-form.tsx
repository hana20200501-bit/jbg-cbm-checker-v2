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
  boxFeature2: z.string().optional(),
  imageUrl: z.string().url({ message: '유효한 URL을 입력해주세요.' }).optional().or(z.literal('')),
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
      boxFeature2: '',
      imageUrl: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const result = await addShipperAndBoxesAction(
        {
          nameKr: values.nameKr,
          nameEn: values.nameEn,
          uniqueNumber: values.uniqueNumber,
          contact: values.contact,
          boxFeature1: values.boxFeature1,
          boxFeature2: values.boxFeature2,
          imageUrl: values.imageUrl,
        },
        values.boxCount
      );

      if (result.success) {
        toast({
            title: "성공",
            description: "새로운 화주가 등록되었습니다.",
        });
        form.reset();
        onClose();
      } else {
        throw new Error("Failed to add shipper");
      }

    } catch (err) {
      console.error("Failed to add shipper", err);
      toast({
        variant: "destructive",
        title: "오류",
        description: "화주 등록에 실패했습니다. 다시 시도해주세요.",
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
              <FormItem><FormLabel>박스 특징 (1)</FormLabel><FormControl><Input placeholder="예: 파손주의" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="boxFeature2" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>박스 특징 (2) / 송장번호</FormLabel><FormControl><Input placeholder="예: 123-456-7890" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField name="imageUrl" control={form.control} render={({ field }) => (
              <FormItem><FormLabel>이미지 URL (선택)</FormLabel><FormControl><Input placeholder="https://example.com/image.jpg" {...field} /></FormControl><FormMessage /></FormItem>
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
