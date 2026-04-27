# Dizin App Delete Project Hotfix

Bu paket `api.deleteProject is not a function` hatasını düzeltir. Ayrıca mevcut frontend ekranlarının kullandığı `upload`, `runAnalysis/analyze`, `exportPdf`, `exportDocx`, `getHighlights` gibi API fonksiyonlarını aynı dosyada toplar.

## Kurulum

```bash
cd /Users/furkan.orucoglu/Projects/dizin-app/frontend

unzip -o ~/Downloads/dizin-app-delete-project-hotfix.zip -d .

rm -rf .next

npm run dev
```
