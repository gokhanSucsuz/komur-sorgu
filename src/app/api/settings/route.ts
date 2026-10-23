import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { verifySession } from '@/lib/auth';
import { normalizeToTon, formatTonnage } from '@/lib/normalizer';
import { serverError } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { systemSettings } = await getDbCollections();
    const doc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const varsayilanHedefTorba = doc ? parseInt(doc.value, 10) : 34;

    const tahsisDoc = await systemSettings.findOne({ key: 'toplam_tahsis_tonaj' });
    const toplamTahsisTonaj = tahsisDoc && tahsisDoc.value ? parseFloat(tahsisDoc.value) : 0;

    const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
    let aktifDonem = { kod: '2026-2027', baslik: '2026-2027 Kömür Dağıtım Dönemi' };
    if (seasonDoc?.value) {
      try {
        aktifDonem = JSON.parse(seasonDoc.value);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      settings: {
        varsayilan_hedef_torba: varsayilanHedefTorba,
        toplam_tahsis_tonaj: toplamTahsisTonaj,
        aktif_donem: aktifDonem,
      },
    });
  } catch (error: any) {
    return serverError('settings:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Bu ayarı sadece Sistem Yöneticisi belirleyebilir veya değiştirebilir.' },
        { status: 401 }
      );
    }

    const { systemSettings, beneficiaries } = await getDbCollections();
    const body = await request.json();
    const { varsayilan_hedef_torba, updateExisting, toplam_tahsis_tonaj } = body;
    const adminName = session.ad_soyad || session.username || 'Sistem Yöneticisi';

    // 1. Kuruma Gelecek Toplam Kömür Tonajı / Tahsisi Belirleme
    if (toplam_tahsis_tonaj !== undefined) {
      const tonVal = normalizeToTon(toplam_tahsis_tonaj);
      if (isNaN(tonVal) || tonVal < 0) {
        return NextResponse.json({ success: false, error: 'Geçersiz kömür tonaj miktarı' }, { status: 400 });
      }

      await systemSettings.updateOne(
        { key: 'toplam_tahsis_tonaj' },
        { $set: { key: 'toplam_tahsis_tonaj', value: String(tonVal) } },
        { upsert: true }
      );

      const fmt = formatTonnage(tonVal);
      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'TAHSIS_GUNCELLEME',
        baslik: 'Kurum Toplam Kömür Tahsisi Güncellendi',
        detay: `Kuruma gelecek toplam kömür miktarı ${fmt.combined} olarak belirlendi.`,
        ek_bilgi: { toplam_tahsis_tonaj: tonVal },
      });
      await touchSyncPulse('SETTINGS_UPDATE');

      return NextResponse.json({
        success: true,
        message: `Kurum toplam kömür tahsisi ${fmt.combined} olarak başarıyla kaydedildi.`,
        toplam_tahsis_tonaj: tonVal,
      });
    }

    const bagVal = parseInt(varsayilan_hedef_torba, 10);
    if (isNaN(bagVal) || bagVal <= 0 || bagVal > 200) {
      return NextResponse.json({ success: false, error: 'Geçersiz torba miktarı (1-200 arası olmalıdır)' }, { status: 400 });
    }

    // Upsert system setting in MongoDB
    await systemSettings.updateOne(
      { key: 'varsayilan_hedef_torba' },
      { $set: { key: 'varsayilan_hedef_torba', value: String(bagVal) } },
      { upsert: true }
    );

    if (updateExisting) {
      // Update pending or unset beneficiaries
      await beneficiaries.updateMany(
        {
          $or: [
            { teslimat_durumu: 'BEKLIYOR' },
            { hedef_torba: { $exists: false } },
            { hedef_torba: null },
            { hedef_torba: 0 },
          ],
        },
        { $set: { hedef_torba: bagVal } }
      );

      // Re-evaluate statuses based on delivered bag amounts
      const allList = await beneficiaries.find({}).toArray();
      for (const b of allList) {
        const torba = b.torba_sayisi || 0;
        const hedef = b.hedef_torba || bagVal;
        let durum = 'BEKLIYOR';
        if (torba >= hedef) durum = 'TAMAMLANDI';
        else if (torba > 0) durum = 'EKSIK';

        if (durum !== b.teslimat_durumu) {
          await beneficiaries.updateOne({ _id: b._id }, { $set: { teslimat_durumu: durum } });
        }
      }
    }

    await recordActivityLog({
      kullanici_adi: adminName,
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'KOTA_DEGISTIRME',
      baslik: 'Varsayılan Hedef Kömür Kotası Güncellendi',
      detay: `Hane başı hedef torba sayısı ${bagVal} torba (${(bagVal * 0.025).toFixed(2)} Ton) olarak güncellendi.${updateExisting ? ' Bekleyen hanelerin hedefleri de güncellendi.' : ''}`,
      ek_bilgi: { bagVal, updateExisting },
    });

    return NextResponse.json({
      success: true,
      message: `Hane başı hedef torba sayısı ${bagVal} olarak güncellendi.`,
    });
  } catch (error: any) {
    return serverError('settings:POST', error);
  }
}
