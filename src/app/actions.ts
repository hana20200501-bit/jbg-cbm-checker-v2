
"use server";

import {
  collection,
  writeBatch,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage, SHIPPER_COLLECTION, BOX_COLLECTION } from '@/lib/firebase';
import type { Shipper, Box } from '@/types';

/**
 * Creates a new shipper and their associated boxes in a single transaction.
 * @param shipperData The data for the new shipper.
 * @param boxCount The number of boxes to create for the shipper.
 * @returns An object indicating success or failure.
 */
export async function addShipperAndBoxesAction(
    shipperData: Omit<Shipper, 'id' | 'createdAt' | 'isUrgent' | 'isConfirmed'>, 
    boxCount: number
): Promise<{ success: boolean; shipperId?: string; error?: string }> {
    if (!db) {
        const errorMsg = "Firebase is not configured correctly.";
        return { success: false, error: errorMsg };
    }

    const batch = writeBatch(db);

    try {
        // 1. Create the new shipper document
        const shipperRef = doc(collection(db, SHIPPER_COLLECTION));
        const shipperPayload = { 
            ...shipperData, 
            isUrgent: false,
            isConfirmed: false,
            createdAt: serverTimestamp() 
        };
        batch.set(shipperRef, shipperPayload);

        // 2. Create the box documents
        if (boxCount > 0) {
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

        // 3. Commit the batch
        await batch.commit();

        return { success: true, shipperId: shipperRef.id };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown server error occurred.";
        return { success: false, error: errorMessage };
    }
}


/**
 * Updates the 'isUrgent' status of a single shipper.
 * @param shipperId The ID of the shipper to update.
 * @param isUrgent The new urgent status.
 * @returns An object indicating success or failure.
 */
export async function updateShipperUrgentStatusAction(shipperId: string, isUrgent: boolean): Promise<{ success: boolean; error?: string }> {
    if (!db) {
        const errorMsg = "Firebase is not configured correctly.";
        return { success: false, error: errorMsg };
    }
    if (!shipperId) {
        return { success: false, error: "Shipper ID is required." };
    }

    try {
        const shipperRef = doc(db, SHIPPER_COLLECTION, shipperId);
        await updateDoc(shipperRef, { isUrgent });
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown server error occurred.";
        return { success: false, error: errorMessage };
    }
}

/**
 * Updates the 'isConfirmed' status for all shippers in a group.
 * @param shipperIds The IDs of the shippers in the group to update.
 * @param isConfirmed The new confirmation status.
 * @returns An object indicating success or failure.
 */
export async function updateShipperConfirmationStatusAction(shipperIds: string[], isConfirmed: boolean): Promise<{ success: boolean; error?: string }> {
    if (!db) {
        const errorMsg = "Firebase is not configured correctly.";
        return { success: false, error: errorMsg };
    }
    if (!shipperIds || shipperIds.length === 0) {
        return { success: false, error: "Shipper IDs are required." };
    }

    const batch = writeBatch(db);
    try {
        for (const shipperId of shipperIds) {
            const shipperRef = doc(db, SHIPPER_COLLECTION, shipperId);
            batch.update(shipperRef, { isConfirmed });
        }
        await batch.commit();
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown server error occurred.";
        return { success: false, error: errorMessage };
    }
}


/**
 * Deletes a single shipper and all their associated data (boxes, images).
 * @param shipperId The ID of the shipper to delete.
 * @returns An object indicating success or failure.
 */
export async function deleteSingleShipperAction(shipperId: string): Promise<{ success: boolean; error?: string }> {
    if (!db || !storage) {
        const errorMsg = "Firebase is not configured correctly.";
        return { success: false, error: errorMsg };
    }
    if (!shipperId) {
        return { success: false, error: "Shipper ID is required." };
    }

    try {
        const batch = writeBatch(db);

        // 1. Mark shipper for deletion
        const shipperRef = doc(db, SHIPPER_COLLECTION, shipperId);
        batch.delete(shipperRef);

        // 2. Find and delete associated boxes and their images
        const boxesQuery = query(collection(db, BOX_COLLECTION), where("shipperId", "==", shipperId));
        const boxesSnapshot = await getDocs(boxesQuery);

        // Using Promise.all to handle image deletions in parallel, but not letting them block the DB write
        const imageDeletionPromises: Promise<void>[] = [];
        boxesSnapshot.forEach(boxDoc => {
            const boxData = boxDoc.data();
            if (boxData.imageUrl) {
                const imageRef = ref(storage, boxData.imageUrl);
                // Push the deletion promise to the array
                imageDeletionPromises.push(
                    deleteObject(imageRef).catch(storageError => {
                        // We catch errors here so that a failure to delete one image doesn't stop others.
                        // 'object-not-found' is a common case we can safely ignore.
                        if (storageError.code !== 'storage/object-not-found') {
                            // We don't re-throw, allowing the batch to commit anyway.
                        }
                    })
                );
            }
            // Mark the box document for deletion in the batch
            batch.delete(boxDoc.ref);
        });

        // Wait for all image deletions to be attempted.
        await Promise.all(imageDeletionPromises);

        // 3. Commit all batched Firestore writes/deletions
        await batch.commit();

        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown server error occurred.";
        return { success: false, error: errorMessage };
    }
}


/**
 * Deletes multiple shippers and all their associated data (boxes, images) in a single server-side operation.
 * @param shipperIds An array of shipper IDs to delete.
 * @returns An object indicating success and the count of deleted shippers.
 */
export async function deleteMultipleShippersAction(shipperIds: string[]): Promise<{ success: boolean; count: number, error?: string }> {
    if (!db || !storage) {
        const errorMsg = "Firebase is not configured correctly.";
        return { success: false, count: 0, error: errorMsg };
    }
    if (!shipperIds || shipperIds.length === 0) {
        return { success: true, count: 0 };
    }

    let deletedCount = 0;
    
    // We process each shipper deletion sequentially to avoid overwhelming resources and for clearer error tracking.
    for (const shipperId of shipperIds) {
        try {
            const result = await deleteSingleShipperAction(shipperId);
            if(result.success) {
                deletedCount++;
            } else {
                // Log the error for the specific shipper that failed, but continue with the others.
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        }
    }

    if (deletedCount === shipperIds.length) {
        return { success: true, count: deletedCount };
    } else {
        return { 
            success: false, 
            count: deletedCount, 
            error: `${shipperIds.length - deletedCount}개 화주 정보 삭제에 실패했습니다. 서버 로그를 확인하세요.` 
        };
    }
}


/**
 * Deletes all data from the shippers and boxes collections, including images in storage.
 * This is a destructive operation.
 * @returns An object indicating success.
 */
export async function deleteAllDataAction(): Promise<{ success: boolean; error?: string }> {
    if (!db || !storage) {
        const errorMsg = "Firebase is not configured correctly.";
        return { success: false, error: errorMsg };
    }

    try {
        const batch = writeBatch(db);

        // Get all boxes to delete their images
        const boxesSnapshot = await getDocs(collection(db, BOX_COLLECTION));
        const imageDeletionPromises: Promise<void>[] = [];

        boxesSnapshot.forEach(boxDoc => {
            const boxData = boxDoc.data();
            if (boxData.imageUrl) {
                 const imageRef = ref(storage, boxData.imageUrl);
                 imageDeletionPromises.push(
                    deleteObject(imageRef).catch(err => {
                        if (err.code !== 'storage/object-not-found') {
                        }
                    })
                 );
            }
            batch.delete(boxDoc.ref);
        });

        // Delete all shippers
        const shippersSnapshot = await getDocs(collection(db, SHIPPER_COLLECTION));
        shippersSnapshot.forEach(shipperDoc => {
            batch.delete(shipperDoc.ref);
        });
        
        // Attempt to delete all images.
        await Promise.all(imageDeletionPromises);
        
        // Commit all Firestore deletions.
        await batch.commit();

        return { success: true };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown server error occurred.";
        return { success: false, error: errorMessage };
    }
}
