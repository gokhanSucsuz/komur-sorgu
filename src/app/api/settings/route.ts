import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, recordActivityLog, touchSyncPulse, seedSandboxFakeData } from '@/lib/mongodb';
import { verifySession } from '@/lib/auth';
import { normalizeToTon, formatTonnage } from '@/lib/normalizer';
import { serverError } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const {
      systemSettings,
      calismaModu,
      isSandboxMode,
      sandboxBeneficiaries,
      sandboxImportBatches,
      sandboxImportLogs,
      sandboxDeliveryHistory,
      officialBeneficiaries,
      officialImportBatches,
    } = await getDbCollections();

    const officialQuotaDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const sandboxQuotaDoc = isSandboxMode
      ? await systemSettings.findOne({ key: 'sandbox_varsayilan_hedef_torba' })
      : null;
    const activeQuotaDoc = sandboxQuotaDoc || officialQuotaDoc;
    const varsayilanHedefTorba = activeQuotaDoc ? parseInt(activeQuotaDoc.value, 10) : 34;

    const officialTahsisDoc = await systemSettings.findOne({ key: 'toplam_tahsis_tonaj' });
    const sandboxTahsisDoc = isSandboxMode
      ? await systemSettings.findOne({ key: 'sandbox_toplam_tahsis_tonaj' })
      : null;
    const activeTahsisDoc = sandboxTahsisDoc || officialTahsisDoc;
    const toplamTahsisTonaj = activeTahsisDoc && activeTahsisDoc.value ? parseFloat(activeTahsisDoc.value) : 0;

    const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
    let aktifDonem = { kod: '2026-2027', baslik: '2026-2027 Kömür Dağıtım Dönemi' };
    if (seasonDoc?.value) {
      try {
        aktifDonem = JSON.parse(seasonDoc.value);
      } catch {}
    }

    const [
      sandboxHaneSayisi,
      sandboxListeSayisi,
      sandboxHataLogSayisi,
      sandboxTeslimatSayisi,
      resmiHaneSayisi,
      resmiListeSayisi,
    ] = await Promise.all([
      sandboxBeneficiaries.countDocuments({}),
      sandboxImportBatches.countDocuments({}),
      sandboxImportLogs.countDocuments({}),
      sandboxDeliveryHistory.countDocuments({}),
      officialBeneficiaries.countDocuments({}),
      officialImportBatches.countDocuments({}),
    ]);

    return NextResponse.json({
      success: true,
      calisma_modu: calismaModu,
      is_sandbox_mode: isSandboxMode,
      settings: {
        varsayilan_hedef_torba: varsayilanHedefTorba,
        toplam_tahsis_tonaj: toplamTahsisTonaj,
        aktif_donem: aktifDonem,
        calisma_modu: calismaModu,
        is_sandbox_mode: isSandboxMode,
        sandbox_stats: {
          hane_sayisi: sandboxHaneSayisi,
          liste_sayisi: sandboxListeSayisi,
          hata_log_sayisi: sandboxHataLogSayisi,
          teslimat_sayisi: sandboxTeslimatSayisi,
        },
        official_stats: {
          hane_sayisi: resmiHaneSayisi,
          liste_sayisi: resmiListeSayisi,
        },
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

    const {
      isSandboxMode,
      systemSettings,
      beneficiaries,
      sandboxBeneficiaries,
      sandboxImportBatches,
      sandboxImportLogs,
      sandboxDeliveryHistory,
      sandboxDeliveryRoutes,
      sandboxTruckDeliveries,
      sandboxWorkShifts,
      sandboxActivityLogs,
      sandboxSignatureLists,
    } = await getDbCollections();
    const body = await request.json();
    const { action, calisma_modu, varsayilan_hedef_torba, updateExisting, toplam_tahsis_tonaj } = body;
    const adminName = session.ad_soyad || session.username || 'Sistem Yöneticisi';

    // 0A. Çalışma Modu Değiştirme: RESMI (Gerçek Mod) <-> DENEME (Test & Simülasyon Modu)
    if (action === 'SET_CALISMA_MODU' || calisma_modu !== undefined) {
      const targetMode = String(calisma_modu || body.mod || '').trim().toUpperCase();
      if (targetMode !== 'RESMI' && targetMode !== 'DENEME') {
        return NextResponse.json(
          { success: false, error: 'Geçersiz çalışma modu! Yalnızca RESMI veya DENEME seçilebilir.' },
          { status: 400 }
        );
      }

      let autoSeededCount = 0;
      if (targetMode === 'DENEME' && body.skip_auto_seed !== true) {
        const currentSandboxCount = await sandboxBeneficiaries.countDocuments({});
        if (currentSandboxCount === 0) {
          const seeded = await seedSandboxFakeData({
            clearExistingSandbox: false,
            createdBy: adminName,
          });
          autoSeededCount = seeded.seededCount;
        }
      }

      await systemSettings.updateOne(
        { key: 'calisma_modu' },
        {
          $set: {
            key: 'calisma_modu',
            value: targetMode,
            updated_by: adminName,
            updated_at: new Date().toLocaleString('tr-TR'),
          },
        },
        { upsert: true }
      );

      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'CALISMA_MODU_DEGISIMI',
        baslik: targetMode === 'DENEME' ? 'Deneme (Test) Moduna Geçildi' : 'Gerçek (Resmi) Moda Geçildi',
        detay:
          targetMode === 'DENEME'
            ? `Sistem Yöneticisi (${adminName}) tarafından Deneme Alanı (Test & Simülasyon Modu) aktif edildi.${autoSeededCount > 0 ? ` Sistemde test için ${autoSeededCount} adet örnek (fake) hane ve liste hazırlandı.` : ''} Tüm personel şu anda deneme verilerini görmektedir; gerçek (resmi) verilere dokunulmaz.`
            : `Sistem Yöneticisi (${adminName}) tarafından Deneme Modu kapatıldı ve Gerçek (Resmi) Çalışma Moduna geri dönüldü. Tüm resmi veriler eksiksiz yüklendi.`,
        ek_bilgi: { calisma_modu: targetMode, auto_seeded_count: autoSeededCount },
        forceOfficial: true,
      });

      await touchSyncPulse('MODE_SWITCH');

      return NextResponse.json({
        success: true,
        calisma_modu: targetMode,
        is_sandbox_mode: targetMode === 'DENEME',
        auto_seeded_count: autoSeededCount,
        message:
          targetMode === 'DENEME'
            ? autoSeededCount > 0
              ? `Deneme Modu aktif edildi! ${autoSeededCount} adet örnek (fake) hane, ek liste ve tır kaydı sisteme yüklendi. Tüm personel şu anda bu deneme kayıtlarını görmektedir; asıl (resmi) verileriniz %100 güvendedir.`
              : 'Deneme (Test) Modu aktif edildi! Mevcut deneme verileriniz yüklendi ve tüm personel şu anda deneme kayıtlarını görmektedir; asıl (resmi) verileriniz %100 güvendedir.'
            : 'Deneme Modu kapatıldı ve Gerçek (Resmi) Moda geçildi! Hiçbir veri kaybı olmadan asıl resmi listelerinizle normal işleyişe devam edilmektedir.',
      });
    }

    // 0B. Deneme Alanı (Sandbox) Verilerini Tamamen Temizleme / Sıfırlama (İsteğe Bağlı Örnek Fake Veri Yenileme İle)
    if (action === 'RESET_SANDBOX_DATA' || action === 'SEED_SANDBOX_FAKE_DATA') {
      const switchToOfficial = Boolean(body.switch_to_official);
      const reseedFake = action === 'SEED_SANDBOX_FAKE_DATA' || Boolean(body.seed_fake_data);

      const [delBen, delBatch, delLog, delHist, delRoute, delTruck, delShift, delSig] = await Promise.all([
        sandboxBeneficiaries.deleteMany({}),
        sandboxImportBatches.deleteMany({}),
        sandboxSignatureLists.deleteMany({}),
        sandboxImportLogs.deleteMany({}),
        sandboxDeliveryHistory.deleteMany({}),
        sandboxDeliveryRoutes.deleteMany({}),
        sandboxTruckDeliveries.deleteMany({}),
        sandboxWorkShifts.deleteMany({}),
        sandboxActivityLogs.deleteMany({}),
        systemSettings.deleteOne({ key: 'sandbox_varsayilan_hedef_torba' }),
        systemSettings.deleteOne({ key: 'sandbox_toplam_tahsis_tonaj' }),
      ]);

      let reseededCount = 0;
      if (reseedFake && !switchToOfficial) {
        const seeded = await seedSandboxFakeData({
          clearExistingSandbox: false,
          createdBy: adminName,
        });
        reseededCount = seeded.seededCount;
      }

      if (switchToOfficial) {
        await systemSettings.updateOne(
          { key: 'calisma_modu' },
          {
            $set: {
              key: 'calisma_modu',
              value: 'RESMI',
              updated_by: adminName,
              updated_at: new Date().toLocaleString('tr-TR'),
            },
          },
          { upsert: true }
        );
      }

      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'DENEME_VERILERI_SIFIRLAMA',
        baslik: reseedFake ? 'Deneme Verileri Sıfırlandı ve Örnek (Fake) Veriler Yüklendi' : 'Deneme Alanı (Test) Verileri Sıfırlandı',
        detay: `Deneme modunda oluşturulan test verileri sıfırlandı (${delBen.deletedCount || 0} test hanesi, ${delBatch.deletedCount || 0} test listesi silindi).${reseededCount > 0 ? ` Yeniden ${reseededCount} adet temiz örnek (fake) hane yüklendi.` : ''} Resmi verilere kesinlikle dokunulmadı.`,
        ek_bilgi: {
          silinen_test_hane: delBen.deletedCount || 0,
          silinen_test_liste: delBatch.deletedCount || 0,
          silinen_test_log: delLog.deletedCount || 0,
          silinen_test_teslimat: delHist.deletedCount || 0,
          silinen_test_rota: delRoute.deletedCount || 0,
          silinen_test_tir: delTruck.deletedCount || 0,
          silinen_test_mesai: delShift.deletedCount || 0,
          yuklenen_ornek_hane: reseededCount,
          resmi_moda_gecildi: switchToOfficial,
        },
        forceOfficial: true,
      });

      await touchSyncPulse('SANDBOX_RESET');

      return NextResponse.json({
        success: true,
        calisma_modu: switchToOfficial ? 'RESMI' : undefined,
        reseeded_count: reseededCount,
        message: reseedFake
          ? `Deneme Modu sıfırlandı ve ${reseededCount} adet temiz örnek (fake) hane ile test listeleri yeniden yüklendi. Gerçek (Resmi) listeleriniz %100 güvendedir.`
          : `Deneme Modu verileri tamamen sıfırlandı (${delBen.deletedCount || 0} test hanesi ve ${delBatch.deletedCount || 0} test listesi temizlendi). Gerçek (Resmi) listeleriniz %100 güvendedir.`,
      });
    }

    // 1. Kuruma Gelecek Toplam Kömür Tonajı / Tahsisi Belirleme (Deneme Modunda İzole Anahtar Kullanır)
    if (toplam_tahsis_tonaj !== undefined) {
      const tonVal = normalizeToTon(toplam_tahsis_tonaj);
      if (isNaN(tonVal) || tonVal < 0) {
        return NextResponse.json({ success: false, error: 'Geçersiz kömür tonaj miktarı' }, { status: 400 });
      }

      const tahsisKey = isSandboxMode ? 'sandbox_toplam_tahsis_tonaj' : 'toplam_tahsis_tonaj';
      await systemSettings.updateOne(
        { key: tahsisKey },
        { $set: { key: tahsisKey, value: String(tonVal) } },
        { upsert: true }
      );

      const fmt = formatTonnage(tonVal);
      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'TAHSIS_GUNCELLEME',
        baslik: isSandboxMode ? '[DENEME] Kömür Tahsisi Güncellendi' : 'Kurum Toplam Kömür Tahsisi Güncellendi',
        detay: `Kuruma gelecek toplam kömür miktarı ${fmt.combined} olarak belirlendi.`,
        ek_bilgi: { toplam_tahsis_tonaj: tonVal, isSandboxMode },
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

    // Upsert system setting in MongoDB (Sandbox mode uses isolated key so Official quota is never altered)
    const quotaKey = isSandboxMode ? 'sandbox_varsayilan_hedef_torba' : 'varsayilan_hedef_torba';
    await systemSettings.updateOne(
      { key: quotaKey },
      { $set: { key: quotaKey, value: String(bagVal) } },
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
