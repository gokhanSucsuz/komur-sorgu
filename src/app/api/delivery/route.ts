import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, buildIdFilter, mapDoc, recordActivityLog } from '@/lib/mongodb';
import { encryptField, encryptDeliveryHistory } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const { beneficiaries: benCol, deliveryHistory: histCol } = await getDbCollections();
    const body = await request.json();
    const { action, beneficiary_id, torba_sayisi, eklenen_torba, teslim_alan, personel, notlar, iptal_nedeni } = body;

    if (!beneficiary_id) {
      return NextResponse.json({ success: false, error: 'Kayıt ID zorunludur' }, { status: 400 });
    }

    const rawBeneficiary = await benCol.findOne(buildIdFilter(beneficiary_id));

    if (!rawBeneficiary) {
      return NextResponse.json({ success: false, error: 'Hak sahibi bulunamadı' }, { status: 404 });
    }

    const beneficiary = mapDoc(rawBeneficiary);
    const now = new Date();
    const nowIso = now.toISOString();
    const localToday = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const localTimeStr = now.toLocaleString('tr-TR');

    if (action === 'TESLIMAT') {
      const hedef = beneficiary.hedef_torba || 34;
      let newTotalBags = 0;
      let deliveredThisTime = 0;

      if (eklenen_torba !== undefined && eklenen_torba !== null) {
        deliveredThisTime = parseInt(eklenen_torba, 10) || 0;
        newTotalBags = (beneficiary.torba_sayisi || 0) + deliveredThisTime;
      } else {
        newTotalBags = parseInt(torba_sayisi || String(hedef), 10);
        deliveredThisTime = newTotalBags - (beneficiary.torba_sayisi || 0);
        if (deliveredThisTime <= 0) deliveredThisTime = newTotalBags;
      }

      const recipient = (teslim_alan || beneficiary.ad_soyad).trim();
      const staff = (personel || 'Personel').trim();
      const note = (notlar || '').trim();

      // Determine status: TAMAMLANDI vs EKSIK
      let newStatus = 'TAMAMLANDI';
      if (newTotalBags < hedef) {
        newStatus = 'EKSIK';
      }

      // Update beneficiary in MongoDB (with encrypted recipient and notes)
      await benCol.updateOne(buildIdFilter(beneficiary.id), {
        $set: {
          teslimat_durumu: newStatus,
          teslimat_tarihi: localTimeStr,
          torba_sayisi: newTotalBags,
          teslim_alan: encryptField(recipient),
          teslim_eden_personel: staff,
          teslimat_notu: encryptField(note),
          updated_at: localTimeStr,
        },
      });

      // Add to delivery history (AES-256-GCM Şifreli)
      await histCol.insertOne(encryptDeliveryHistory({
        beneficiary_id: beneficiary.id,
        tc_no: beneficiary.tc_no,
        ad_soyad: beneficiary.ad_soyad,
        mahalle: beneficiary.mahalle,
        acik_adres: beneficiary.acik_adres,
        islem_tipi: 'TESLIMAT',
        torba_sayisi: deliveredThisTime,
        teslim_alan: recipient,
        personel: staff,
        notlar: note,
        iptal_nedeni: null,
        tarih: localTimeStr,
        gun_tarihi: localToday,
      }));

      const eksikKalan = Math.max(0, hedef - newTotalBags);

      // Record Activity Log for Admin Audit
      await recordActivityLog({
        kullanici_adi: staff,
        kullanici_rolu: 'PERSONEL',
        islem_tipi: newStatus === 'TAMAMLANDI' ? 'TESLIMAT' : 'EKSIK_TESLIMAT',
        baslik: newStatus === 'TAMAMLANDI' ? 'Kömür Teslimatı Tamamlandı' : 'Eksik Kömür Teslimatı Yapıldı',
        detay: `${recipient} (${beneficiary.tc_no}) hanesine ${deliveredThisTime} torba kömür teslim edildi. Toplam: ${newTotalBags}/${hedef} torba.${newStatus === 'EKSIK' ? ` Kalan ${eksikKalan} torba tamamlanmayı bekliyor.` : ''} ${note ? 'Not: ' + note : ''}`,
        hedef_kisi: recipient,
        hedef_tc: beneficiary.tc_no,
        mahalle: beneficiary.mahalle,
        torba_sayisi: deliveredThisTime,
      });

      return NextResponse.json({
        success: true,
        message:
          newStatus === 'TAMAMLANDI'
            ? `Kömür teslimatı tamamlandı! (${newTotalBags} Torba / Tam Hane)`
            : `Kısmi teslimat kaydedildi! (${newTotalBags}/${hedef} Torba, ${eksikKalan} torba eksik kaldı)`,
        beneficiary: {
          ...beneficiary,
          teslimat_durumu: newStatus,
          torba_sayisi: newTotalBags,
          hedef_torba: hedef,
          kalan_torba: eksikKalan,
          teslim_alan: recipient,
        },
      });
    } else if (action === 'IPTAL') {
      const cancelReason = (iptal_nedeni || 'Hatalı teslimat kaydı').trim();
      const staff = (personel || 'Yönetici').trim();

      // Revert beneficiary status to BEKLIYOR
      await benCol.updateOne(buildIdFilter(beneficiary.id), {
        $set: {
          teslimat_durumu: 'BEKLIYOR',
          teslimat_tarihi: null,
          torba_sayisi: 0,
          teslim_alan: null,
          teslim_eden_personel: null,
          teslimat_notu: null,
          updated_at: localTimeStr,
        },
      });

      // Record cancellation in history (AES-256-GCM Şifreli)
      await histCol.insertOne(encryptDeliveryHistory({
        beneficiary_id: beneficiary.id,
        tc_no: beneficiary.tc_no,
        ad_soyad: beneficiary.ad_soyad,
        mahalle: beneficiary.mahalle,
        acik_adres: beneficiary.acik_adres,
        islem_tipi: 'IPTAL',
        torba_sayisi: beneficiary.torba_sayisi || 0,
        teslim_alan: beneficiary.teslim_alan || '',
        personel: staff,
        iptal_nedeni: cancelReason,
        tarih: localTimeStr,
        gun_tarihi: localToday,
      }));

      // Record Activity Log for Admin Audit
      await recordActivityLog({
        kullanici_adi: staff,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'IPTAL',
        baslik: 'Teslimat İptal Edildi',
        detay: `${beneficiary.ad_soyad} (${beneficiary.tc_no}) hanesine yapılan teslimat kaydı geri alındı ve hane beklemeye döndürüldü. İptal Gerekçesi: ${cancelReason}`,
        hedef_kisi: beneficiary.ad_soyad,
        hedef_tc: beneficiary.tc_no,
        mahalle: beneficiary.mahalle,
      });

      return NextResponse.json({
        success: true,
        message: 'Kömür teslimatı iptal edildi ve iptal kayıtlarına işlendi.',
        beneficiary: {
          ...beneficiary,
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          kalan_torba: beneficiary.hedef_torba || 34,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem tipi' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in delivery handler:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
