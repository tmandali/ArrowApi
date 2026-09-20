---
id: "recipe-purchasing-flow"
title: "Satınalma Siparişi ve Mal Kabul İş Akışı"
category: "workflow_recipe"
scope: "workspace"
targetPath: "/stock/stock-balance"
author: "Sistem Yöneticisi"
---
1. [open_order] (action) Satınalma Siparişi ve Talep Girişi -> navigate:/stock/stock-balance
2. [manager_approval] (hitl) Yönetici Onayı ve Bütçe Kontrolü (dependsOn: open_order) -> hitl:CHOICE_CARD
3. [goods_receipt] (action) Depo Mal Kabul ve İrsaliye Eşleme (dependsOn: manager_approval) -> criteria_form:SET_FIELDS
4. [verify_balance] (action) Stok Bakiye Artışını Doğrula (dependsOn: goods_receipt) -> dispatch_action:RUN_QUERY
5. [finalize_invoice] (terminal) Fatura Eşleme ve Muhasebeleştirme (dependsOn: verify_balance) -> dispatch_action:FINALIZE
