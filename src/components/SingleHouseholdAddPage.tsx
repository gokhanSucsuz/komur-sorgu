'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Search,
  MapPin,
  Phone,
  Home,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Navigation,
  Building2,
  Hash,
  FileText,
  PackageCheck,
  PenTool,
  Loader2,
  ArrowRight,
  RotateCcw,
  Users,
  Info,
  Sparkles,
  Ban,
  Flame,
} from 'lucide-react';
import { showAlert, showToast } from './GlobalAlertManager';
import {
  cleanTcNo,
  isValidTcNo,
  normalizeAddress,
  detectSettlement,
  extractStreetAndDoor,
  normalizeMahalleName,
  normalizeStreetForCompare,
  getRecordStreetInfo,
  cleanHaneNo,
  cleanHaneKey,
  formatDeliveryStatusSummary,
  formatPhoneDisplay,
} from '@/lib/normalizer';

interface SingleHouseholdAddPageProps {
  records: any[];
  mahalleler: any[];
  userRole: 'ADMIN' | 'PERSONEL';
  userName: string;
  defaultQuota?: number;
  initialTcOrName?: string;
  onClearInitialQuery?: () => void;
  onSuccess: (createdBeneficiary: any) => void;
  onOpenDelivery?: (person: any) => void;
  onNavigateToSearch?: (query?: string) => void;
}

export default function SingleHouseholdAddPage({
  records = [],
  mahalleler = [],
  userRole,
  userName,
  defaultQuota = 34,
  initialTcOrName = '',
  onClearInitialQuery,
  onSuccess,
  onOpenDelivery,
  onNavigateToSearch,
}: SingleHouseholdAddPageProps) {
  // Form Alanları
  const [tcNo, setTcNo] = useState<string>('');
  const [adSoyad, setAdSoyad] = useState<string>('');
  const [mahalle, setMahalle] = useState<string>('');
  const [sokak, setSokak] = useState<string>('');
  const [kapiNo, setKapiNo] = useState<string>('');
  const [daireNo, setDaireNo] = useState<string>('');
  const [acikAdres, setAcikAdres] = useState<string>('');
  const [telefon1, setTelefon1] = useState<string>('');
  const [telefon2, setTelefon2] = useState<string>('');
  const [haneNo, setHaneNo] = useState<string>('');
  const [hedefTorba, setHedefTorba] = useState<string>(String(defaultQuota || 34));
  const [listeTuru, setListeTuru] = useState<'EK_LISTE' | 'ANA_LISTE' | 'SIGORTALI'>('EK_LISTE');
  const [imzaAlindi, setImzaAlindi] = useState<boolean>(false);
  const [eklemeNotu, setEklemeNotu] = useState<string>('');

  // Aynı Adres Uyarı Onayı
  const [confirmSameAddress, setConfirmSameAddress] = useState<boolean>(false);

  // Sunucu Tarafı Canlı Ön Kontrol Durumu
  const [serverDuplicateTc, setServerDuplicateTc] = useState<any | null>(null);
  const [serverDuplicateHane, setServerDuplicateHane] = useState<any | null>(null);
  const [serverSameAddressList, setServerSameAddressList] = useState<any[]>([]);
  const [isCheckingServer, setIsCheckingServer] = useState<boolean>(false);

  // Gönderim ve Sonuç Durumu
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAddedRecord, setLastAddedRecord] = useState<any | null>(null);
  const [sessionAddedRecords, setSessionAddedRecords] = useState<any[]>([]);

  // Sorgu ekranından yönlendirildiyse TC veya Ad Soyad ön doldurma
  useEffect(() => {
    if (!initialTcOrName || !initialTcOrName.trim()) return;
    const raw = initialTcOrName.trim();
    const digitsOnly = cleanTcNo(raw);
    if (digitsOnly.length >= 7 && /^\d+$/.test(raw.replace(/\s+/g, ''))) {
      setTcNo(digitsOnly.slice(0, 11));
    } else {
      setAdSoyad(raw);
    }
    if (onClearInitialQuery) {
      onClearInitialQuery();
    }
  }, [initialTcOrName, onClearInitialQuery]);

  // Varsayılan kota değiştiğinde güncelle
  useEffect(() => {
    if (defaultQuota && (!hedefTorba || hedefTorba === '34')) {
      setHedefTorba(String(defaultQuota));
    }
  }, [defaultQuota]);

  const cleanedTc = useMemo(() => cleanTcNo(tcNo), [tcNo]);
  const isTcComplete = cleanedTc.length === 11;
  const isTcChecksumValid = useMemo(
    () => (isTcComplete ? isValidTcNo(cleanedTc) : false),
    [isTcComplete, cleanedTc]
  );

  // ========================================================
  // 1. ANLIK (0ms) BELLEK İÇİ T.C. KİMLİK NO KONTROLÜ (KESİN ENGEL)
  // ========================================================
  const localDuplicateTcRecord = useMemo(() => {
    if (!cleanedTc || cleanedTc.length !== 11) return null;
    const found = records.find((r) => cleanTcNo(r.tc_no) === cleanedTc);
    if (!found) return null;
    return {
      ...found,
      durum_ozeti: formatDeliveryStatusSummary(found),
    };
  }, [records, cleanedTc]);

  const activeDuplicateTc = localDuplicateTcRecord || serverDuplicateTc;

  // ========================================================
  // 2. ANLIK (0ms) BELLEK İÇİ HANE NO KONTROLÜ (KESİN ENGEL)
  // ========================================================
  const localDuplicateHaneRecord = useMemo(() => {
    const cleanKey = cleanHaneKey(haneNo);
    if (!cleanKey) return null;
    const found = records.find((r) => r.hane_no && cleanHaneKey(r.hane_no) === cleanKey);
    if (!found) return null;
    return {
      ...found,
      durum_ozeti: formatDeliveryStatusSummary(found),
    };
  }, [records, haneNo]);

  const activeDuplicateHane = localDuplicateHaneRecord || serverDuplicateHane;

  // ========================================================
  // 3. ANLIK (0ms) BELLEK İÇİ AYNI ADRES TESPİTİ (UYARI VERİR, EKLENEBİLİR)
  // ========================================================
  const localSameAddressRecords = useMemo(() => {
    const rawMah = mahalle.trim();
    const rawSok = sokak.trim();
    const rawKapi = kapiNo.trim();
    const rawAcik = acikAdres.trim();

    let compositeAddr = rawAcik;
    if (!compositeAddr && (rawSok || rawKapi)) {
      compositeAddr = [
        rawSok,
        rawKapi ? `No: ${rawKapi}` : '',
        daireNo.trim() ? `Daire: ${daireNo.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }

    if (!rawMah && compositeAddr.length < 5) return [];

    const settlement = detectSettlement(rawMah, '', compositeAddr);
    const streetInfo = extractStreetAndDoor(compositeAddr, rawSok, rawKapi, settlement.name);
    const normAdres = normalizeAddress(settlement.name, compositeAddr);
    const normMahalleTarget = normalizeMahalleName(settlement.name) || settlement.name;

    const targetStreetNorm =
      streetInfo.sokak && streetInfo.sokak !== 'Belirtilmemiş'
        ? normalizeStreetForCompare(streetInfo.sokak)
        : '';
    const targetDoorNum =
      streetInfo.kapiNo && streetInfo.kapiNo !== 999999 ? Number(streetInfo.kapiNo) : null;

    if (normAdres.length < 5 && (!targetStreetNorm || targetDoorNum === null)) {
      return [];
    }

    const matches: any[] = [];
    for (const r of records) {
      if (cleanedTc && cleanTcNo(r.tc_no) === cleanedTc) continue;

      const candPhysicalNorm = normalizeAddress(r.mahalle || '', r.acik_adres || '');
      const isExactNormMatch =
        normAdres.length >= 5 &&
        (r.norm_adres === normAdres ||
          (candPhysicalNorm.length >= 5 && candPhysicalNorm === normAdres));

      let isSameStreetAndDoor = false;
      if (targetStreetNorm && targetDoorNum !== null) {
        const candMahalleNorm = normalizeMahalleName(r.mahalle || '') || r.mahalle || '';
        if (candMahalleNorm.toLocaleLowerCase('tr-TR') === normMahalleTarget.toLocaleLowerCase('tr-TR')) {
          const candSt = getRecordStreetInfo(r);
          const candStreetNorm =
            candSt.sokak && candSt.sokak !== 'Belirtilmemiş'
              ? normalizeStreetForCompare(candSt.sokak)
              : '';
          const candDoorNum =
            candSt.kapiNo && candSt.kapiNo !== 999999 ? Number(candSt.kapiNo) : null;

          if (
            candStreetNorm &&
            candStreetNorm === targetStreetNorm &&
            candDoorNum !== null &&
            candDoorNum === targetDoorNum
          ) {
            isSameStreetAndDoor = true;
          }
        }
      }

      if (isExactNormMatch || isSameStreetAndDoor) {
        matches.push({
          ...r,
          durum_ozeti: formatDeliveryStatusSummary(r),
          eslesme_tipi: isExactNormMatch ? 'TAM_ADRES' : 'AYNI_BINA_KAPI_NO',
        });
      }
    }

    return matches;
  }, [records, mahalle, sokak, kapiNo, daireNo, acikAdres, cleanedTc]);

  // Yerel ve sunucu aynı adres kayıtlarını birleştir (tekilleştirerek)
  const activeSameAddressRecords = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of localSameAddressRecords) {
      const key = String(item.id || item.tc_no || Math.random());
      map.set(key, item);
    }
    for (const item of serverSameAddressList) {
      const key = String(item.id || item.tc_no || Math.random());
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  }, [localSameAddressRecords, serverSameAddressList]);

  // Adres değiştiğinde onay kutusunu sıfırla ki personel yeni adresteki uyarıyı görsün
  useEffect(() => {
    setConfirmSameAddress(false);
  }, [mahalle, sokak, kapiNo, acikAdres]);

  // ========================================================
  // 4. SUNUCU TARAFI CANLI ÖN KONTROL (DEBOUNCED)
  // ========================================================
  useEffect(() => {
    const has11Tc = cleanedTc.length === 11;
    const hasAddressInput =
      mahalle.trim().length > 0 &&
      (acikAdres.trim().length >= 4 || (sokak.trim().length >= 2 && kapiNo.trim().length >= 1));
    const hasHaneInput = cleanHaneKey(haneNo).length > 0;

    if (!has11Tc && !hasAddressInput && !hasHaneInput) {
      setServerDuplicateTc(null);
      setServerDuplicateHane(null);
      setServerSameAddressList([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingServer(true);
      try {
        const res = await fetch('/api/beneficiaries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            check_only: true,
            tc_no: cleanedTc,
            mahalle: mahalle.trim(),
            sokak: sokak.trim(),
            kapi_no: kapiNo.trim(),
            daire_no: daireNo.trim(),
            acik_adres: acikAdres.trim(),
            hane_no: haneNo.trim(),
          }),
        });
        const data = await res.json();
        if (data.duplicate_tc && data.existing_record) {
          setServerDuplicateTc(data.existing_record);
        } else {
          setServerDuplicateTc(null);
        }

        if (data.duplicate_hane && data.existing_record) {
          setServerDuplicateHane(data.existing_record);
        } else {
          setServerDuplicateHane(null);
        }

        if (Array.isArray(data.same_address_records)) {
          setServerSameAddressList(data.same_address_records);
        } else {
          setServerSameAddressList([]);
        }
      } catch {
        // Çevrimdışı veya ağ gecikmesinde yerel bellek kontrolü devrededir
      } finally {
        setIsCheckingServer(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [cleanedTc, mahalle, sokak, kapiNo, daireNo, acikAdres, haneNo]);

  // Seçili mahalledeki mevcut sokakların otomatik tamamlama listesi
  const availableStreetsInMahalle = useMemo(() => {
    if (!mahalle.trim()) return [];
    const normM = normalizeMahalleName(mahalle) || mahalle.trim();
    const streetSet = new Set<string>();
    for (const r of records) {
      const rMah = normalizeMahalleName(r.mahalle || '') || r.mahalle || '';
      if (rMah.toLocaleLowerCase('tr-TR') === normM.toLocaleLowerCase('tr-TR')) {
        const st = getRecordStreetInfo(r);
        if (st.sokak && st.sokak !== 'Belirtilmemiş') {
          streetSet.add(st.sokak);
        }
      }
    }
    return Array.from(streetSet).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [records, mahalle]);

  // Mahalle seçenekleri (Kayıtlardan + sistem listesinden + Edirne standart mahallelerinden)
  const mahalleOptions = useMemo(() => {
    const set = new Set<string>();
    mahalleler.forEach((m: any) => {
      const name = typeof m === 'string' ? m : m?.mahalle;
      if (name) set.add(name);
    });
    records.forEach((r: any) => {
      if (r?.mahalle) set.add(r.mahalle);
    });
    const defaults = [
      'Abdurrahman Mah.',
      'Babademirtaş Mah.',
      'Barutluk Mah.',
      'Cumhuriyet Mah.',
      'Çavuşbey Mah.',
      'Dilaverbey Mah.',
      'Fatih Mah.',
      'İstasyon Mah.',
      'Karaağaç Mah.',
      'Koca Sinan Mah.',
      'Medrese Ali Bey Mah.',
      'Menzilahır Mah.',
      'Meydan Mah.',
      'Mithat Paşa Mah.',
      'Nişancıpaşa Mah.',
      'Sabuni Mah.',
      'Sarıcapaşa Mah.',
      'Şükrüpaşa Mah.',
      'Talatpaşa Mah.',
      'Umurbey Mah.',
      'Yancıkçı Şahin Mah.',
      'Yeniimaret Mah.',
      'Yıldırım Beyazıt Mah.',
      'Yıldırım Hacı Sarraf Mah.',
      '1. Murat Mah.',
      '100. Yıl Mah.',
    ];
    defaults.forEach((d) => set.add(d));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [mahalleler, records]);

  // Sokak + Kapı No + Daire No girildiğinde Açık Adres boşsa otomatik oluşturma yardımcısı
  const buildEffectiveAcikAdres = useCallback(() => {
    if (acikAdres.trim()) return acikAdres.trim();
    const parts: string[] = [];
    if (mahalle.trim()) parts.push(mahalle.trim());
    if (sokak.trim()) parts.push(sokak.trim());
    if (kapiNo.trim()) parts.push(`No: ${kapiNo.trim()}`);
    if (daireNo.trim()) parts.push(`Daire: ${daireNo.trim()}`);
    return parts.join(' ');
  }, [acikAdres, mahalle, sokak, kapiNo, daireNo]);

  const handleResetForm = () => {
    setTcNo('');
    setAdSoyad('');
    setSokak('');
    setKapiNo('');
    setDaireNo('');
    setAcikAdres('');
    setTelefon1('');
    setTelefon2('');
    setHaneNo('');
    setImzaAlindi(false);
    setEklemeNotu('');
    setConfirmSameAddress(false);
    setErrorMessage(null);
    setServerDuplicateTc(null);
    setServerDuplicateHane(null);
    setServerSameAddressList([]);
    // Mahalle seçimini sahada aynı mahallede arka arkaya ekleme kolaylığı için koruyoruz
  };

  const handleSubmit = async (e: React.FormEvent, forceConfirmAddress: boolean = false) => {
    e.preventDefault();
    setErrorMessage(null);

    // KURAL 1: T.C. Kimlik No Kontrolü (11 Hane + Sistemde Kayıtlıysa Kesin Engel)
    if (!cleanedTc || cleanedTc.length !== 11) {
      setErrorMessage('Lütfen 11 haneli geçerli bir T.C. Kimlik Numarası giriniz.');
      return;
    }

    if (activeDuplicateTc) {
      const msg = `Bu T.C. Kimlik Numarası (${cleanedTc}) sistemde "${activeDuplicateTc.ad_soyad}" adına zaten kayıtlıdır! Sistemde kaydı bulunan TC Kimlik Numarası tekrar eklenemez.`;
      setErrorMessage(msg);
      showAlert({
        type: 'error',
        title: 'Kayıtlı T.C. Kimlik Numarası!',
        message: msg,
      });
      return;
    }

    if (activeDuplicateHane) {
      const msg = `Girilen Hane Numarası (${haneNo}) sistemde "${activeDuplicateHane.ad_soyad}" adına zaten kayıtlıdır!`;
      setErrorMessage(msg);
      showAlert({
        type: 'error',
        title: 'Kayıtlı Hane Numarası!',
        message: msg,
      });
      return;
    }

    if (!adSoyad.trim()) {
      setErrorMessage('Lütfen hak sahibinin Ad Soyad bilgisini giriniz.');
      return;
    }

    if (!mahalle.trim()) {
      setErrorMessage('Lütfen Mahalle veya Köy bilgisini seçiniz.');
      return;
    }

    const effectiveAddress = buildEffectiveAcikAdres();
    if (!effectiveAddress || (!acikAdres.trim() && !sokak.trim())) {
      setErrorMessage('Lütfen Açık Adres veya Sokak/Cadde ve Kapı No bilgisini giriniz.');
      return;
    }

    // KURAL 2: Aynı Adreste Başka Hane Varsa Uyarı Ver, Onayla Eklenebilir
    const isAddressConfirmed = confirmSameAddress || forceConfirmAddress;
    if (activeSameAddressRecords.length > 0 && !isAddressConfirmed) {
      setErrorMessage(
        `Dikkat: Bu adreste kayıtlı ${activeSameAddressRecords.length} başka hane bulunmaktadır. Durumu uygun ise lütfen aşağıdaki sarı uyarı kutusundan onaylayarak ekleyiniz.`
      );
      showToast({
        type: 'warning',
        title: 'Aynı Adreste Başka Hane Var!',
        message: 'Eklemek için lütfen aynı adres uyarısını onaylayın.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tc_no: cleanedTc,
          ad_soyad: adSoyad.trim(),
          mahalle: mahalle.trim(),
          sokak: sokak.trim(),
          kapi_no: kapiNo.trim(),
          daire_no: daireNo.trim(),
          acik_adres: effectiveAddress,
          telefon: telefon1.trim(),
          telefon2: telefon2.trim(),
          hane_no: haneNo.trim(),
          hedef_torba: parseInt(hedefTorba || String(defaultQuota), 10) || defaultQuota,
          liste_turu: listeTuru,
          imza_alindi: imzaAlindi,
          ekleme_notu: eklemeNotu.trim(),
          personel: userName,
          confirm_same_address: isAddressConfirmed,
        }),
      });

      const data = await res.json();

      // Sunucu tarafında TC mükerrerliği yakalandıysa
      if (data.duplicate_tc) {
        if (data.existing_record) {
          setServerDuplicateTc(data.existing_record);
        }
        setErrorMessage(data.error || 'Bu T.C. Kimlik Numarası sistemde zaten kayıtlıdır!');
        showAlert({
          type: 'error',
          title: 'T.C. Kimlik No Sistemde Kayıtlı!',
          message: data.error || 'Bu T.C. Kimlik Numarası sistemde zaten kayıtlı olduğu için eklenemez.',
        });
        return;
      }

      // Sunucu tarafında aynı adreste başka hane tespit edildiyse ve henüz onaylanmadıysa
      if (data.requires_address_confirmation) {
        if (Array.isArray(data.same_address_records)) {
          setServerSameAddressList(data.same_address_records);
        }
        setErrorMessage(
          data.warning ||
            'Bu adreste kayıtlı başka hane(ler) bulundu. Durumu uygun ise uyarıyı onaylayarak ekleyebilirsiniz.'
        );
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Hane eklenirken bir hata oluştu');
      }

      const created = data.beneficiary;
      setLastAddedRecord(created);
      setSessionAddedRecords((prev) => [created, ...prev]);

      showToast({
        type: 'success',
        title: 'Hane Başarıyla Eklendi',
        message: `${created.ad_soyad} (${created.mahalle}) dağıtım listesine eklendi.`,
      });

      onSuccess(created);
      handleResetForm();
    } catch (err: any) {
      setErrorMessage(err.message || 'Kayıt işlemi sırasında bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickNotes = [
    'Sahada yerinde incelendi, durumu uygun',
    'Ayrı sobası ve ayrı yaşam alanı mevcut',
    'Müstakil/Gecekondu içi ayrı aile',
    'Yeni taşındı, fiili ikameti burası',
  ];

  return (
    <div className="space-y-4 pb-8">
      {/* ÜST BAŞLIK BANNERI */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-emerald-700/30 shadow-md text-white"
        style={{
          background: 'linear-gradient(135deg, #059669 0%, #0d9488 55%, #0f766e 100%)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0 shadow-inner">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Saha Tek Hane Kömür Ekleme
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 border border-white/30 text-white">
                  {userRole === 'ADMIN' ? 'Yönetici & Saha' : 'Saha Personeli Yetkisi'}
                </span>
              </div>
              <p className="text-xs text-emerald-50 font-medium mt-0.5 leading-relaxed">
                Sahada durumu uygun görülen haneleri anında sisteme ekleyebilirsiniz. Kayıtlı T.C. Kimlik No
                varsa sistem otomatik engeller; aynı adreste başka hane varsa uyarı verir ve onayınızla ekler.
              </p>
            </div>
          </div>

          {onNavigateToSearch && (
            <button
              type="button"
              onClick={() => onNavigateToSearch()}
              className="self-start sm:self-center px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-xs font-extrabold text-white flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Sorgu Listesine Dön</span>
            </button>
          )}
        </div>
      </div>

      {/* SON EKLENEN HANE BAŞARI VE HIZLI TESLİMAT KARTI */}
      {lastAddedRecord && (
        <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-400 p-4 shadow-sm animate-in fade-in space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-200 text-emerald-950">
                    Sisteme Eklendi
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-emerald-950">
                    {lastAddedRecord.ad_soyad}
                  </h3>
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
                    TC: {lastAddedRecord.tc_no}
                  </span>
                </div>
                <p className="text-xs text-emerald-900 font-semibold mt-1">
                  📍 {lastAddedRecord.mahalle} — {lastAddedRecord.acik_adres}
                </p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Sıra No: <strong>{lastAddedRecord.sira_no || lastAddedRecord.mahalle_sira}</strong> • Hedef Kota:{' '}
                  <strong>{lastAddedRecord.hedef_torba} Torba</strong> • İmza Durumu:{' '}
                  <strong>
                    {lastAddedRecord.imza_durumu === 'IMZALANDI'
                      ? '✅ Kapıda İmzalandı'
                      : '⏳ İmza Bekliyor'}
                  </strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLastAddedRecord(null)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-950 px-2 py-1"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-200/80">
            {onOpenDelivery && (
              <button
                type="button"
                onClick={() => onOpenDelivery(lastAddedRecord)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              >
                <Flame className="w-4 h-4" />
                <span>Hemen Kömür Teslimatı Yap</span>
              </button>
            )}
            {onNavigateToSearch && (
              <button
                type="button"
                onClick={() => onNavigateToSearch(lastAddedRecord.tc_no)}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Sorgu Ekranında Göster</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ANA FORM KARTI */}
      <form
        onSubmit={(e) => handleSubmit(e, false)}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5"
      >
        {/* BÖLÜM 1: KİMLİK VE KİŞİ BİLGİLERİ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-black text-slate-900">
                Hak Sahibi Kimlik ve İletişim Bilgileri
              </h3>
            </div>
            {isCheckingServer && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span>Sistem Kontrol Ediliyor...</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* T.C. KİMLİK NUMARASI */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                <span>T.C. Kimlik Numarası *</span>
                <span
                  className={`font-mono text-[11px] font-black px-2 py-0.5 rounded ${
                    activeDuplicateTc
                      ? 'bg-rose-100 text-rose-800'
                      : isTcComplete
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {cleanedTc.length} / 11 Hane
                </span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={tcNo}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                    setTcNo(val);
                    setErrorMessage(null);
                  }}
                  placeholder="11 haneli T.C. Kimlik No giriniz..."
                  className={`w-full px-3.5 py-3 rounded-xl border text-base font-mono font-black tracking-wider focus:outline-none focus:ring-2 transition-all ${
                    activeDuplicateTc
                      ? 'border-rose-500 bg-rose-50/60 text-rose-950 focus:ring-rose-500'
                      : isTcComplete
                      ? 'border-emerald-500 bg-emerald-50/30 text-slate-900 focus:ring-emerald-500'
                      : 'border-slate-300 bg-white text-slate-900 focus:ring-amber-500 focus:border-amber-500'
                  }`}
                  required
                />
              </div>

              {/* TC Sistemde Yoksa Yeşil Onay Rozeti */}
              {isTcComplete && !activeDuplicateTc && (
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Bu T.C. Kimlik No sistemde kayıtlı değil — Eklenebilir.</span>
                  </span>
                  {!isTcChecksumValid && (
                    <span className="text-amber-700 font-semibold text-[10px]">
                      (TC algoritma uyarısı)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* AD SOYAD */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                <span>Adı Soyadı *</span>
                <span className="text-[10px] font-semibold text-slate-400">
                  Kimlikteki Tam Ad Soyad
                </span>
              </label>
              <input
                type="text"
                value={adSoyad}
                onChange={(e) => {
                  setAdSoyad(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Örn: AHMET YILMAZ"
                className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm sm:text-base font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                required
              />
            </div>
          </div>

          {/* KURAL 1 UYARI KARTI: T.C. KİMLİK NO SİSTEMDE KAYITLIYSA (KESİN ENGEL) */}
          {activeDuplicateTc && (
            <div className="rounded-2xl bg-rose-50 border-2 border-rose-500 p-4 shadow-md space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-black uppercase tracking-wider">
                      MÜKERRER T.C. ENGELİ — SİSTEME EKLENEMEZ!
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-rose-950">
                    Bu T.C. Kimlik Numarası ({activeDuplicateTc.tc_no}) Sistemde Zaten Kayıtlı!
                  </h4>
                  <p className="text-xs text-rose-800 font-medium">
                    Sistemde kaydı bulunan bir T.C. Kimlik Numarası mükerrer kömür tahsisini önlemek amacıyla ikinci kez eklenemez.
                  </p>
                </div>
              </div>

              {/* Mevcut Kaydın Detay Kutusu */}
              <div className="rounded-xl bg-white border border-rose-200 p-3.5 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block">
                      Mevcut Kayıtlı Hak Sahibi:
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {activeDuplicateTc.ad_soyad}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg font-extrabold text-xs border ${
                      activeDuplicateTc.komur_verilmeyecek
                        ? 'bg-rose-100 text-rose-900 border-rose-300'
                        : activeDuplicateTc.teslimat_durumu === 'TAMAMLANDI'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : activeDuplicateTc.teslimat_durumu === 'EKSIK'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-sky-100 text-sky-900 border-sky-300'
                    }`}
                  >
                    {activeDuplicateTc.komur_verilmeyecek
                      ? `🚫 KÖMÜR VERİLMEYECEK (${activeDuplicateTc.komur_iptal_nedeni || 'İptal'})`
                      : activeDuplicateTc.durum_ozeti ||
                        formatDeliveryStatusSummary(activeDuplicateTc)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="font-bold text-slate-500">Mahalle / Köy: </span>
                    <strong className="text-slate-900">{activeDuplicateTc.mahalle || '-'}</strong>
                  </div>
                  {activeDuplicateTc.telefon && (
                    <div>
                      <span className="font-bold text-slate-500">Telefon: </span>
                      <strong className="text-slate-900 font-mono">
                        {formatPhoneDisplay(activeDuplicateTc.telefon)}
                      </strong>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <span className="font-bold text-slate-500">Kayıtlı Açık Adresi: </span>
                    <strong className="text-slate-900">{activeDuplicateTc.acik_adres || '-'}</strong>
                  </div>
                  {activeDuplicateTc.teslimat_tarihi && (
                    <div className="sm:col-span-2 text-emerald-900 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                      <strong>Teslimat Bilgisi:</strong> {activeDuplicateTc.torba_sayisi} Torba • Tarih:{' '}
                      {activeDuplicateTc.teslimat_tarihi} • Teslim Alan:{' '}
                      {activeDuplicateTc.teslim_alan || '-'} • Personel:{' '}
                      {activeDuplicateTc.teslim_eden_personel || '-'}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  {onNavigateToSearch && (
                    <button
                      type="button"
                      onClick={() => onNavigateToSearch(activeDuplicateTc.tc_no)}
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Mevcut Kaydı Sorguda Aç</span>
                    </button>
                  )}
                  {onOpenDelivery &&
                    !activeDuplicateTc.komur_verilmeyecek &&
                    activeDuplicateTc.teslimat_durumu !== 'TAMAMLANDI' && (
                      <button
                        type="button"
                        onClick={() => onOpenDelivery(activeDuplicateTc)}
                        className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Mevcut Kayda Kömür Teslim Et</span>
                      </button>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* TELEFON NUMARALARI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Telefon 1 (Cep Telefonu)</span>
              </label>
              <input
                type="tel"
                value={telefon1}
                onChange={(e) => setTelefon1(e.target.value)}
                placeholder="05XX XXX XX XX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-teal-600" />
                <span>Telefon 2 (Yedek / Eş / Yakını)</span>
              </label>
              <input
                type="tel"
                value={telefon2}
                onChange={(e) => setTelefon2(e.target.value)}
                placeholder="05XX XXX XX XX (İsteğe bağlı)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        {/* BÖLÜM 2: ADRES BİLGİLERİ VE AYNI ADRES KONTROLÜ */}
        <div className="space-y-4 pt-2 border-t border-slate-200/80">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center">
                2
              </span>
              <h3 className="text-sm font-black text-slate-900">
                İkametgah Adresi ve Aynı Adres Kontrolü
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              Aynı adreste başka hane varsa sistem uyarır
            </span>
          </div>

          {/* MAHALLE / KÖY SEÇİMİ */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Mahalle veya Köy *</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <select
                value={mahalleOptions.includes(mahalle) ? mahalle : ''}
                onChange={(e) => {
                  if (e.target.value) setMahalle(e.target.value);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">-- Listeden Hızlı Mahalle / Köy Seçin --</option>
                {mahalleOptions.map((mName) => (
                  <option key={mName} value={mName}>
                    {mName}
                  </option>
                ))}
              </select>

              <input
                type="text"
                list="tek-hane-mahalle-datalist"
                value={mahalle}
                onChange={(e) => setMahalle(e.target.value)}
                placeholder="Veya mahalle/köy adını buraya yazın..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
              <datalist id="tek-hane-mahalle-datalist">
                {mahalleOptions.map((mName) => (
                  <option key={mName} value={mName} />
                ))}
              </datalist>
            </div>
          </div>

          {/* SOKAK / CADDE, KAPI NO, DAİRE NO */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-sky-600" />
                <span>Sokak / Cadde / Küme Evleri</span>
              </label>
              <input
                type="text"
                list="tek-hane-sokak-datalist"
                value={sokak}
                onChange={(e) => setSokak(e.target.value)}
                placeholder="Örn: Karanfil Sokak"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <datalist id="tek-hane-sokak-datalist">
                {availableStreetsInMahalle.map((sName) => (
                  <option key={sName} value={sName} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-600" />
                <span>Dış Kapı / Bina No</span>
              </label>
              <input
                type="text"
                value={kapiNo}
                onChange={(e) => setKapiNo(e.target.value)}
                placeholder="Örn: 14"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-slate-600" />
                <span>İç Kapı / Daire No</span>
              </label>
              <input
                type="text"
                value={daireNo}
                onChange={(e) => setDaireNo(e.target.value)}
                placeholder="Örn: 2"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* AÇIK ADRES */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                <span>Açık Adres ve Saha Tarifi *</span>
              </label>
              {(sokak.trim() || kapiNo.trim()) && !acikAdres.trim() && (
                <button
                  type="button"
                  onClick={() => setAcikAdres(buildEffectiveAcikAdres())}
                  className="text-[11px] font-extrabold text-amber-700 hover:text-amber-900 underline"
                >
                  Sokak ve Kapı No&apos;dan Otomatik Doldur
                </button>
              )}
            </div>
            <textarea
              rows={2}
              value={acikAdres}
              onChange={(e) => setAcikAdres(e.target.value)}
              placeholder="Örn: Yıldırım Beyazıt Mah. Karanfil Sokak No: 14 Daire: 2 (Camii arkası tek katlı müstakil ev)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
            />
          </div>

          {/* ======================================================== */}
          {/* KURAL 2 UYARI KARTI: AYNI ADRESTE BAŞKA HANE VARSA (SADECE UYARI VERİR, ONAYLA EKLENEBİLİR) */}
          {/* ======================================================== */}
          {activeSameAddressRecords.length > 0 && !activeDuplicateTc && (
            <div className="rounded-2xl bg-amber-50 border-2 border-amber-400 p-4 shadow-sm space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-500 text-white text-[11px] font-black uppercase tracking-wider">
                      AYNI ADRES UYARISI ({activeSameAddressRecords.length} HANE KAYITLI) — KONTROLLÜ EKLENEBİLİR
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-amber-950">
                    Dikkat: Girilen Adreste Sistemde Kayıtlı {activeSameAddressRecords.length} Başka Hane Bulundu!
                  </h4>
                  <p className="text-xs text-amber-900 font-medium leading-relaxed">
                    Bu adreste aşağıda bilgileri yer alan vatandaş(lar) kayıtlıdır. Sahadaki incelemenizde yeni eklediğiniz kişinin durumu uygun ise (ayrı aile/hane ise) aşağıdaki onay kutusunu işaretleyerek sisteme ekleyebilirsiniz.
                  </p>
                </div>
              </div>

              {/* Aynı Adresteki Kayıtlı Hanelerin Listesi */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {activeSameAddressRecords.map((rec, idx) => {
                  const isCompleted =
                    rec.teslimat_durumu === 'TAMAMLANDI' || rec.teslimat_durumu === 'TESLIM_EDILDI';
                  const isExcluded = Boolean(rec.komur_verilmeyecek);
                  return (
                    <div
                      key={rec.id || rec.tc_no || idx}
                      className="rounded-xl bg-white border border-amber-300 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-slate-900 text-sm">
                            {idx + 1}. {rec.ad_soyad}
                          </span>
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            TC: {rec.tc_no || '-'}
                          </span>
                          {rec.eslesme_tipi === 'TAM_ADRES' ? (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                              Birebir Aynı Adres
                            </span>
                          ) : (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300">
                              Aynı Sokak & Kapı No
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 font-medium">
                          📍 {rec.mahalle} — {rec.acik_adres}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] border ${
                            isExcluded
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : isCompleted
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : rec.teslimat_durumu === 'EKSIK'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                        >
                          {isExcluded
                            ? '🚫 Verilmeyecek'
                            : isCompleted
                            ? `✅ Teslim Edildi (${rec.torba_sayisi}/${rec.hedef_torba || defaultQuota} Torba)`
                            : rec.teslimat_durumu === 'EKSIK'
                            ? `⚠️ Eksik (${rec.torba_sayisi}/${rec.hedef_torba || defaultQuota} Torba)`
                            : '⏳ Teslimat Bekliyor'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Personel Onay Kutusu */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-100/90 hover:bg-amber-100 border border-amber-400 cursor-pointer select-none transition-colors">
                <input
                  type="checkbox"
                  checked={confirmSameAddress}
                  onChange={(e) => {
                    setConfirmSameAddress(e.target.checked);
                    if (e.target.checked) setErrorMessage(null);
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-amber-500 text-amber-600 focus:ring-amber-500 shrink-0"
                />
                <span className="text-xs font-extrabold text-amber-950 leading-snug">
                  Aynı adreste yukarıdaki hane(lerin) kayıtlı olduğunu gördüm. Sahadaki incelememde bu
                  hanenin durumu uygun olduğu için eklenmesini onaylıyorum.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* BÖLÜM 3: KÖMÜR KOTASI, LİSTE TÜRÜ, İMZA VE SAHA NOTU */}
        <div className="space-y-4 pt-2 border-t border-slate-200/80">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center">
              3
            </span>
            <h3 className="text-sm font-black text-slate-900">
              Kömür Tahsis Kotası, İmza Durumu ve Saha Notu
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* HEDEF KÖMÜR TORBA SAYISI */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Tahsis Edilen Hedef Torba</span>
                <span className="text-[10px] font-bold text-amber-700">
                  Varsayılan: {defaultQuota} Torba
                </span>
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={hedefTorba}
                onChange={(e) => setHedefTorba(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* LİSTE TÜRÜ */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Eklenecek Liste Kategorisi
              </label>
              <select
                value={listeTuru}
                onChange={(e) => setListeTuru(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="EK_LISTE">Saha Ek Liste (Önerilen)</option>
                <option value="ANA_LISTE">Ana Liste</option>
                <option value="SIGORTALI">Sigortalılar Listesi</option>
              </select>
            </div>

            {/* HANE NO (OPSİYONEL) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>SYDV Hane No (İsteğe Bağlı)</span>
                <span className="text-[10px] text-slate-400">Opsiyonel</span>
              </label>
              <input
                type="text"
                value={haneNo}
                onChange={(e) => setHaneNo(e.target.value)}
                placeholder="Boş bırakılabilir"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono font-bold focus:outline-none focus:ring-2 ${
                  activeDuplicateHane
                    ? 'border-rose-500 bg-rose-50 text-rose-900 focus:ring-rose-500'
                    : 'border-slate-300 bg-white text-slate-900 focus:ring-amber-500'
                }`}
              />
            </div>
          </div>

          {/* KAPIDA ISLAK İMZA DURUMU VE SAHA NOTU */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label
              className={`p-3.5 rounded-2xl border-2 flex items-start gap-3 cursor-pointer select-none transition-all ${
                imzaAlindi
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              }`}
            >
              <input
                type="checkbox"
                checked={imzaAlindi}
                onChange={(e) => setImzaAlindi(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
              />
              <div>
                <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                  <PenTool className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Kapıda Islak İmza Alındı Olarak İşaretle</span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5 leading-relaxed">
                  Vatandaştan saha tutanağına/listeye ıslak imza alındıysa işaretleyin. İşaretlendiğinde
                  kömür teslimat kilidi anında açılır.
                </p>
              </div>
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Saha Tespit / Ekleme Notu (İsteğe Bağlı)</span>
              </label>
              <input
                type="text"
                value={eklemeNotu}
                onChange={(e) => setEklemeNotu(e.target.value)}
                placeholder="Örn: Sahada yerinde incelendi, durumu uygun"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickNotes.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => setEklemeNotu(note)}
                    className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 text-[10px] font-bold transition-colors"
                  >
                    + {note}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* HATA MESAJI KUTUSU */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-2.5 text-xs font-bold text-rose-900 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ALT AKSİYON BUTONLARI */}
        <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleResetForm}
            className="px-4 py-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Formu Temizle</span>
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Eğer aynı adreste başka hane varsa ve henüz kutucuk işaretlenmediyse tek tıkla onaylı ekleme butonu da sun */}
            {activeSameAddressRecords.length > 0 && !confirmSameAddress && !activeDuplicateTc && (
              <button
                type="button"
                disabled={isSubmitting || Boolean(activeDuplicateTc) || Boolean(activeDuplicateHane)}
                onClick={(e) => {
                  setConfirmSameAddress(true);
                  handleSubmit(e as any, true);
                }}
                className="px-5 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Aynı Adres Uyarısını Gördüm, Yine de Ekle</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting || Boolean(activeDuplicateTc) || Boolean(activeDuplicateHane)}
              className={`px-6 py-3.5 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${
                activeDuplicateTc || activeDuplicateHane
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sisteme Kaydediliyor...</span>
                </>
              ) : activeDuplicateTc ? (
                <>
                  <Ban className="w-4 h-4" />
                  <span>Kayıtlı T.C. Kimlik No Eklenemez</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Haneyi Sisteme Ekle ({hedefTorba || defaultQuota} Torba)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* BU OTURUMDA EKLENEN HANELER ÖZET LİSTESİ */}
      {sessionAddedRecords.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Bu Oturumda Eklediğiniz Haneler ({sessionAddedRecords.length})</span>
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {sessionAddedRecords.map((item, idx) => (
              <div
                key={item.id || idx}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900">{item.ad_soyad}</span>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      TC: {item.tc_no}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {item.mahalle}
                    </span>
                  </div>
                  <p className="text-slate-500 mt-0.5">{item.acik_adres}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onOpenDelivery && (
                    <button
                      type="button"
                      onClick={() => onOpenDelivery(item)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs flex items-center gap-1 transition-all"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>Kömür Teslim Et</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
