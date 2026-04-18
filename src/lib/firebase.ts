import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Validates connection to Firestore.
 * Required per Firebase integration instructions.
 */
async function testConnection() {
  try {
    // Attempting to get a non-existent doc from server to check connectivity
    await getDocFromServer(doc(db, '_internal_', 'connection_test'));
    console.log("Firebase connection established.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.error("Firebase connection failed: Client is offline.");
    } else {
      console.warn("Firebase connection test completed (expected error for missing doc).");
    }
  }
}

testConnection();
