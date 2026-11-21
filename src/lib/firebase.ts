import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCTEdRH04xXxOUBpjcN42HTSKE8JsdxbpU',
  authDomain: 'famy-app-ae3ce.firebaseapp.com',
  projectId: 'famy-app-ae3ce',
  storageBucket: 'famy-app-ae3ce.firebasestorage.app',
  messagingSenderId: '1086648668816',
  appId: '1:1086648668816:web:0ab31802072315fd0f7e15',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Keep the session on this device so returning users stay signed in.
export const authReady = setPersistence(auth, browserLocalPersistence);
