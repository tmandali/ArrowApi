# VirtualSpreadsheet Alt Sistemi Mimari Rehberi & Kuralları (AGENTS.md)

Bu doküman, `VirtualSpreadsheet` ve alt modüllerinde (`src/features/jobs/components/virtual-spreadsheet/`) geliştirme, hata ayıklama veya refactoring yapacak geliştiriciler ve AI ajanları için mimari standartları ve korunması gereken temel değişmezleri (invariants) tanımlar.

---

## 📂 1. Dizin Haritası ve Modül Sorumlulukları

```
src/features/jobs/components/
├── VirtualSpreadsheet.tsx                # Ana Orkestratör: Sanal pencereleme, scroll senkronizasyonu, D&D, header & body
└── virtual-spreadsheet/
    ├── index.ts                          # Public API: Tüm alt modüllerin barrel export kapısı
    ├── types.ts                          # Tip tanımları (SpreadsheetColumn, VirtualSpreadsheetProps) ve stil sabitleri
    ├── column-sizing.ts                  # Canvas 2D reflow-free metin ölçümü ve auto-fit genişlik hesaplamaları
    ├── ColumnTypeBadge.tsx               # Şema destekli veri tipi rozetleri (Sayi, Tarih, Mantiksal, Metin)
    ├── ColumnManagementMenu.tsx          # Kolon goster/gizle, sabitle/kaldir, arama ve klavye etkilesimli Popover menusu
    ├── TableSkeletonRows.tsx             # Ilk yukleme ve sonsuz kaydirma icin sticky destekli iskelet satirlari
    ├── TableFooterSummaryRow.tsx         # Airtable/Excel tarzi alt toplam satiri (SUM, AVG, MIN, MAX, COUNT, DISTINCT)
    ├── column-aggregations.ts            # Bellek ici ve DuckDB tek gecisli SQL alt toplam hesaplama motoru
    └── tests/                            # Otomasyon testleri: npm run test:grid
        ├── filter-parser.test.mjs        # DuckDB WHERE SQL üretimi, istemci arama ve şema formatlama testleri
        ├── export-formats.test.mjs       # Excel 1M/2M limitleri, ZSTD Parquet ve GZIP CSV kural testleri
        ├── test-parquet-merge.mjs        # OPFS parça birleştirme ve lazy parquet akış testleri
        ├── test-criteria-input-engine.mjs# D365/BC sözdizimi, tarih ve zorunlu alan doğrulama testleri
        ├── test-aggregations.mjs         # Kolon alt toplam (SUM, AVG, DISTINCT) ve SQL üretim testleri
        └── run-all.mjs                   # Tüm grid testlerini tek komutla koşan test orkestratörü
```

### Sorumluluk Bölüşümü:
- **`types.ts`**: Saf TypeScript tipleri ve temel CSS sınıfları (`cellClass`, `cellInputClass`, `headClass`, `ROW_HEIGHT`, `SKELETON_ROWS`, `MIN_COL_WIDTH`). UI veya hook barındırmaz.
- **`column-sizing.ts`**: Saf hesaplama ve ölçüm motoru. DOM reflow'u tetiklemeden çalışan Canvas 2D fonksiyonları barındırır.
- **`ColumnTypeBadge.tsx`**: DuckDB şeması (`duckType`) ve türetilmiş tipe (`kind`) dayalı görsel rozet bileşenidir.
- **`ColumnManagementMenu.tsx`**: Popover menü arayüzü, liste arama, klavye ok tuşları (`ArrowUp`/`ArrowDown`/`Enter`/`Space`/`P`), ayraç ve çift görevli hover/odak slotunu kapsüller.
- **`TableSkeletonRows.tsx`**: Sanal tablo gövdesinde ilk yükleme ve sonsuz kaydırma sırasında sticky kolonların hizasını ve gölgesini koruyarak iskelet satırları çizer.
- **`VirtualSpreadsheet.tsx`**: Tablonun ana bileşenidir. `useVirtualWindow` ile sadece ekranda görünen satırları render eder, dikey/yatay scroll senkronizasyonunu yönetir ve `localStorage` orkestrasyonunu yürütür.

---

## 🛡️ 2. Kritik Mimari Değişmezler (Hard Invariants)

Bu bileşende değişiklik yaparken aşağıdaki kurallar **asla ihlal edilmemelidir**:

### Kural 1: Sıfır DOM Reflow (Zero-Reflow Text Measurement)
- Kolon başlığı veya hücre içeriklerinin genişliği ölçülürken **asla** gizli DOM elementleri (`<span>`, `<div>`) eklenemez veya `getBoundingClientRect()` çağrılamaz.
- Tüm ölçümler `column-sizing.ts` içindeki `measureTextWidth()` fonksiyonu ve tekil `HTMLCanvasElement` 2D context üzerinden yürütülür (0 ms, tarayıcı layout maliyetsiz).
- Auto-fit çift tıklama hesaplamasında performans için en fazla ilk 120 satır örneklenir (`sampleLimit = Math.min(items.length, 120)`).

### Kural 2: Event İzolasyonu (Resize vs Drag Çakışması)
- Kolon başlıklarında hem sürükle-bırak sıralama (HTML5 Drag & Drop) hem de kenardan boyutlandırma (Resizer Handle) bulunur.
- Resizer handle üzerine basıldığında (`onPointerDown` / `onMouseDown`), `isResizingRef.current = true` olarak kilitlenir ve başlığın `draggable={false}` olması sağlanır. Bu kilit olmadan kolon sürükleme ile boyutlandırma birbirine girer.
- Ayraç üzerinde çift tıklama (`onDoubleClick`) tespit edildiğinde sürükleme başlatılmamalı, doğrudan `calculateColumnAutoFitWidth()` tetiklenmelidir.

### Kural 3: Sticky / Pinned Kolon Sınırı & Gruplama
- Sabitlenmiş kolonlar daima tablonun **en solunda** gruplanır (`[...pinned, ...unpinned]`).
- **Tablonun tamamı sabitlenemez:** Kullanıcının yatay kaydırma yapabilmesi için tabloda en az **1 kolonun kaydırılabilir (unpinned) kalması garanti edilmelidir**:
  ```ts
  const effectivePinnedCount = Math.min(
    visiblePinnedCount,
    visibleColumns.length > 1 ? visibleColumns.length - 1 : 0
  )
  ```
- Son sabitlenmiş kolon, tablo sağa kaydırıldığında (`isScrolledLeft === true`) sağ kenarında dinamik bir derinlik gölgesi (`shadow-[3px_0_5px_-2px_rgba(0,0,0,0.12)]`) gösterir.
- Her sabit kolonun `left` değeri, kendisinden önceki sabit kolonların genişliklerinin kümülatif toplamı (`getStickyLeftOffset`) olarak inline style ile verilir.

### Kural 4: Senkronize Çift Eksenli Scroll Mimarisi
- Dikey kaydırma çubuğu tablo başlığının (header) üstünde değil, **başlığın hemen altında** yer almalıdır.
- Bu nedenle ana scroll alanı `<tbody>`'yi saran `min-h-0 flex-1 overflow-auto` div'idir (`scrollRef`).
- Başlık satırı yatayda kaydırıldığında, body'nin yatay kaydırmasıyla kusursuz senkronize olması için `scrollRef.current.scrollLeft` dinlenir ve header `transform` / `scrollLeft` ile eşlenir.

### Kural 5: Görünürlük Sınırı (Minimum 1 Kolon Kuralı)
- Kullanıcı tüm kolonları gizleyemez. Tabloda kalan son görünür kolonun checkbox'ı `disabled` duruma getirilir ve gizleme eylemi engellenir.

### Kural 6: Public API & React Fast Refresh Standartı
- `VirtualSpreadsheet.tsx` dosyası, React Fast Refresh standardına tam uyum için sadece bileşeni ve tipleri dışa aktarır (`react(only-export-components)` kuralı):
  - `export function VirtualSpreadsheet<T>`
  - `export type { SpreadsheetColumn, VirtualSpreadsheetProps }`
- Stil ve sayısal sabitler (`ROW_HEIGHT`, `cellClass`, `cellInputClass`, `headClass`, `SKELETON_ROWS`, `MIN_COL_WIDTH`) ise doğrudan `./virtual-spreadsheet` modülünden import edilir.

### Kural 7: Kolon Alt Toplam / Özet Çubuğu (Footer Aggregations)
- `<tfoot>` tablonun en altında dikey scroll penceresinde `sticky bottom-0 z-20` olarak yer alır ve dikey kaydırmada daima görünür kalır.
- Yatay kaydırmada `thead` ve `tbody` ile kusursuz senkronizasyon sağlanır: `getStickyLeftOffset(index)` ile pinned kolonların sol mesafeleri, `isLastPinned && isScrolledLeft` sağ kenar gölgesi birebir korunur.
- **İki Kademeli Hesaplama Mimarisi:**
  - **DuckDB SQL Pushdown:** DuckDB WASM üzerinde aktif filtrelerle `buildDuckDbAggregationSql()` tek geçişli SQL sorgusu çalıştırır (1M filtrelenmiş satırda ~15-20 ms).
  - **In-Memory Fallback:** DuckDB henüz hazır değilken veya küçük veri kümelerinde `computeInMemoryAggregations()` ile CPU üzerinde anında hesaplanır.
- **Desteklenen Metrikler:** Sayısal kolonlar için `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `DISTINCT`; metin/tarih kolonları için `COUNT`, `DISTINCT`; `None` (kapatma).
- **LocalStorage Kalıcılığı:** Kullanıcının seçtiği kolon metrikleri (`aggregations`) ve çubuk görünürlük durumu (`showFooterSummary`) `GridPersistedState` içine kaydedilir ve "Varsayılana Sıfırla" ile temizlenir.

### Kural 8: AI SQL Görünümleri ve Açılır Seçici (AI SQL Views Dropdown)
- Yula AI `set_grid_query` çalıştırdığında veya yeni bir analitik sorgu ürettiğinde, bu sorgu ekranda geçici AI görünümü olarak anında çalıştırılır ve başlık rozetinde (`[ ✦ {title} • ▾ ]`) gösterilir; ancak **otomatik olarak kalıcı listeye kaydedilmez**.
- Kullanıcı isterse açılır menüdeki **"Kaydet"** butonu ile bu görünümü isimlendirip `${storageKey}_ai_views` altında kalıcı hale getirir.
- Rapor başlığının hemen sağında rozet şeklinde açılır menü (`AiViewDropdown`) yer alır: `[ ✦ {view.title} ▾ ]` veya `[ ⊞ Ham Veri ▾ ]`.
- Kullanıcı tek tıkla `Ham Veri (Tüm Kayıtlar)` ile kayıtlı veya geçici AI SQL analizleri arasında geçiş yapabilir. Ham veriye dönüldüğünde kaydedilmemiş geçici sorgu temizlenir ve kalıcı listeyi kirletmez.
- Menü üzerinden kayıtlı AI görünümleri **yeniden adlandırılabilir** (`rename`), **silinebilir** (`delete`) ve **SQL sorgusu incelenebilir/kopyalanabilir**.
- Silinen görünüm aktifse grid otomatik olarak temel `Ham Veri` görünümüne geri döner.



---

## ⌨️ 3. Kolon Menüsü & Sıralama / Sabitleme (ColumnManagementMenu)

`ColumnManagementMenu` bileşeni tam klavye ve sürükle-bırak erişilebilirliğine sahiptir:
- **Otomatik Odak:** Menü açıldığında odak derhal arama kutusuna (`Input`) geçer ve mevcut metin seçilir (`select()`).
- **Klavye Tuşları:**
  - `ArrowDown` / `ArrowUp`: Kolonlar listesinde dikey gezinme (seçili öğe otomatik `scrollIntoView` ile görünür kılınır).
  - `Alt+ArrowUp`: Seçili kolonu bir yukarı (sola) taşır ve odağı üzerinde tutar.
  - `Alt+ArrowDown`: Seçili kolonu bir aşağı (sağa) taşır ve odağı üzerinde tutar.
  - `Enter` / `Space`: Seçili kolonun görünürlüğünü aç/kapat (Checkbox toggle).
  - `P` / `p`: Seçili kolonu sola sabitle / sabitlemeyi kaldır (Pin/Unpin toggle).
  - `Escape`: Arama doluysa aramayı temizler; arama boşsa menüyü kapatır.
- **Cascading Render Önleme:** Menü açık/kapalı durumu değiştiğinde `useEffect` içinde senkron `setState` çağrılmamalıdır (`react/set-state-in-effect` kuralı). State temizliği ve odak yönetimi doğrudan `onOpenChange` ve `onOpenAutoFocus` callback'leri içinde yürütülür.
- **Çok Fonksiyonlu Dinamik Slot (Morphing Action Bar):**
  - Kolon listesindeki sağ slot varsayılanda veri tipi rozetini (`ColumnTypeBadge`) gösterir.
  - Satır üzerine hover yapıldığında veya klavye ile odaklanıldığında rozet pürüzsüzce kaybolarak yerini **3'lü Hızlı Aksiyon Çubuğuna** bırakır:
    1. **`▲` Bir Yukarı Taşı (`ChevronUp`):** Kolonu listede bir yukarı (tabloda bir sola) taşır. En üstte disabled'dır.
    2. **`▼` Bir Aşağı Taşı (`ChevronDown`):** Kolonu listede bir aşağı (tabloda bir sağa) taşır. En altta disabled'dır.
    3. **`📌` Sola Sabitle / Kaldır (`Pin`):** Kolonu sola sabitler veya sabitlemeyi kaldırır.
- **Menü İçi Sürükle - Bırak (D&D Reordering):**
  - Her satırın solunda tutmaç ikonu (`GripVertical`) yer alır. Kullanıcı istediği satırı tutarak menü içinde yukarı/aşağı sürükleyebilir.
  - Hedef satırın üzerine gelindiğinde mavi hedef çizgisi (`border-t-2 border-primary`) belirir ve bırakıldığında tablo ile anında senkronize olur.
- **Bütünleşik Sıralama Motoru (`executeColumnReorder`):**
  - Hem tablo başlığındaki sürükle-bırak, hem menü içi sürükleme, hem de `▲` / `▼` butonları tek bir `executeColumnReorder` fonksiyonunu paylaşır. Sabit kolon sınırları, otomatik pin/unpin dönüşümleri ve `localStorage` kalıcılığı tüm bu kanallarda %100 aynı kurallarla çalışır.

---

## 💾 4. LocalStorage Kalıcılık Şeması (State Persistence)

Tablonun kolon konfigürasyonu istemci tarafında kalıcı olarak saklanır:
- **Depolama Anahtarı:** `storageKey ?? (title ? `arrow_grid_${slugify(title)}` : undefined)`
- **Veri Şeması:**
  ```ts
  interface GridPersistedState {
    order?: string[]                       // Kolon isimleri sıralaması
    widths?: Record<string, string | number> // Kolon piksel genişlikleri
    hidden?: string[]                      // Gizlenmiş kolon isimleri
    pinned?: string[]                      // Sabitlenmiş kolon isimleri
  }
  ```
- **Sıfırlama Mekanizması (`handleResetColumns`):**
  - Kullanıcı menüdeki "Varsayılana Sıfırla" (`RotateCcw`) butonuna bastığında gizli kolonlar, özel sıralama, özel genişlikler ve özel sabitlemeler sıfırlanır, `localStorage` girdisi silinir.
  - Sıfırlama butonu yalnızca kullanıcının varsayılandan farklı bir değişikliği olduğunda aktifleşir (`canResetColumns`).

---

## 🧪 5. Test ve Doğrulama Kontrol Listesi

Bu bileşen üzerinde herhangi bir kod değişikliği veya optimizasyon yapıldığında aşağıdaki adımlarla doğrulayın:

### 1. Otomasyon Testleri (`npm run test:grid`):
Tek komutla tüm tablo ve DuckDB kurallarını test eder:
```bash
npm run test:grid
```
Test suite (`src/features/jobs/components/virtual-spreadsheet/tests/`) şunları garanti eder:
- **`filter-parser.test.mjs`:**
  - `Item contains 'Elma'` -> `TRIM(CAST("Item" AS VARCHAR)) ILIKE '%Elma%'`
  - Çok kelimeli aramalar (`Elma Sirke`) -> Bağımsız kelime `AND` eşleştirmesi
  - Boş/null hücre filtreleri (`''`, `boş`, `null` -> `IS NULL OR TRIM(...) = ''`)
  - Dolu hücre filtreleri (`<>''`, `dolu` -> `IS NOT NULL AND TRIM(...) != ''`)
  - Metin içindeki tireler (`MERKEZ - ŞUBE`) aralık filtresi olarak bozulmamalı
  - Sayısal ve tarih aralıkları (`100..500`, `10 - 50` -> `>= 100 AND <= 500`)
  - Sayısal karşılaştırma operatörleri (`>=50`, `<=100`, `>0`, `=25`)
  - İstemci tarafı in-memory (`filter-matcher.ts`) ile DuckDB SQL arama uyumu
  - Şema tabanlı hücre formatlama (`BIGINT`/`INTEGER` asla binlik nokta almaz; `DECIMAL`/`FLOAT` Türkçe formatlanır)
- **`export-formats.test.mjs`:**
  - DuckDB C++ GZIP CSV sözdizimi (`COMPRESSION GZIP`, `DELIMITER ';'`)
  - Apache Parquet ihracı: DuckDB WASM 32-bit OOM'u önlemek için OPFS parçaları ve parquet-wasm lazy-stream ile sıfır bellek yüküyle birleştirme (`test-parquet-merge.mjs`)
  - Excel 1.000.000 satır limitini aşan durumlarda otomatik sayfalara (`Sayfa 1`, `Sayfa 2`...) bölme mantığı
  - DuckDB-Wasm Issue #2119 fazladan çöp bayt tespiti ve `PK\x03\x04` imza kırpma doğrulaması

### 2. Statik Analiz & Derleme:
- `npm run lint` (oxlint): **0 warnings, 0 errors** olmalı.
- `npm run typecheck` (tsc): **0 errors** olmalı.

### 3. Manuel Fonksiyonel Kontrol Listesi:
- Kolon ayırıcıya basıldığında sürüklemenin (D&D) tetiklenmediğini doğrulayın.
- Kolon ayırıcıya çift tıklandığında kolonun içeriğe tam sığdığını doğrulayın.
- Kolon menüsünden bir kolon sabitlendiğinde (Pin) listenin soluna geçtiğini ve ayracın altına yerleştiğini doğrulayın.
- Tablo yatay kaydırıldığında sabit kolonların yerinde kaldığını ve son sabit kolonun sağında derinlik gölgesinin belirdiğini doğrulayın.
- Sayfa yenilendiğinde (F5) kolon sırası, genişliği, gizliliği ve sabitlemelerin korunduğunu doğrulayın.
