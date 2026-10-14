'use client';

import { useState, useEffect } from 'react';
import { Users, UserPlus, Edit3, Trash2, Key, Phone, Shield, User, X, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface PersonnelManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function PersonnelManagementModal({
  isOpen,
  onClose,
  onRefresh
}: PersonnelManagementModalProps) {
  const [personnelList, setPersonnelList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingOriginalRole, setEditingOriginalRole] = useState<'ADMIN' | 'PERSONEL' | null>(null);

  // Form states
  const [adSoyad, setAdSoyad] = useState('');
  const [username, setUsername] = useState('');
  const [sifre, setSifre] = useState('');
  const [telefon, setTelefon] = useState('');
  const [rol, setRol] = useState<'ADMIN' | 'PERSONEL'>('PERSONEL');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchPersonnel = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/personnel');
      const data = await res.json();
      if (data.success) {
        setPersonnelList(data.users || []);
      }
    } catch (err) {
      console.error('Error fetching personnel:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPersonnel();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingOriginalRole(null);
    setAdSoyad('');
    setUsername('');
    setSifre('');
    setTelefon('');
    setRol('PERSONEL');
    setShowPassword(false);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleStartEdit = (person: any) => {
    setEditingId(person.id);
    setEditingOriginalRole(person.rol);
    setAdSoyad(person.ad_soyad);
    setUsername(person.username);
    setSifre(person.sifre);
    setTelefon(person.telefon || '');
    setRol(person.rol);
    setShowForm(true);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const url = '/api/personnel';
      const method = editingId ? 'PUT' : 'POST';
      const payload = {
        id: editingId || undefined,
        ad_soyad: adSoyad.trim(),
        username: username.trim().toLowerCase(),
        sifre: sifre.trim(),
        telefon: telefon.trim(),
        rol,
        callerRole: 'ADMIN'
      };

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'x-user-role': 'ADMIN'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'İşlem başarısız oldu');
      }

      setSuccessMsg(editingId ? 'Personel ve şifre güncellendi!' : 'Yeni personel eklendi!');
      fetchPersonnel();
      if (onRefresh) onRefresh();
      setTimeout(() => {
        resetForm();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`${name} isimli personeli silmek istediğinize emin misiniz?`)) return;

    try {
      const res = await fetch(`/api/personnel?id=${id}&callerRole=ADMIN`, { 
        method: 'DELETE',
        headers: { 'x-user-role': 'ADMIN' }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Silinemedi');
      }
      fetchPersonnel();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message || 'Silme işleminde hata oluştu');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet max-w-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Users className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Personel & Şifre Yönetimi</h3>
              <p className="text-xs text-slate-500">Saha personeli ekleme, düzenleme ve PIN belirleme</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
          >
            ✕
          </button>
        </div>

        {/* Action Bar */}
        {!showForm && (
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-slate-600">
              Kayıtlı Kullanıcılar ({personnelList.length})
            </span>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="btn-primary py-2 px-3 text-xs font-bold shadow-sm"
            >
              <UserPlus className="w-4 h-4 text-white" />
              <span>Yeni Personel Ekle</span>
            </button>
          </div>
        )}

        {/* Add / Edit Form */}
        {showForm && (
          <form onSubmit={handleSave} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 mb-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                {editingId ? <Edit3 className="w-4 h-4 text-amber-600" /> : <UserPlus className="w-4 h-4 text-emerald-600" />}
                {editingId ? 'Personel ve Şifre Düzenle' : 'Yeni Personel Kaydı'}
              </h4>
              <button
                type="button"
                onClick={resetForm}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕ Vazgeç
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-bold">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Adı Soyadı
                </label>
                <input
                  type="text"
                  value={adSoyad}
                  onChange={(e) => setAdSoyad(e.target.value)}
                  placeholder="Örn: Mehmet Yıldız"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Kullanıcı Adı (Giriş İçin)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="Örn: mehmet"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Şifre / PIN Kodu
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={sifre}
                    onChange={(e) => setSifre(e.target.value)}
                    placeholder="Örn: 1234"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 pr-8"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Telefon No (Opsiyonel)
                </label>
                <input
                  type="tel"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  placeholder="05xxxxxxxxx"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Yetki Rolü
                </label>
                {editingOriginalRole === 'ADMIN' && (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    🔒 Yönetici rolü düşürülemez
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={editingOriginalRole === 'ADMIN'}
                  onClick={() => setRol('PERSONEL')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    editingOriginalRole === 'ADMIN'
                      ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                      : rol === 'PERSONEL'
                      ? 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title={editingOriginalRole === 'ADMIN' ? 'Yönetici hesabı normal personele düşürülemez' : undefined}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Saha Personeli</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRol('ADMIN')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    rol === 'ADMIN'
                      ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Yönetici (Admin)</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary flex-1 py-2 text-xs font-bold"
              >
                {isSubmitting ? 'Kaydediliyor...' : editingId ? 'Değişiklikleri Kaydet' : 'Personeli Ekle'}
              </button>
            </div>
          </form>
        )}

        {/* Personnel List */}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">Personel listesi yükleniyor...</div>
          ) : (
            personnelList.map((person) => (
              <div
                key={person.id}
                className="p-3 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-slate-900 truncate">
                      {person.ad_soyad}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      person.rol === 'ADMIN'
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-sky-50 border-sky-300 text-sky-800'
                    }`}>
                      {person.rol === 'ADMIN' ? 'Yönetici' : 'Personel'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 font-medium">
                    <span className="font-mono text-slate-700">@{person.username}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-mono text-amber-800 font-bold bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                      <Key className="w-3 h-3 text-slate-400" />
                      PIN: {person.sifre}
                    </span>
                    {person.telefon && (
                      <>
                        <span>•</span>
                        <span className="truncate">{person.telefon}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleStartEdit(person)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    title="Düzenle / Şifre Değiştir"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(person.id, person.ad_soyad)}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                    title="Personeli Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-4 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary w-full">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
