# Playbook Kataloğu (STOCK)

> Bu dosya Yula AI Playbook motoru tarafından otomatik güncellenir.

| Tür | Başlık | Hedef Ekran | Dosya | Özet |
| :--- | :--- | :--- | :--- | :--- |
| `screen_rule` | **Perakende satış raporunda varsayılan tarih ve şirket** | `/stock/retail-sales-report` | [pb_screen_rule_mud3biw8.md](screens/pb_screen_rule_mud3biw8.md) | Perakende Satış Raporu ekranı açıldığında Hareket Tarihi alanı, ekran açılış gününe göre dinamik ola |
| `workflow_recipe` | **Satınalma Siparişi ve Mal Kabul İş Akışı** | `/stock/stock-balance` | [recipe-purchasing-flow.md](workflows/recipe-purchasing-flow.md) | 1. [openorder] (action) Satınalma Siparişi ve Talep Girişi -> navigate:/stock/stock-balance |
| `workflow_recipe` | **Haftalık Stok Mutabakat ve Fire Analizi** | `/stock/stock-balance` | [recipe-stock-reconcile.md](workflows/recipe-stock-reconcile.md) | 1. [openbalance] (action) Stok Bakiye Raporunu Aç -> navigate:/stock/stock-balance |
| `workflow_recipe` | **Perakende satış raporunda standart mağaza analizi** | `/stock/retail-sales-report` | [prop_workflow_recipe_mudv7jq7.md](workflows/prop_workflow_recipe_mudv7jq7.md) | Perakende Satış Raporu ekranında kullanıcı “analiz et” dediğinde: |
