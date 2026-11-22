# Famy

Famy is a real-time messaging and calling app with media sharing and push notifications.

## Firebase and Cloudinary setup

1. In Firebase Console, enable **Authentication → Email/Password** and create a **Firestore database**.
2. Publish the rules in `firestore.rules` (Firebase Console → Firestore → Rules, or `firebase deploy --only firestore:rules`).
3. In Cloudinary, create an **unsigned upload preset** with an allowed image/video format list and a reasonable upload size limit.
4. Copy `.env.example` to `.env.local`; enter the Firebase web app values and Cloudinary cloud name/upload preset. Add the same `VITE_*` values to Netlify’s build environment and trigger a fresh deploy.

Famy asks users for a username and password. It maps usernames to internal synthetic email identifiers for Firebase Email/Password Auth; users do not need to provide an email address. Firestore stores profiles, conversations, and messages. Media files go directly to Cloudinary. Push notifications are paused.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set the Firebase and Cloudinary values above.
3. Start the development server:
   `npm run dev`

Vite hot reload uses `VITE_HMR_PORT` (default `24679`).

## Build

`npm run build`
