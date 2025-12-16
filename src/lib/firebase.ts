import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.storageBucket;

let app: FirebaseApp;
let db: Firestore;
let storage: FirebaseStorage;

if (isFirebaseConfigured) {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
  storage = getStorage(app);

  // Enable offline persistence
  try {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code == 'failed-precondition') {
        // Multiple tabs open.
      } else if (err.code == 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
      }
    });
  } catch (error) {
    //
  }

} else {
  //
}

export { db, storage };

// 기존 CBM Checker 컬렉션
export const SHIPPER_COLLECTION = 'shippers';
export const BOX_COLLECTION = 'boxes';

// ERP 시스템 컬렉션
export const CUSTOMER_COLLECTION = 'customers';    // 고객 마스터 데이터
export const VOYAGE_COLLECTION = 'voyages';        // 항차 데이터
export const SHIPMENT_COLLECTION = 'shipments';    // 화물 트랜잭션 데이터
