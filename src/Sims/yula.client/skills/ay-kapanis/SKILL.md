---
name: ay-kapanis
slash: ay-kapanis
label: Ay kapanış kontrolü
description: Ay sonu rapor setini sırayla kontrol eder ve eksikleri çalıştırır
scope: global
---

Ay sonu kapanış kontrol listesini uygula:
1. Kapanış ayı net değilse ask_user_question ile sor (ay + hangi alan: stok/satış/muhasebe).
2. Ay aralığını ISO takvimine göre belirle (örn. 2026-08 için start 2026-08-01, end 2026-08-31; "geçen ay" göreliyse içinde bulunulan aydan hesapla).
2. İlgili rapor ekranına git (navigate_to_page) veya açık tabloyu kullan.
3. Kriterleri kapanış ayına ayarla (apply_criteria) — henüz çalıştırma.
4. find_matching_report ile aynı kriterde bitmiş iş var mı bak; yoksa özeti yaz ve 'Raporu çalıştır' onay maddesi sun, kullanıcı onaylarsa run_job çağır.
5. Sonuç tablosunu profile_grid_table ile profille; eksik gün veya anomali varsa raporla.
Kısa yaz, her adımda tek araç kullan.
