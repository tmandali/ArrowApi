# Ay Kapanış Kontrol Listesi (detay)

Bu dosya `ay-kapanis` skill'inin uzun referansıdır — skill gövdesine sığmayan
denetim maddeleri buradadır. Gerektiğinde `read_skill_file` ile okunur.

## 1. Eksik gün kontrolü

Kapanış ayında işlemsiz gün var mı (hafta sonu / resmi tatil ayrımıyla):

```sql
WITH gunler AS (
  SELECT (DATE '2026-08-01' + INTERVAL (d) DAY)::DATE AS gun
  FROM range(0, 31) AS t(d)
),
hareket AS (
  SELECT DISTINCT "hareketTarihi"::DATE AS gun
  FROM report_tablonuz
  WHERE "hareketTarihi" >= DATE '2026-08-01'
    AND "hareketTarihi" < DATE '2026-09-01'
)
SELECT g.gun, CASE WHEN h.gun IS NULL THEN 'EKSİK' ELSE 'var' END AS durum
FROM gunler g
LEFT JOIN hareket h ON h.gun = g.gun
ORDER BY g.gun;
```

Ayın gün sayısını (30/31/28-29) aralığa göre uyarlayın; tablo ve tarih
kolon adını gerçek şemadan alın, uydurmayın.

## 2. Hafta sonu uyarısı

Ayın son günü Cumartesi/Pazar ise kapanış fişleri Cuma'ya sarkabilir —
son 3 günün hareket sayısını ayrıca raporlayın.

## 3. Sıfır-hareketli kritik kolonlar

Tutarsız kapanışın sessiz belirtisi: `Toplam Ciro = 0` ama `Toplam Miktar <> 0`
(veya tersi) olan günler. Bunları `run_expert_sql` ile doğrulamadan
kapanışı onaylamayın.
