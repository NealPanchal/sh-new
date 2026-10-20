import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAIjW-LCn2zHzsB2MRRK88xk1HW3M-OpX0",
  authDomain: "showhouse-2ea0f.firebaseapp.com",
  projectId: "showhouse-2ea0f",
  storageBucket: "showhouse-2ea0f.firebasestorage.app",
  messagingSenderId: "813940875233",
  appId: "1:813940875233:web:3e6c515efd390b89867ca0",
  measurementId: "G-59QRFVHFBW"
};

// Initialize Firebase (singleton pattern)
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);

// Analytics only in client-side environment
let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(firebaseApp);
    }
  }).catch(() => {
    // Ignore analytics error in environments that don't support it
  });
}

export { analytics };
