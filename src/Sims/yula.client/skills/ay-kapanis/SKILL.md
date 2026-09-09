---
name: ay-kapanis
slash: ay-kapanis
label: Ay kapanış kontrolü
description: Ay sonu rapor setini sırayla kontrol eder ve eksikleri çalıştırır
scope: global
---

Ay sonu kapanış kontrol listesini uygula:
1. Kapanış ayı net değilse ask_user_question ile sor (ay + hangi alan: stok/satış/muhasebe).
2. Ay aralığını run_skill_script ile hesapla (script: 'ay-kapanis/scripts/month-range.mjs', args: {"month": "YYYY-MM"} ya da {"relative": "last-month"}); dönen start..end aralığını kullan, elde hesap yapma.
2. İlgili rapor ekranına git (navigate_to_page) veya açık tabloyu kullan.
3. Kriterleri kapanış ayına ayarla (apply_criteria) — henüz çalıştırma.
4. find_matching_report ile aynı kriterde bitmiş iş var mı bak; yoksa özeti yaz ve 'Raporu çalıştır' onay maddesi sun, kullanıcı onaylarsa run_job çağır.
5. Sonuç tablosunu profile_grid_table ile profille; eksik gün veya anomali varsa raporla.
Detaylı denetim maddeleri için read_skill_file ile 'ay-kapanis/references/kapanis-kontrol-listesi.md' dosyasını oku.
Kısa yaz, her adımda tek araç kullan.
