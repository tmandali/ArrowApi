---
id: "prop_workflow_recipe_mudv7jq7"
title: "Perakende satış raporunda standart mağaza analizi"
category: "workflow_recipe"
scope: "workspace"
status: "approved"
targetPath: "/stock/retail-sales-report"
author: "Yula AI (Learned)"
proposedBy: "Yula AI (Learned)"
reviewedBy: "Admin"
---
Perakende Satış Raporu ekranında kullanıcı “analiz et” dediğinde:
1. Veriyi Depo bazında grupla ve grid görünümünü Depo gruplu olacak şekilde düzenle.
2. Her Depo için Tutar ve Miktar toplamlarını Islem kırılımında Satış, İade ve Net olarak göster.
3. Net Tutar = Satış Tutarı − İade Tutarı; Net Miktar = Satış Miktarı − İade Miktarı.
4. En yüksek 5 mağaza cirosunu Net Tutar’a göre sırala; bu sıralamada T999 deposunu hariç tut.
5. Sonuç özetinde “En yüksek 5 mağaza cirosu (T999 hariç)” ve “Lider mağazalar” başlıklarını kullan; lider mağazalarda Net Tutar ve Net Miktar’ı belirt.
6. T999, yalnızca ilk 5 mağaza sıralamasından hariç tutulur; diğer toplam ve detay görünümlerinde aksi belirtilmedikçe korunur.
