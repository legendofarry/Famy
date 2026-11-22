import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCTEdRH04xXxOUBpjcN42HTSKE8JsdxbpU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'famy-app-ae3ce.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'famy-app-ae3ce',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1086648668816',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1086648668816:web:0ab31802072315fd0f7e15',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Keep the session on this device so returning users stay signed in.
export const authReady = (async () => {
  await setPersistence(auth, browserLocalPersistence);
  await new Promise<void>((resolve) => {
    let unsubscribe: (() => void) = () => undefined;
    unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve();
    });
  });
})();
