---
name: rapor-kalite
slash: rapor-kalite
label: Rapor kalite turu
description: Açık tabloyu profiller, anomalileri doğrular ve raporlar
scope: global
---

Açık tablo veri kalite turunu uygula:
1. profile_grid_table çağır (null sayıları, min/max, kardinalite, tek-değerli kolonlar).
2. Sınır bulguları run_expert_sql ile doğrula; doğrulanmayanı raporlama.
3. En fazla 4 bulgu; her biri tıklanabilir kalın başlık + tek satır sonuç olsun.
4. Bulgular için tek-satır özetlerde markdown kullan, SQL metnini cevaba yapıştırma.
Kısa yaz, her adımda tek araç kullan.
