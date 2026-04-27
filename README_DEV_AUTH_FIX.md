# Dizin App Dev Auth Fix

Bu paket `frontend/lib/backend-http.ts` ve `frontend/lib/api-client.ts` dosyalarını düzeltir.

Ana düzeltme:
- Frontend tüm API isteklerinde `X-Dev-User: dev-user` header'ını gönderir.
- `apiFetch`, `apiFetchJson`, `apiFetchBlob` export'ları birlikte korunur.
- Eski/stale `Authorization` token olsa bile local backend dev mode `X-Dev-User` ile çalışır.

Kurulumdan sonra `.next` silinip frontend yeniden başlatılmalıdır.
