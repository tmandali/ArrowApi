-- user_settings SEED backfill: ayar satırı OLMAYAN mevcut user_identities
-- kayıtlarına login'de açılan seed'in aynısı tablo kaydı açılır.
--
-- Yeni login'lerde bu seed otomatik olur (`ensureSettingsForIdentity` —
-- her sayfa yüklemesindeki ensure-user akışı); bu migration YALNIZCA
-- geriye dönük: daha önce giriş yapıp ayar kaydı oluşmamış kimlikleri
-- (ör. eski local DB'deki Google satırı) aynı başlangıç durumuna taşır:
-- - language: identity'nin ilk kayıt Accept-Language snapshot'ı (yoksa NULL →
--   locale zinciri: settings > identity > Accept-Language > en devreye girer)
-- - time_zone: locale form varsayılanlarıyla aynı (en → Asia/Kolkata,
--   aksi halde Europe/Istanbul)
--
-- Var olan ayar satırları ASLA dokunulmaz (NOT EXISTS + ON CONFLICT DO NOTHING).

INSERT INTO "user_settings" ("user_id", "language", "time_zone", "system_facts", "created_at", "updated_at")
SELECT
  i."id",
  i."language",
  CASE WHEN i."language" = 'en' THEN 'Asia/Kolkata' ELSE 'Europe/Istanbul' END,
  '{}'::jsonb,
  now(),
  now()
FROM "user_identities" i
WHERE NOT EXISTS (
  SELECT 1 FROM "user_settings" s WHERE s."user_id" = i."id"
)
ON CONFLICT ("user_id") DO NOTHING;
