#!/usr/bin/env node
/**
 * Ay / hafta aralıklarını deterministik ISO tarihlerine çevirir.
 * Girdi (argv[2], JSON): { month?: "YYYY-MM", relative?: "last-month" | "this-month" | "last-week" | "this-week", today?: "YYYY-MM-DD" }
 * Çıktı (stdout, tek satır JSON): { status: "ok", start, end, range, label } | { status: "error", message }
 * Her zaman exit 0 — durum JSON içindedir (sandbox stdout'u korur).
 */

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function iso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseDay(s, field) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return { d, field };
}

function monthBounds(y, m) {
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: iso(start), end: iso(end) };
}

function out(obj) {
  console.log(JSON.stringify(obj));
}

function main() {
  let args = {};
  try {
    args = JSON.parse(process.argv[2] ?? "{}");
  } catch {
    out({ status: "error", message: "Argüman JSON ayrıştırılamadı." });
    return;
  }

  if (args.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(args.month);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
      out({ status: "error", message: "month 'YYYY-MM' biçiminde olmalı (örn: 2026-08)." });
      return;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const { start, end } = monthBounds(y, mo);
    out({ status: "ok", start, end, range: `${start}..${end}`, label: `${TR_MONTHS[mo - 1]} ${y}` });
    return;
  }

  if (args.relative) {
    const t = args.today ? parseDay(args.today, "today") : null;
    if (args.today && !t) {
      out({ status: "error", message: "today 'YYYY-MM-DD' biçiminde olmalı." });
      return;
    }
    const today = t ? t.d : new Date();
    const y = today.getFullYear();
    const mo = today.getMonth(); // 0-based
    let start;
    let end;
    let label;
    if (args.relative === "last-month") {
      const b = monthBounds(mo === 0 ? y - 1 : y, mo === 0 ? 12 : mo);
      start = b.start;
      end = b.end;
      label = `${TR_MONTHS[mo === 0 ? 11 : mo - 1]} ${mo === 0 ? y - 1 : y}`;
    } else if (args.relative === "this-month") {
      start = iso(new Date(y, mo, 1));
      end = iso(today);
      label = `${TR_MONTHS[mo]} ${y} (bugüne kadar)`;
    } else if (args.relative === "last-week" || args.relative === "this-week") {
      // Hafta Pazartesi başlar.
      const dow = (today.getDay() + 6) % 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - dow + (args.relative === "last-week" ? -7 : 0));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + (args.relative === "last-week" ? 6 : dow));
      start = iso(monday);
      end = iso(args.relative === "last-week" ? sunday : today);
      label = `${start}..${end} haftası`;
    } else {
      out({ status: "error", message: "relative 'last-month', 'this-month', 'last-week' ya da 'this-week' olmalı." });
      return;
    }
    out({ status: "ok", start, end, range: `${start}..${end}`, label });
    return;
  }

  out({ status: "error", message: "month ya da relative verilmedi." });
}

main();
