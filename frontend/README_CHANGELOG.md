# Dizin App Modern Frontend + Backend Route Uyum Revizyonu

Bu paket, mevcut Next.js frontend dosyalarını modern CX/UX/UI yapısında koruyup yüklediğin FastAPI route dosyalarıyla uyumlu olacak şekilde düzeltir.

## Revize edilen / eklenen dosyalar

- `app/layout.tsx`
- `app/globals.css`
- `app/providers.tsx`
- `app/page.tsx`
- `app/projects/new/page.tsx`
- `app/projects/[id]/page.tsx`
- `app/projects/[id]/anchors/page.tsx`
- `app/projects/[id]/review/page.tsx`
- `components/pdf-viewer.tsx` yeni / güncel PDF viewer
- `components/pdf-report-download-button.tsx` yeni authenticated PDF indirme butonu
- `lib/backend-http.ts` yeni authenticated fetch yardımcıları

## Backend route uyum düzeltmeleri

- `/api/projects/{project_id}/entries` endpoint’indeki `limit` üst sınırı 500 olduğu için Review ekranındaki `limit=1000` çağrısı `limit=500` olarak düzeltildi.
- PDF sayfa endpoint’i `dpi` için minimum 72 istediği için viewer zoom değeri 72 altına düşmeyecek şekilde düzenlendi.
- Review ekranında seçilen dizin kelimesi için `/api/projects/{project_id}/pages/{lang}/{page_num}/highlight?term=...` endpoint’i çağrılıp PDF üzerinde sarı highlight overlay çizildi.
- `<a href>` ile export çağrısı auth header göndermediği için 401 oluşabiliyordu. PDF rapor indirme artık `fetch` ile auth header göndererek çalışıyor.
- Backend route dosyalarında `export.docx` endpoint’i görünmediği için DOCX indirme butonu frontenden kaldırıldı; yalnızca mevcut `export.pdf` endpoint’i kullanıldı.

## Kullanım

Bu klasördeki dosyaları mevcut frontend projenin aynı path’lerine kopyala. Sonra frontend’i yeniden başlat:

```bash
cd frontend
npm install
npm run dev
```

Backend farklı portta çalışıyorsa `.env.local` içinde API adresini kontrol et:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEV_USER=dev-user
```
