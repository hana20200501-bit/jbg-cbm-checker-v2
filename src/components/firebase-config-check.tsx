"use client";

import React from 'react';
import { isFirebaseConfigured } from '@/lib/firebase';
import { AlertTriangle } from 'lucide-react';

export const FirebaseConfigCheck = ({ children }: { children: React.ReactNode }) => {
  if (isFirebaseConfigured) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card p-8 rounded-lg shadow-xl max-w-2xl text-center border-t-4 border-destructive">
        <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-4">Firebase 설정 오류</h1>
        <p className="text-muted-foreground mb-6">
          앱이 Firebase 데이터베이스에 연결할 수 없습니다. <br />
          프로젝트 설정 정보가 올바르게 구성되지 않은 것 같습니다.
        </p>
        <div className="bg-muted/50 border border-border rounded-md p-4 text-left">
          <h2 className="font-semibold text-foreground mb-2">해결 방법:</h2>
          <ol className="list-decimal list-inside text-muted-foreground text-sm space-y-2">
            <li>
              프로젝트 루트에 <code className="bg-muted p-1 rounded mx-1 font-mono">.env.local</code> 파일을 생성합니다.
            </li>
            <li>
              <code className="bg-muted p-1 rounded mx-1 font-mono">.env.local.example</code> 파일의 내용을 복사하여 붙여넣습니다.
            </li>
            <li>
              Firebase 프로젝트 설정에서 값을 찾아 placeholder 값들(<code className="bg-muted p-1 rounded mx-1 font-mono">"YOUR_API_KEY"</code> 등)을 교체하고 저장해주세요.
            </li>
            <li>
              개발 서버를 재시작하여 변경사항을 적용합니다.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
