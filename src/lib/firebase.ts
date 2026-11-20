import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCTEdRH04xXxOUBpjcN42HTSKE8JsdxbpU',
  authDomain: 'famy-app-ae3ce.firebaseapp.com',
  projectId: 'famy-app-ae3ce',
  storageBucket: 'famy-app-ae3ce.firebasestorage.app',
  messagingSenderId: '1086648668816',
  appId: '1:1086648668816:web:0ab31802072315fd0f7e15',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const googleAuthProvider = new GoogleAuthProvider();
