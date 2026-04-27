# Auto Index Check Patch

Bu patch backend tarafında oluşturulan dizin sayfalarını ikinci kez kontrol eder.

Mantık:
- EN → TR mapping ile oluşan Türkçe sayfa numarası alınır.
- Dizin kelimesi / proper noun alias'ları Türkçe PDF içinde aranır.
- Kelime oluşan sayfada yok ama ±3 sayfa içinde varsa sayfa otomatik yakındaki doğru sayfaya çekilir.
- `storage/<project_id>/auto_check_report.json` dosyasına hangi kayıtların düzeltildiği yazılır.

Kurulum:

```bash
cd /Users/furkan.orucoglu/Projects/dizin-app/backend
unzip -o ~/Downloads/dizin-app-auto-index-check.zip -d .

# backend açıksa kapatıp tekrar aç
source .venv/bin/activate
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Sonrasında projeyi yeniden "process/oluştur" aşamasından çalıştırman gerekir; eski üretilmiş output.docx otomatik değişmez.
