# Dizin App Wide Workspace Fix

Bu paket ana layout genişliğini `max-w-7xl` sınırından çıkarıp ekranı çok daha dolu kullanacak şekilde `max-w-[min(1800px,calc(100vw-48px))]` yapar.

## Değişen dosya

- `app/layout.tsx`

## Kurulum

```bash
cd /Users/furkan.orucoglu/Projects/dizin-app/frontend
cp /mnt/data/dizin-app-wide-workspace-fix/app/layout.tsx app/layout.tsx
npm run dev
```

Alternatif olarak zip içindeki `app/layout.tsx` dosyasını frontend projenizde aynı path'e kopyalayın.
