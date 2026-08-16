import React, { useEffect, useState } from 'react';
import { useReportContext } from '../../context/ReportContext';
import { Sparkles, Calendar, MapPin, Search, RefreshCw, CheckCircle2, TrendingUp, DollarSign, Package } from 'lucide-react';

export const ReportView: React.FC = () => {
  const {
    date_range,
    city,
    shouldTriggerFetch,
    lastUpdatedByAI,
    aiTimestamp,
    setDateRange,
    setCity,
    resetTrigger,
  } = useReportContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<any[]>([]);

  // Filtreler veya AI tetiklemesi geldiğinde veriyi yeniden yükleme
  useEffect(() => {
    if (shouldTriggerFetch) {
      setLoading(true);

      // Simüle edilmiş sorgu gecikmesi (WASM DuckDB / API çağrısı gibi)
      const timer = setTimeout(() => {
        const mockRows = [
          { id: 101, product: 'Endüstriyel Vana A-12', category: 'Mekanik', city, amount: '₺142,500', stock: 45, date: date_range.split(' - ')[0] || '2026-08-01' },
          { id: 102, product: 'Hidrolik Pompa H-400', category: 'Hidrolik', city, amount: '₺288,000', stock: 18, date: date_range.split(' - ')[0] || '2026-08-05' },
          { id: 103, product: 'Basınç Sensörü S-80', category: 'Otomasyon', city, amount: '₺94,200', stock: 120, date: date_range.split(' - ')[0] || '2026-08-10' },
          { id: 104, product: 'Rulman Yatağı R-22', category: 'Mekanik', city, amount: '₺63,400', stock: 84, date: date_range.split(' - ')[0] || '2026-08-14' },
        ];
        setData(mockRows);
        setLoading(false);
        resetTrigger();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [shouldTriggerFetch, city, date_range, resetTrigger]);

  // İlk açılışta verileri yükle
  useEffect(() => {
    setData([
      { id: 101, product: 'Endüstriyel Vana A-12', category: 'Mekanik', city, amount: '₺142,500', stock: 45, date: '2026-08-01' },
      { id: 102, product: 'Hidrolik Pompa H-400', category: 'Hidrolik', city, amount: '₺288,000', stock: 18, date: '2026-08-05' },
    ]);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Üst Başlık ve AI Bildirimi */}
      <div className="p-6 border-b border-slate-800/80 bg-slate-900/40">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Stok & Satış Analiz Raporu</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Yula masaüstü motoru & Python AI Sidecar etkileşimli çalışma alanı.
            </p>
          </div>

          {lastUpdatedByAI && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs shadow-inner animate-pulse">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="font-medium">AI Tool Calling ile güncellendi</span>
                <span className="text-emerald-400/70 ml-1.5">({aiTimestamp})</span>
              </div>
            </div>
          )}
        </div>

        {/* Filtre Çubuğu */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-lg">
          {/* Şehir Seçimi */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-400" />
              Şehir (city)
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Tarih Aralığı */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Tarih Aralığı (date_range)
            </label>
            <input
              type="text"
              value={date_range}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Manuel Sorgula Butonu */}
          <div className="flex items-end">
            <button
              onClick={() => {
                const event = new Event('submit');
                // tetikle
                setLoading(true);
                setTimeout(() => setLoading(false), 400);
              }}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors shadow-md shadow-indigo-950"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>Sorgula</span>
            </button>
          </div>
        </div>
      </div>

      {/* Rapor İçeriği ve Tablo */}
      <div className="p-6 space-y-6 flex-1">
        {/* İstatistik Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase">Toplam Ciro</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white">₺588,100</div>
            <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> %14 artış ({city})
            </div>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase">Aktif Ürün Adedi</span>
              <Package className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white">{data.length} Kalem</div>
            <div className="text-xs text-slate-400 mt-1">
              Filtre: {date_range}
            </div>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium uppercase">AI Ajanı Durumu</span>
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-sm font-semibold text-white">Filtre & Tool Senkron</div>
            <div className="text-xs text-indigo-400 mt-1">
              Otomatik senkronize çalışıyor
            </div>
          </div>
        </div>

        {/* Veri Tablosu */}
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
            <h3 className="text-sm font-semibold text-slate-200">Sonuç Listesi ({city})</h3>
            {loading && <span className="text-xs text-indigo-400 animate-pulse">Veriler yükleniyor...</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Ürün Adı</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Bölge / Şehir</th>
                  <th className="px-4 py-3">Stok</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">#{row.id}</td>
                    <td className="px-4 py-3 font-medium text-white">{row.product}</td>
                    <td className="px-4 py-3 text-slate-400">{row.category}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-indigo-300 border border-slate-700">
                        {row.city}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{row.stock} adet</td>
                    <td className="px-4 py-3 font-semibold text-right text-emerald-400">{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
