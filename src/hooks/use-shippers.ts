
"use client";

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  FirestoreError,
  Unsubscribe,
} from 'firebase/firestore';
import { db, SHIPPER_COLLECTION, BOX_COLLECTION } from '@/lib/firebase';
import type { Shipper, Box, ShipperWithBoxData } from '@/types';

export function useShippers() {
  const [shippers, setShippers] = useState<ShipperWithBoxData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!db) {
        setError({ code: 'unavailable', message: 'Firebase is not configured.' } as FirestoreError);
        setIsLoading(false);
        return;
    }

    let shipperList: Shipper[] | null = null;
    let boxList: Box[] | null = null;
    let shipperUnsub: Unsubscribe | null = null;
    let boxUnsub: Unsubscribe | null = null;

    const cleanup = () => {
        if (shipperUnsub) shipperUnsub();
        if (boxUnsub) boxUnsub();
    };

    const processAndSetData = () => {
        if (shipperList === null || boxList === null) {
            return;
        }

        const boxMap = new Map<string, Box[]>();
        boxList.forEach(box => {
            if (!boxMap.has(box.shipperId)) {
                boxMap.set(box.shipperId, []);
            }
            boxMap.get(box.shipperId)!.push(box);
        });

        const combinedData = shipperList.map(shipper => {
            const shipperBoxes = boxMap.get(shipper.id) || [];
            const sortedBoxes = [...shipperBoxes].sort((a, b) => a.boxNumber - b.boxNumber);
            const totalCbm = sortedBoxes.reduce((sum, box) => sum + box.cbm, 0);
            const completedBoxes = sortedBoxes.filter(box => box.cbm > 0).length;
            
            const createdAtTimestamp = shipper.createdAt?.seconds ? shipper.createdAt.seconds * 1000 : Date.now();
            
            const lastBoxWithImage = [...sortedBoxes].reverse().find(b => b.imageUrl);

            return {
                ...shipper,
                boxes: sortedBoxes,
                totalCbm,
                completedBoxes,
                createdAtTimestamp,
                representativeBoxImageUrl: lastBoxWithImage?.imageUrl
            };
        });

        setShippers(combinedData);
        setIsLoading(false);
    };

    const qShippers = query(collection(db, SHIPPER_COLLECTION), orderBy('createdAt', 'desc'));
    shipperUnsub = onSnapshot(qShippers, (snapshot) => {
        shipperList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shipper));
        setError(null);
        processAndSetData();
    }, (err) => {
        setError(err);
        setIsLoading(false);
        cleanup(); // Cleanup on error
    });

    const qBoxes = query(collection(db, BOX_COLLECTION));
    boxUnsub = onSnapshot(qBoxes, (snapshot) => {
        boxList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Box));
        setError(null);
        processAndSetData();
    }, (err) => {
        setError(err);
        setIsLoading(false);
        cleanup(); // Cleanup on error
    });

    return cleanup;
  }, []);

  return { shippers, isLoading, error };
}
