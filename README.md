# Underchargers HR System — Vercel Deployment Version

This package is ready to deploy as a Next.js project on Vercel.

## Demo login

- Username: `Jerome123`
- Password: `JJ123`

> Important: the demo login is stored in frontend code. It is suitable for a prototype only, not secure production authentication.

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/api/health
```

## Deploy through GitHub + Vercel

1. Extract this ZIP.
2. Create a new GitHub repository.
3. Upload/push the **contents of this folder** to the repository root.
4. In Vercel, choose **Add New → Project**.
5. Import the GitHub repository.
6. Vercel should detect **Next.js** automatically.
7. Keep the default build settings:
   - Build Command: `next build` / `npm run build`
   - Install Command: `npm install`
   - Output: Next.js default
8. Click **Deploy**.

No environment variables are required for this prototype.

## Main HR source

The complete HR interface is located at:

```text
public/hr.html
```

The Next.js home page displays it at `/` in a same-origin iframe and explicitly allows camera access.

## Camera

The live camera preview works best on Vercel because Vercel uses HTTPS. The browser will still ask the user for camera permission.

## Data storage

Current records are stored in browser `localStorage`. This means data is per browser/device and is not shared between employees or computers.

For production, connect the system to Supabase (database + authentication + storage) before using it for real employee, payroll, loan, document, or audit data.
