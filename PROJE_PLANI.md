# PDF Dizin Çevirici — Proje Planı

Bu doküman, az önce manuel olarak yaptığımız işlemi (İngilizce kitap dizinini Türkçe çevirideki sayfa numaralarına dönüştürme) tekrarlanabilir bir web uygulamasına dönüştürmek için Claude Code'un takip edebileceği detaylı bir plandır.

---

## 1. Proje Özeti

**Ne yapıyor:** Kullanıcı bir kitabın İngilizce orijinal PDF'ini, Türkçe çeviri PDF'ini ve mevcut dizin (`.docx`) dosyasını yükler. Sistem, dizinde geçen İngilizce sayfa numaralarını Türkçe çevirideki karşılık gelen sayfa numaralarıyla değiştirir, formatı bozmadan yeni bir docx üretir ve interaktif bir karşılaştırma arayüzü sunar.

**Çekirdek değer önerisi:**
- İçerik tabanlı doğrulama (tahmin değil, gerçek içerik eşleşmesi)
- Format koruma (italic, smart-quote, paragraf yapısı)
- İnteraktif denetim (her giriş için iki PDF'i yan yana açma)
- Manuel düzeltme imkânı

---

## 2. Hedefler ve Kısıtlamalar

### 2.1 Birincil hedefler
1. Hatasız dizin çevirisi (proper-noun bazlı içerik doğrulama ile)
2. Orijinal docx formatının %100 korunması
3. Her sayfa numarasını PDF üzerinde tıklayarak doğrulayabilme
4. Tek seferde işlem süresi < 60 saniye (300 sayfalık kitap için)

### 2.2 İkincil hedefler
- Birden fazla kitap projesini saklama (kullanıcı hesabı)
- Manuel düzeltmelerin kayıt altına alınması
- PDF karşılaştırma raporu üretimi (yan yana sayfa görseli)

### 2.3 Kapsam dışı (ilk sürüm)
- OCR (taranmış PDF desteği)
- Çoklu dil desteği (sadece TR/EN)
- Mobil uyumluluk (masaüstü öncelikli)

---

## 3. Mimari

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Next.js UI    │ ──────▶│  FastAPI Backend  │────────▶│  Worker (Python) │
│   (React + TS)  │  HTTP   │   (REST + WS)     │  Queue  │  pdftotext, docx │
└─────────────────┘         └──────────────────┘         └──────────────────┘
        │                            │                            │
        │                            ▼                            ▼
        │                   ┌──────────────────┐         ┌──────────────────┐
        └──────────────────▶│   File Storage   │         │   SQLite/Postgres│
                            │  (local / S3)    │         │   (proje kaydı)  │
                            └──────────────────┘         └──────────────────┘
```

**Neden bu mimari:**
- **Frontend ayrı:** PDF görüntüleme (pdf.js) tarayıcıda çok performanslı
- **Backend Python:** Olgun PDF/docx kütüphaneleri (`pdftotext`, `python-docx`, `lxml`)
- **Worker ayrı:** Uzun süren işlemleri ana API'den izole eder, ilerleme bildirimi WebSocket ile

---

## 4. Teknoloji Yığını

| Katman | Teknoloji | Sebep |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, modern routing |
| UI kütüphanesi | shadcn/ui + Tailwind CSS | Erişilebilir, özelleştirilebilir |
| PDF görüntüleme | `react-pdf` (pdf.js) | Sayfa-spesifik açılış, highlight desteği |
| Form/Upload | `react-dropzone` + `tanstack/react-query` | Sürükle-bırak, cache |
| Backend | FastAPI (Python 3.12) | Async, otomatik OpenAPI |
| PDF metin çıkarma | `pdftotext` (poppler) | Sayfa başına temiz çıktı |
| DOCX işleme | `python-docx` + ham `lxml` | Format korumak için lxml gerekli |
| Worker | Celery + Redis (veya FastAPI BackgroundTasks) | Uzun işler için |
| DB | SQLite (geliştirme), PostgreSQL (prod) | Proje meta verisi |
| Auth | NextAuth.js (basit) | E-posta/Google girişi |
| Deployment | Vercel (FE) + Fly.io / Railway (BE) | Hızlı kurulum |

---

## 5. Çekirdek Algoritma

Bu, manuel olarak doğruladığımız ve bu projenin "kalbi" olan kısımdır. Algoritma 5 ana aşamadan oluşur.

### 5.1 PDF Sayfa Çıkarma ve Ofset Tespiti

```python
# Pseudokod
def extract_pages(pdf_path):
    """Her sayfanın metnini ayrı ayrı çıkarır."""
    pages = {}
    for phys in range(1, total_pages + 1):
        text = pdftotext(pdf_path, phys, phys)
        text = text.replace('-\n', '').replace('\u00AD', '')  # tireleri birleştir
        pages[phys] = text
    return pages

def detect_front_matter_offset(pages):
    """Basılı sayfa 1'in fiziksel sayfasını bulur.
    Yöntem: 'Önsöz', 'Preface' veya '1' kelimesinin tek başına bulunduğu
    ilk sayfayı arar."""
    for phys, text in pages.items():
        # Sayfa sonunda ortada '1' var mı? Veya 'Preface'/'Önsöz' başlıyor mu?
        if re.search(r'^Preface\s*$|^Önsöz\s*$', text, re.M):
            return phys - 1  # offset = phys - printed_page
    raise ValueError("Önsöz bulunamadı")
```

**Önemli:** Kullanıcıya offset doğrulama ekranı sun (auto-detect + manuel düzeltme).

### 5.2 Bölüm Çapaları (Anchors) Tespiti

```python
def find_chapter_anchors(en_pages, tr_pages):
    """Bölüm başlıklarını her iki PDF'te de eşleştirir.
    Çıktı: [(en_printed, tr_printed), ...] çapa listesi."""
    # Heuristik: kısa metin (< 50 kelime) içeren ve başlık-stil sayfalar
    en_chapter_starts = detect_chapter_starts(en_pages)
    tr_chapter_starts = detect_chapter_starts(tr_pages)

    # Sırayla eşleştir (sıra korunur — hem orijinal hem çeviri aynı bölüm sayısına sahiptir)
    if len(en_chapter_starts) != len(tr_chapter_starts):
        raise ValidationError("Bölüm sayısı uyuşmuyor; manuel düzeltme gerekli")

    return list(zip(en_chapter_starts, tr_chapter_starts))
```

**UI gerekliliği:** Çapaları kullanıcıya doğrulatan bir arayüz (her bölüm için EN/TR sayfa eşleşmesini göster, kullanıcı düzeltebilsin).

### 5.3 Global Sayfa Haritası

```python
def build_global_map(anchors, total_en_pages):
    """Çapalar arasında lineer interpolasyon yaparak her EN sayfa için
    bir TR sayfa tahmini üretir."""
    M = {}
    for i in range(len(anchors) - 1):
        e1, t1 = anchors[i]
        e2, t2 = anchors[i+1]
        for en in range(e1, e2):
            ratio = (en - e1) / (e2 - e1)
            M[en] = round(t1 + ratio * (t2 - t1))
    # Son çapa sonrası: doğrusal devam et
    last_en, last_tr = anchors[-1]
    for en in range(last_en, total_en_pages + 1):
        M[en] = last_tr + (en - last_en)
    return M
```

### 5.4 Dizin Ayrıştırma (Format Koruyarak)

```python
def parse_index_docx(docx_path):
    """docx'in iç XML'ini paragraf/run düzeyinde ayrıştırır.
    Italic, bold, smart-quote gibi formatları korur."""
    with zipfile.ZipFile(docx_path) as z:
        xml = z.read("word/document.xml").decode("utf-8")

    paragraphs = []
    for p_match in re.finditer(r"<w:p[^>]*>.*?</w:p>", xml, re.DOTALL):
        para_xml = p_match.group(0)
        runs = []
        for r_match in re.finditer(r"<w:r(?:\s[^>]*)?>.*?</w:r>", para_xml, re.DOTALL):
            r_xml = r_match.group(0)
            text = extract_text(r_xml)  # smart-quote entity decode
            italic = '<w:i/>' in r_xml or '<w:i ' in r_xml
            bold = '<w:b/>' in r_xml or '<w:b ' in r_xml
            runs.append({"text": text, "italic": italic, "bold": bold, "xml": r_xml})
        paragraphs.append({"runs": runs, "xml": para_xml})
    return paragraphs
```

### 5.5 Proper-Noun Bazlı Monoton DP

Bu algoritmanın en kritik kısmıdır:

```python
def assign_pages_for_entry(en_pages_sorted, dp_aliases, global_map,
                            en_pdf, tr_pdf):
    """
    Bir dizin girişinin EN sayfa listesini TR sayfa listesine dönüştürür.

    Strateji:
    1. Eğer giriş bir özel isim içeriyorsa (Penfield, Allport vb.):
       - O isim hem EN hem TR PDF'inde geçen sayfaları bul
       - Her EN sayfası için: o sayfada isim varsa, en yakın TR-sayfa-with-isim'i seç
       - Monotonluk korunsun (bir önceki seçilen TR sayfasından küçük olmasın)
    2. Eğer özel isim yoksa: global haritayı kullan
    3. DP çok az farklı TR sayfasına çökerse (translation rephrasing belirtisi):
       global haritaya geri dön
    """
    if not dp_aliases:
        return {p: global_map[p] for p in en_pages_sorted}

    en_with = set()
    tr_with = set()
    for name in dp_aliases:
        en_with.update(find_pages_containing(en_pdf, name))
        tr_with.update(find_pages_containing(tr_pdf, name))

    if not tr_with:
        return {p: global_map[p] for p in en_pages_sorted}

    # DP: state = son atanan TR sayfası, değer = (toplam_maliyet, atama_listesi)
    states = {0: (0, [])}
    for en_p in en_pages_sorted:
        global_tr = global_map[en_p]
        new_states = {}
        for last_tr, (cost, assigns) in states.items():
            if en_p in en_with:
                # Bu EN sayfasında isim VAR — TR-with-name içinden seç
                for tr_p in sorted(tr_with):
                    if tr_p < last_tr:
                        continue
                    if abs(tr_p - global_tr) > 4:  # global haritadan çok uzaksa atla
                        continue
                    used_set = {t for _, t in assigns}
                    reuse_penalty = 1.5 if tr_p in used_set else 0
                    new_cost = cost + abs(tr_p - global_tr) + reuse_penalty
                    if tr_p not in new_states or new_states[tr_p][0] > new_cost:
                        new_states[tr_p] = (new_cost, assigns + [(en_p, tr_p)])
            else:
                # İsim bu EN sayfasında yok — global haritayı kullan
                tr_p = max(global_tr, last_tr)  # monotonluk
                new_cost = cost + abs(tr_p - global_tr)
                if tr_p not in new_states or new_states[tr_p][0] > new_cost:
                    new_states[tr_p] = (new_cost, assigns + [(en_p, tr_p)])
        states = new_states

    # En düşük maliyetli durumu seç
    best_assigns = min(states.values(), key=lambda x: x[0])[1]
    result = dict(best_assigns)

    # Çökme kontrolü
    distinct = len(set(result.values()))
    if len(en_pages_sorted) > 2 and distinct * 2 < len(en_pages_sorted):
        return {p: global_map[p] for p in en_pages_sorted}
    return result
```

### 5.6 Alias (Eş İsim) Tanıma

```python
def proper_noun_aliases(headword):
    """
    Bir dizin girişinin başlığından eş isimleri çıkarır.
    Örnek: 'Molaison, Henry (HM)' → ['Molaison', 'Henry', 'HM']

    DP için sadece soyad + büyük harf kısaltma kullanılır;
    firstname trim/dedup için kullanılır (çok yaygın isim olmasın diye).
    """
    if not headword: return []
    paren_match = re.search(r'\(([^)]+)\)', headword)
    base = re.sub(r'\([^)]*\)', '', headword).strip().rstrip(',')
    parts = [p.strip() for p in re.split(r',', base) if p.strip()]
    if not parts: return []

    aliases = []
    surname = parts[0]
    if not is_proper_noun(surname): return []
    aliases.append(surname)

    if len(parts) > 1:
        firstname = parts[1].split()[0]
        if is_proper_noun(firstname):
            aliases.append(firstname)
    if paren_match:
        abbr = paren_match.group(1).strip()
        if re.match(r'^[A-Z]{2,}$', abbr):
            aliases.append(abbr)
    return aliases
```

### 5.7 Aralık Kırpma ve Tekrar Eleme

```python
def trim_range_to_name_pages(start, end, tr_with_name):
    """Eğer çevrilmiş aralık (örn. 249-250), TR sayfalarında ismin
    sadece 249'da olduğunu gösteriyorsa, aralığı 249'a kırp."""
    while end > start and end not in tr_with_name:
        end -= 1
    return start, end

def dedupe_paragraph(paragraph):
    """Bir paragraftaki çift sayfa numaralarını sil (italic vs non-italic
    ayrımını koru — bunlar bilinçli olarak farklıdır)."""
    seen_regular, seen_italic = set(), set()
    for token in paragraph.tokens:
        pool = seen_italic if token.italic else seen_regular
        if token.pages.issubset(pool):
            mark_for_removal(token)
        else:
            pool |= token.pages
```

---

## 6. Backend API Tasarımı

### 6.1 Endpoint listesi

```
POST   /api/projects                      Yeni proje oluştur
GET    /api/projects                      Kullanıcının projeleri
GET    /api/projects/{id}                 Tek proje detayı
DELETE /api/projects/{id}                 Proje sil

POST   /api/projects/{id}/upload          Dosya yükle (PDF/docx)
       (multipart, type: en_pdf|tr_pdf|index_docx)

POST   /api/projects/{id}/analyze         İlk analizi başlat
                                          → ofset, çapalar, proper-nounlar
GET    /api/projects/{id}/analysis        Analiz sonucunu döndür

POST   /api/projects/{id}/anchors         Çapaları onayla/düzelt
                                          Body: [{en_page, tr_page}, ...]

POST   /api/projects/{id}/process         Asıl çeviriyi başlat
GET    /api/projects/{id}/status          İşlem durumu (WebSocket de var)
WS     /api/projects/{id}/progress        İlerleme akışı

GET    /api/projects/{id}/entries         İşlenmiş giriş listesi (sayfalama)
PATCH  /api/projects/{id}/entries/{idx}   Manuel düzeltme

GET    /api/projects/{id}/export.docx     Son docx'i indir
GET    /api/projects/{id}/comparison.pdf  Karşılaştırma PDF'ini indir

GET    /api/projects/{id}/pages/en/{n}    EN sayfa görüntüsü (PNG)
GET    /api/projects/{id}/pages/tr/{n}    TR sayfa görüntüsü (PNG)
GET    /api/projects/{id}/pages/{lang}/{n}/highlight?term=X
                                          Belirli terimi vurgulayarak döndür
```

### 6.2 Veri modelleri

```python
class Project(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    created_at: datetime
    en_pdf_path: str | None
    tr_pdf_path: str | None
    index_docx_path: str | None
    status: Literal["draft", "analyzing", "ready", "processing", "done", "error"]

class Anchor(BaseModel):
    en_page: int
    tr_page: int
    auto_detected: bool
    confirmed: bool

class IndexEntry(BaseModel):
    project_id: UUID
    paragraph_index: int
    headword: str
    aliases: list[str]
    is_proper_noun: bool
    original_pages: list[PageRef]    # EN sayfaları
    translated_pages: list[PageRef]  # TR sayfaları
    confidence: Literal["high", "medium", "low"]
    manually_edited: bool
    raw_xml: str  # format korumak için ham docx XML

class PageRef(BaseModel):
    start: int
    end: int  # = start eğer tek sayfaysa
    italic: bool = False
```

---

## 7. Frontend (Sayfalar ve Bileşenler)

### 7.1 Sayfa hiyerarşisi

```
/                            Ana sayfa (proje listesi + Yeni Proje)
/projects/new                Yeni proje wizard (3 adım)
/projects/[id]               Ana çalışma alanı
  /projects/[id]/anchors     Çapa düzenleme
  /projects/[id]/review      İnteraktif inceleme (en kritik ekran)
  /projects/[id]/export      İndirme + raporlar
/settings                    Hesap ayarları
```

### 7.2 Ana Çalışma Alanı: `/projects/[id]/review`

Bu, ürünün kalbi olan ekrandır:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Proje Adı]                                    [Kaydet] [Dışa Aktar]    │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐ ┌──────────────────┐ ┌────────────────────────┐ │
│ │ Dizin Girişleri      │ │  Karşılaştırma   │ │  PDF Görüntüleyici     │ │
│ │                      │ │                  │ │                        │ │
│ │ [Ara...]             │ │ Orijinal:        │ │ [EN] [TR]              │ │
│ │ ▼ Filtre             │ │ Penfield 212     │ │                        │ │
│ │                      │ │                  │ │  ┌──────────────────┐  │ │
│ │ • açık uçlu sorular  │ │ Çevrilmiş:       │ │  │                  │  │ │
│ │ • Allport, Gordon    │ │ Penfield 224     │ │  │  PDF sayfası     │ │ │
│ │ ▶ Badre, David       │ │                  │ │  │  (vurgulanmış    │  │ │
│ │   Penfield ⚠         │ │ Doğrulama:       │ │  │   "Penfield" ile)│  │ │
│ │ • Proust, Marcel     │ │ ✓ EN s.212 'de   │ │  │                  │ │ │
│ │                      │ │   "Penfield"     │ │  └──────────────────┘  │ │
│ │ [50 / 544]           │ │   bulundu        │ │                        │ │
│ │ ◀ ▶                  │ │ ✓ TR s.224 'te   │ │  Sayfa: [224] / 296    │ │
│ │                      │ │   "Penfield"     │ │  ◀ ▶                   │ │
│ │                      │ │   bulundu        │ │                        │ │
│ │                      │ │                  │ │                        │ │
│ │                      │ │ [Manuel Düzelt]  │ │                        │ │
│ │                      │ │ Güven: ●●● Yüksek│ │                        │ │
│ └──────────────────────┘ └──────────────────┘ └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Anahtar bileşenler (shadcn/ui temelli)

| Bileşen | Görev |
|---|---|
| `<EntryList>` | Sanal kaydırmalı (virtualized) giriş listesi (544+ giriş için) |
| `<EntryCard>` | Tek giriş için orijinal/çevrilmiş yan yana |
| `<ConfidenceBadge>` | Güven skoru rozet (high=yeşil, medium=sarı, low=kırmızı) |
| `<PdfViewer>` | react-pdf temelli, sayfa ve highlight desteği |
| `<PageHighlight>` | İsmin sayfa içinde geçtiği yeri kırmızı kutu ile vurgular |
| `<AnchorEditor>` | Çapa eşleşmelerini sürükle-bırak ile düzenleme |
| `<ManualEditDialog>` | Tek girişin sayfa numaralarını manuel yazma |
| `<ProgressBar>` | Backend WebSocket'inden gelen ilerleme |

### 7.4 İnteraktif vurgulama detayı

Kullanıcı bir giriş seçtiğinde:

1. Sağdaki PDF görüntüleyici TR sayfa N'e atlar
2. Backend `/pages/tr/{N}/highlight?term=Penfield` çağrılır
3. Backend, sayfanın PNG'sini üretir, terimin geçtiği yerin koordinatlarını işaretler
4. Frontend, PNG üzerine SVG `<rect>` çizerek vurgulama yapar

```python
# Backend tarafı (pdf2image + PyMuPDF kullanarak)
def render_page_with_highlight(pdf_path, page_num, term):
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    rects = page.search_for(term)  # liste of fitz.Rect
    pix = page.get_pixmap(dpi=150)
    return {
        "image": pix.tobytes(),
        "highlights": [{"x": r.x0, "y": r.y0, "w": r.width, "h": r.height,
                         "page_w": pix.width, "page_h": pix.height}
                       for r in rects]
    }
```

---

## 8. Geliştirme Aşamaları (Phase'ler)

Claude Code'a şu sırayla görev ver. Her aşama bağımsız çalışan bir versiyon üretmeli.

### **Phase 1 — MVP CLI (1-2 gün)**

Hiç UI olmadan, komut satırından çalışan Python paketi. Önceki çalışmamızdaki algoritmayı yeniden paketle.

**Talimat:**
```
"Phase 1'i başlat. /backend altında Python paketi oluştur:
- pdf_extractor.py: pdftotext kullanarak sayfa başına metin çıkarma
- index_parser.py: docx ayrıştırma, format koruma
- mapper.py: anchor + monoton DP algoritmasını içerir
- cli.py: 'python -m dizinapp <en.pdf> <tr.pdf> <index.docx> -o out.docx'

Test verisi olarak /tests/fixtures/ altına küçük örnekler koy.
pytest ile birim testleri yaz."
```

**Tamamlandı kriteri:** CLI ile bizim ürettiğimiz `DIZIN_TR.docx`'in aynısı üretilebilmeli.

### **Phase 2 — FastAPI Backend (2-3 gün)**

Phase 1'i HTTP API olarak sun.

**Talimat:**
```
"Phase 2'yi başlat. /backend/api altında FastAPI uygulaması:
- Endpoint listesi PROJE_PLANI.md bölüm 6.1'de
- Dosya yükleme: max 50MB, sadece pdf/docx
- BackgroundTasks ile asenkron analiz
- WebSocket ile ilerleme bildirimi
- SQLite + SQLModel ile proje veritabanı
- Auth: NextAuth ile entegre olacak şekilde JWT doğrulaması

OpenAPI schema otomatik üretilsin (FastAPI default).
docker-compose.yml ile lokal kurulum dahil et."
```

### **Phase 3 — Next.js Frontend MVP (3-4 gün)**

İnteraktif inceleme olmadan, sadece yükleme ve indirme akışı.

**Talimat:**
```
"Phase 3'ü başlat. /frontend altında Next.js 14 projesi:
- Tailwind + shadcn/ui kurulumu
- 3 ekran: ana sayfa, yeni proje wizard, proje detay (basit liste)
- Dosya yükleme (react-dropzone)
- Backend ile bağlantı (TanStack Query)
- Sonucu indirme butonu

Henüz inceleme/karşılaştırma ekranı YOK. Sadece end-to-end akış çalışsın."
```

### **Phase 4 — İnteraktif İnceleme (4-5 gün)**

Ürünün kalp atışı.

**Talimat:**
```
"Phase 4'ü başlat. /projects/[id]/review ekranını inşa et:
- 3 panel layout (Liste / Karşılaştırma / PDF)
- Sanal kaydırmalı giriş listesi (react-virtuoso)
- react-pdf ile PDF görüntüleme
- Bir giriş tıklanınca: ilgili EN ve TR sayfaları yan yana göster
- Vurgulama: backend'den gelen koordinatları SVG ile çiz
- Manuel düzeltme dialog'u

Ekran tasarımı PROJE_PLANI.md bölüm 7.2'de."
```

### **Phase 5 — Çapa Düzenleyici (2 gün)**

```
"Phase 5'i başlat. /projects/[id]/anchors ekranı:
- Otomatik tespit edilen çapaları liste olarak göster
- Her çapa için EN ve TR sayfa thumbnail'i
- Sürükle-bırak ile yeniden eşleştirme
- 'Yeni çapa ekle' butonu
- Kaydet → backend'i tetikle, mapping'i yeniden hesapla"
```

### **Phase 6 — Karşılaştırma Raporu (1-2 gün)**

```
"Phase 6'yı başlat. PDF karşılaştırma raporu üretimi:
- Her giriş için: orijinal vs çevrilmiş tablo
- Her giriş için ilgili EN ve TR sayfalarının küçük resim'i (thumbnail)
- WeasyPrint veya Playwright ile HTML→PDF
- /export.pdf endpoint'i bu dosyayı döndürür"
```

### **Phase 7 — Auth + Persistence (2 gün)**

```
"Phase 7'yi başlat. NextAuth.js ile e-posta/Google girişi.
PostgreSQL'e geçiş. Her kullanıcı sadece kendi projelerini görsün.
Dosya depolama S3/R2'ye taşınsın."
```

### **Phase 8 — Polish & Deploy (1-2 gün)**

```
"Phase 8'i başlat:
- Vercel'e frontend deploy
- Fly.io'ya backend + Redis deploy
- Sentry ile hata izleme
- Plausible Analytics
- README dokümantasyonu"
```

---

## 9. Dosya Yapısı

```
dizin-app/
├── PROJE_PLANI.md              # Bu doküman
├── README.md
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── pyproject.toml
│   ├── dizinapp/
│   │   ├── __init__.py
│   │   ├── pdf_extractor.py    # PDF metin çıkarma
│   │   ├── index_parser.py     # docx ayrıştırma
│   │   ├── mapper.py           # çekirdek algoritma
│   │   ├── proper_nouns.py     # alias tanıma
│   │   ├── docx_writer.py      # format koruyarak docx yazma
│   │   └── cli.py
│   ├── api/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   ├── projects.py
│   │   │   ├── analysis.py
│   │   │   ├── pages.py
│   │   │   └── auth.py
│   │   ├── models.py
│   │   ├── tasks.py            # background tasks
│   │   └── ws.py               # WebSocket
│   └── tests/
│       ├── fixtures/
│       │   ├── tiny_en.pdf
│       │   ├── tiny_tr.pdf
│       │   └── tiny_index.docx
│       └── test_mapper.py
│
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.ts
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                       # Ana sayfa
    │   ├── projects/
    │   │   ├── new/page.tsx
    │   │   └── [id]/
    │   │       ├── page.tsx
    │   │       ├── anchors/page.tsx
    │   │       ├── review/page.tsx        # Ana inceleme ekranı
    │   │       └── export/page.tsx
    │   └── api/auth/[...nextauth]/route.ts
    ├── components/
    │   ├── ui/                            # shadcn bileşenleri
    │   ├── EntryList.tsx
    │   ├── EntryCard.tsx
    │   ├── PdfViewer.tsx
    │   ├── PageHighlight.tsx
    │   ├── AnchorEditor.tsx
    │   ├── ConfidenceBadge.tsx
    │   └── UploadDropzone.tsx
    ├── lib/
    │   ├── api-client.ts                  # TanStack Query wrappers
    │   └── types.ts
    └── tests/
```

---

## 10. Test Stratejisi

### 10.1 Birim testler (backend)

```python
# tests/test_mapper.py
def test_proper_noun_dp_basic():
    """Bir özel isim girişi için DP doğru atamayı yapmalı."""
    en_pages = [97, 99]
    aliases = ["Hebb"]
    en_pdf = mock_pdf({97: "Hebb wrote", 98: "...", 99: "Hebb argued"})
    tr_pdf = mock_pdf({103: "Hebb yazdı", 104: "...", 105: "Hebb iddia etti"})
    global_map = {97: 103, 98: 104, 99: 105}

    result = assign_pages_for_entry(en_pages, aliases, global_map, en_pdf, tr_pdf)
    assert result == {97: 103, 99: 105}

def test_dp_collapse_fallback():
    """Translation rephrasing'de global haritaya geri dönmeli."""
    # 5 EN sayfası ama TR'de isim sadece 1 sayfada → fallback
    ...

def test_alias_handling():
    """'Molaison, Henry (HM)' için soyad+abbreviation alias'ları üretmeli."""
    assert proper_noun_aliases("Molaison, Henry (HM)") == ["Molaison", "Henry", "HM"]

def test_format_preservation():
    """docx işleme sonrası italic, smart-quote vs. korunmalı."""
    ...
```

### 10.2 Entegrasyon testleri

Bu projede ürettiğimiz `DIZIN_TR.docx`'i altın-standart olarak kullan:

```python
def test_golden_master():
    """Bizim manuel olarak doğruladığımız çıktı bayt-bayt aynı olmalı."""
    result = process_book(
        en_pdf="tests/fixtures/Our_Brains.pdf",
        tr_pdf="tests/fixtures/OurBrains_ic.pdf",
        index="tests/fixtures/DI_ZI_N.docx",
    )
    expected = open("tests/fixtures/golden/DIZIN_TR.docx", "rb").read()
    assert result.read() == expected
```

### 10.3 E2E testler (frontend)

Playwright ile kritik akışlar:
1. Yeni proje oluştur → 3 dosya yükle → analizi başlat → çapa onayla → işlemi başlat → sonucu indir
2. İnceleme ekranında bir girişi seç → PDF'in doğru sayfaya atladığını doğrula
3. Manuel düzeltme yap → değişikliğin kalıcı olduğunu doğrula

---

## 11. Performans ve Ölçeklenebilirlik

| Metrik | Hedef | Yaklaşım |
|---|---|---|
| 300 sayfalık kitap analiz süresi | < 60 sn | pdftotext paralelizasyon, multiprocessing |
| 544 girişlik dizin işleme | < 30 sn | DP cache, alias index pre-build |
| PDF sayfa render | < 500 ms | PyMuPDF + 150 DPI, Redis cache |
| Aynı anda kullanıcı | 50 | Async FastAPI + Celery |
| Dosya boyutu limiti | 50 MB / dosya | nginx body limit |

**Cache stratejisi:**
- PDF metin çıkarma → 1 hafta cache (sha256(file) → text)
- Sayfa render → 24 saat cache
- Manual override → kalıcı DB

---

## 12. Güvenlik

1. Dosya yükleme: MIME tespit + magic bytes kontrolü, sadece PDF/docx
2. Boyut limiti: 50 MB
3. Path traversal: dosya isimleri sanitize, UUID-bazlı saklama
4. Auth: NextAuth.js + httpOnly session cookies
5. CORS: sadece frontend domaininden
6. Rate limit: 10 proje / saat / kullanıcı
7. XSS: docx içeriği render edilirken DOMPurify
8. Veri silme: kullanıcı projesini silince ham dosyalar da silinmeli

---

## 13. Claude Code'a Verilecek İlk Komut

Aşağıdaki komutu Claude Code'a aynen ver:

```
PROJE_PLANI.md dosyasını oku. Bu proje, İngilizce kitap dizinlerini
Türkçe çevirilerdeki sayfa numaralarına dönüştüren bir web uygulamasıdır.

Phase 1 ile başla:
1. /backend altında Python paketi oluştur (pyproject.toml, src layout)
2. PROJE_PLANI.md bölüm 5'teki algoritmayı implement et
3. /backend/dizinapp altındaki modüller:
   - pdf_extractor.py (bölüm 5.1)
   - index_parser.py (bölüm 5.4)
   - proper_nouns.py (bölüm 5.6)
   - mapper.py (bölüm 5.2, 5.3, 5.5, 5.7)
   - docx_writer.py (format koruma)
   - cli.py (komut satırı arayüzü)
4. Her modül için pytest birim testleri yaz
5. /tests/fixtures altına minimal test PDF'leri ve docx koy
   (önemli: bu projenin ürettiği gerçek dosyaları golden master olarak kullan)

Phase 1 bitince çalışan bir CLI olmalı:
  python -m dizinapp.cli en.pdf tr.pdf index.docx -o output.docx

Başla.
```

---

## 14. Açık Sorular ve Riskler

### Belirsizlik gerektiren kararlar
1. **OCR desteği:** Taranmış PDF'ler için Tesseract entegrasyonu Phase 9'a alınabilir
2. **Çoklu dil:** Sadece TR/EN mi, yoksa generic mi? Şimdilik proper-noun heuristic'i Türkçe odaklı
3. **Para modeli:** Ücretsiz mi, freemium mi, abonelik mi?
4. **Saklama süresi:** Yüklenen PDF'leri ne kadar tutacağız? (GDPR/KVKK uyumu)

### Teknik riskler
| Risk | Etki | Azaltma |
|---|---|---|
| PDF metin çıkarma kalitesi düşük | Yüksek | OCR fallback + kullanıcı uyarısı |
| Çok büyük kitaplar (>500 sayfa) | Orta | Streaming + chunking |
| Karmaşık docx formatları (tablolar, dipnot) | Orta | İlk sürümde sadece basit dizinler |
| Türkçe karakter encoding sorunları | Düşük | UTF-8 zorla, NFC normalize |

---

## 15. Başarı Kriterleri (Phase 8 sonrası)

✅ Bu projedeki manuel olarak doğruladığımız `DIZIN_TR.docx` çıktısının %100 reproductible olması
✅ Yeni bir kitap için end-to-end işlem süresi < 5 dakika
✅ Manuel düzeltme oranı < %5 (yani algoritma %95+ entry'de doğru)
✅ Her giriş için kullanıcı PDF üzerinde "evet, gerçekten o sayfada" diyebilmeli
✅ İndirilen docx, orijinal docx'in formatını birebir koruyor

---

**Doküman versiyonu:** 1.0
**Tarih:** 2026-04-27
**Yazıldığı kaynak:** Bu konuşmadaki manuel doğrulama süreci
