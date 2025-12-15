
"use client";

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HardHat, UserCog } from 'lucide-react';

export type Role = 'manager' | 'worker' | null;

const RoleCard = ({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="w-full text-left bg-card p-8 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 flex flex-col items-center text-center focus:outline-none focus:ring-4 focus:ring-primary/50"
  >
    {icon}
    <h3 className="text-xl font-bold text-card-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground">{description}</p>
  </button>
);

export default function RoleSelectionPage() {
  const router = useRouter();

  const handleRoleSelect = (selectedRole: Role) => {
    if (selectedRole) {
      router.push(`/${selectedRole}`);
    }
  };

  return (
    <main className="container mx-auto p-4 sm:p-6 flex items-center justify-center flex-grow">
      <div className="max-w-md mx-auto text-center">
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-4">어떤 작업을 하시나요?</h2>
        <p className="text-muted-foreground mb-12">역할을 선택하여 시작하세요.</p>
        <div className="grid grid-cols-1 gap-8">
          <RoleCard
            icon={<UserCog className="w-16 h-16 text-primary mb-4" />}
            title="관리자"
            description="신규 화주를 등록하고, CBM 작업 현황을 확인합니다."
            onClick={() => handleRoleSelect('manager')}
          />
          <RoleCard
            icon={<HardHat className="w-16 h-16 text-accent mb-4" />}
            title="작업자"
            description="화물을 검색하고 박스별 CBM(크기)을 입력합니다."
            onClick={() => handleRoleSelect('worker')}
          />
        </div>
      </div>
    </main>
  );
}
