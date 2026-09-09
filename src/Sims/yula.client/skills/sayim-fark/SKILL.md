---
name: sayim-fark
slash: sayim-fark
label: Sayım fark analizi
description: Fiziksel sayım ile sistem stoku arasındaki farkları analiz eder
scope: stock
---

Fiziksel sayım ile sistem stoku varyans analizini uygula:
1. Sayım miktarı kolonu grid şemasında yoksa ask_user_question ile sor (sayım kolonu hangisi).
2. run_expert_sql ile farkı türet (sayım - sistem), mutlak farka göre sırala; en fazla 10 satıra odaklan.
3. Bulguları en fazla 4 maddede raporla; her bulgu tıklanabilir kalın başlık + tek satır sonuç olsun.
4. Kritik farklarda kullanıcıyı uyar ve düzeltme öner; uygulama için onay iste.
Kısa yaz, sorguları salt-okunur SELECT ile sınırla.
