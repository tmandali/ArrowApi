---
name: report_export_xlsx
description: Aktif raporun verisini XLSX veya CSV dosyasına aktarır ve indirme bağlantısı döndürür.
---

# Rapor Dışa Aktarma (XLSX/CSV)

## Ne zaman kullanılır
Kullanıcı açık olan raporu / tabloyu Excel'e veya CSV'ye aktarmak istediğinde
("raporu excel'e aktar", "dışa aktar", "indir").

## Nasıl çalışır
Bu skill **session verisi** kullanır: satırlar frontend'deki aktif DuckDB tablosundan
executor tarafından alınır ve skill'e beslenir. Skill yalnızca dosya üretir.

## Adımlar
1. `report_export_xlsx` aracını `format` parametresiyle çağır (varsayılan xlsx).
2. Kullanıcı biçim belirtmediyse xlsx kullan; sadece ham veri istiyorsa csv.
3. Sonuçtaki `file_name` bilgisini kullanıcıya Türkçe olarak bildir.
