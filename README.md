<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/71a258eb-3f71-4af0-bbd2-74be60f883a7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set the `VITE_FIREBASE_*` values from your Firebase web app configuration.
3. In Firebase Console, enable **Authentication → Sign-in method → Email/Password** and configure the email verification template.
4. Configure Firebase Admin credentials on the server with `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`.
5. Run the app:
   `npm run dev`

If a local port is already in use, set `PORT` (app server) and `VITE_HMR_PORT` (Vite hot reload) in `.env.local` to available ports.
