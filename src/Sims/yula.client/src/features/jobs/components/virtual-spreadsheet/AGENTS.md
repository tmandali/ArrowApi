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
    └── TableSkeletonRows.tsx             # Ilk yukleme ve sonsuz kaydirma icin sticky destekli iskelet satirlari
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

### Kural 6: Public API & Geriye Dönük Uyumluluk
- `VirtualSpreadsheet.tsx` dosyası, mevcut tüketicilerin (`ArrowReportGrid`, `StockBalanceResultGrid`, `StockAnalyticsResultGrid`, `RetailSalesResultGrid` vb.) bozulmaması için aşağıdaki sembolleri doğrudan dışa aktarmaya devam etmelidir:
  - `export function VirtualSpreadsheet<T>`
  - `export type { SpreadsheetColumn, VirtualSpreadsheetProps }`
  - `export { ROW_HEIGHT, cellInputClass, cellClass, headClass }`

---

## ⌨️ 3. Kolon Menüsü & Klavye Erişilebilirliği (ColumnManagementMenu)

`ColumnManagementMenu` bileşeni tam klavye erişilebilirliğine sahiptir:
- **Otomatik Odak:** Menü açıldığında odak derhal arama kutusuna (`Input`) geçer ve mevcut metin seçilir (`select()`).
- **Klavye Tuşları:**
  - `ArrowDown` / `ArrowUp`: Kolonlar listesinde dikey gezinme (seçili öğe otomatik `scrollIntoView` ile görünür kılınır).
  - `Enter` / `Space`: Seçili kolonun görünürlüğünü aç/kapat (Checkbox toggle).
  - `P` / `p`: Seçili kolonu sola sabitle / sabitlemeyi kaldır (Pin/Unpin toggle).
  - `Escape`: Arama doluysa aramayı temizler; arama boşsa menüyü kapatır.
- **Cascading Render Önleme:** Menü açık/kapalı durumu değiştiğinde `useEffect` içinde senkron `setState` çağrılmamalıdır (`react/set-state-in-effect` kuralı). State temizliği ve odak yönetimi doğrudan `onOpenChange` ve `onOpenAutoFocus` callback'leri içinde yürütülür.
- **Çift Görevli Dinamik Slot (Morphing Slot):**
  - Kolon listesindeki sağ slot varsayılanda veri tipi rozetini (`ColumnTypeBadge`) gösterir.
  - Satır üzerine hover yapıldığında veya klavye ile odaklanıldığında rozet pürüzsüzce kaybolarak yerini **Pin / Unpin** butonuna bırakır.

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

Bu bileşen üzerinde herhangi bir kod değişikliği yapıldığında aşağıdaki adımlarla doğrulayın:
1. `npm run typecheck` (tsc): Sıfır hata vermeli.
2. `npm run lint` (oxlint): Sıfır hata vermeli.
3. **Manuel Kontrol:**
   - Kolon ayırıcıya basıldığında sürüklemenin tetiklenmediğini doğrulayın.
   - Kolon ayırıcıya çift tıklandığında kolonun içeriğe tam sığdığını doğrulayın.
   - Kolon menüsünden bir kolon sabitlendiğinde (Pin) listenin soluna geçtiğini ve ayracın altına yerleştiğini doğrulayın.
   - Tablo yatay kaydırıldığında sabit kolonların yerinde kaldığını ve son sabit kolonun sağında derinlik gölgesinin belirdiğini doğrulayın.
   - Sayfa yenilendiğinde (F5) kolon sırası, genişliği, gizliliği ve sabitlemelerin korunduğunu doğrulayın.
