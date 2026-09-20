---
id: "recipe-stock-reconcile"
title: "Haftalık Stok Mutabakat ve Fire Analizi"
category: "workflow_recipe"
scope: "workspace"
targetPath: "/stock/stock-balance"
author: "Sistem Yöneticisi"
---
1. [open_balance] (action) Stok Bakiye Raporunu Aç -> navigate:/stock/stock-balance
2. [set_filters] (action) Depo ve Tarih Kriterlerini Belirle (dependsOn: open_balance) -> criteria_form:SET_FIELDS
3. [run_query] (action) Bakiye ve Hareket Sorgusunu Çalıştır (dependsOn: set_filters) -> dispatch_action:RUN_QUERY
4. [check_variance] (condition) Fire ve Fark Analizi Yap (dependsOn: run_query) -> inspect_grid:CHECK_VARIANCE
5. [manager_approval] (hitl) Yönetici Onayı Bekle (dependsOn: check_variance) -> hitl:CHOICE_CARD
6. [finalize_audit] (terminal) Sayım Fişini Onayla ve Tamamla (dependsOn: manager_approval) -> dispatch_action:FINALIZE
