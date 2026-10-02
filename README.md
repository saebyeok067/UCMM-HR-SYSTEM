# Underchargers HR System

Vercel-ready Next.js wrapper for the Underchargers HR System.

## Main system file

`public/hr.html`

There is no login screen and no camera module in this version.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

1. Upload all files in this folder to the root of a GitHub repository.
2. Import the repository in Vercel.
3. Framework preset: Next.js.
4. Keep the default build/install commands.
5. Deploy.

The root URL redirects to `/hr.html` automatically.

## Storage note

This prototype stores its demo data in browser `localStorage`. Data is not shared between browsers/devices. Connect a real database (for example Supabase) before production HR use.
