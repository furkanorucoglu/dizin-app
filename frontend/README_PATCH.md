# Frontend fix notes

This patch adds the missing API client module and types required by `app/projects/[id]/review/page.tsx`.

Copy the folders/files into your `frontend` root:

- `lib/api-client.ts`
- `lib/types.ts`
- `lib/backend-http.ts`
- `components/pdf-viewer.tsx`
- `app/projects/[id]/review/page.tsx`

Then restart Next.js:

```bash
npm run dev
```

If the backend is not on port 8000, set `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEV_USER=dev-user
```
