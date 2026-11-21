# Famy

Famy is a real-time messaging and calling app with media sharing and push notifications.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set any required environment variables.
3. Start the development server:
   `npm run dev`

The app uses port `3000` by default. Change `PORT` in `.env.local` if that port is in use. Vite hot reload uses `VITE_HMR_PORT` (default `24679`).

## Build

`npm run build`
