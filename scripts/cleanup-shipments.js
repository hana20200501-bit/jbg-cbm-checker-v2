/**
 * 🧹 Firestore 데이터 정리 스크립트
 * 
 * URL 인코딩된 voyageId로 저장된 잘못된 shipments를 삭제합니다.
 * 
 * 사용법: 브라우저 콘솔에서 실행
 * 1. /admin/voyages 페이지 접속
 * 2. F12 → Console 탭
 * 3. 이 코드를 복사하여 붙여넣기 후 Enter
 */

// Firebase 모듈 가져오기 (이미 페이지에 로드됨)
const { db } = await import('/src/lib/firebase.ts');
const { collection, getDocs, deleteDoc, doc, writeBatch } = await import('firebase/firestore');

async function cleanupEncodedShipments() {
    console.log('🚀 잘못된 shipments 삭제 시작...');

    const shipmentsRef = collection(db, 'shipments');
    const snapshot = await getDocs(shipmentsRef);

    let deleteCount = 0;
    let batchCount = 0;
    let batch = writeBatch(db);

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const voyageId = data.voyageId || '';

        // URL 인코딩된 voyageId 감지 (%가 포함되면 인코딩된 것)
        if (voyageId.includes('%')) {
            batch.delete(doc(db, 'shipments', docSnap.id));
            deleteCount++;
            batchCount++;

            // 500개마다 커밋 (Firestore 제한)
            if (batchCount >= 400) {
                await batch.commit();
                console.log(`✅ ${deleteCount}개 삭제됨...`);
                batch = writeBatch(db);
                batchCount = 0;
            }
        }
    }

    // 남은 배치 커밋
    if (batchCount > 0) {
        await batch.commit();
    }

    console.log(`🎉 완료! 총 ${deleteCount}개의 잘못된 shipments 삭제됨`);
    return deleteCount;
}

// 실행
cleanupEncodedShipments();
