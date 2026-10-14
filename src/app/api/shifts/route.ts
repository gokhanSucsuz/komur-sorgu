import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, mapDoc, buildIdFilter, recordActivityLog } from '@/lib/mongodb';
import { encryptShift, encryptField } from '@/lib/crypto';

function calculateMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // Cross midnight edge-case
  return diff;
}

function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

const TR_MONTHS: Record<string, string> = {
  '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
  '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
  '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
};

function formatMonthLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split('-');
  const mName = TR_MONTHS[m] || m;
  return `${mName} ${y}`;
}

function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

// GET /api/shifts - List shifts, active shift & calculated overtime stats with carryover
export async function GET(request: NextRequest) {
  try {
    const { workShifts: shiftsCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const personel = (searchParams.get('personel') || '').trim();
    const month = (searchParams.get('month') || '').trim(); // 'YYYY-MM' or 'ALL'
    const startDate = (searchParams.get('startDate') || '').trim();
    const endDate = (searchParams.get('endDate') || '').trim();
    const gun = (searchParams.get('gun') || '').trim();
    const dayType = (searchParams.get('dayType') || '').trim();

    // Query all shifts chronologically to accurately calculate carryovers
    const rawShifts = await shiftsCol
      .find({})
      .sort({ tarih: 1, baslama_saati: 1 })
      .toArray();

    let allDbShifts = mapDocs(rawShifts);
    if (personel && personel !== 'ALL') {
      allDbShifts = allDbShifts.filter((s: any) => s.personel_adi === personel);
    }

    // Find distinct available months in the database
    const allUniqueDates: string[] = await shiftsCol.distinct('tarih');
    const monthSet = new Set<string>();
    allUniqueDates.forEach((d) => {
      if (d && d.length >= 7) monthSet.add(d.substring(0, 7));
    });

    const availableMonths = Array.from(monthSet)
      .sort()
      .reverse()
      .map((ym) => ({
        id: ym,
        label: formatMonthLabel(ym),
      }));

    // Find any currently active shift for the requested personnel (or generally today)
    const rawAllActive = await shiftsCol.find({ durum: 'DEVAM_EDIYOR' }).toArray();
    const activeShifts = mapDocs(rawAllActive);
    const activeShift = activeShifts.find((s: any) => (!personel || personel === 'ALL' || s.personel_adi === personel)) || null;

    // Process carryover chains per personnel chronologically
    const carryoverMap: Record<string, { minutes: number; sourceDate: string; sourceDayName: string }> = {};
    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

    const enrichedAll = allDbShifts.map((s) => {
      let durationMinutes = s.toplam_dakika || 0;
      if (s.durum === 'DEVAM_EDIYOR' && s.baslama_saati) {
        const now = new Date();
        const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        durationMinutes = calculateMinutes(s.baslama_saati, curTime);
      }

      const shiftDate = new Date(s.tarih + 'T00:00:00');
      const dayIndex = isNaN(shiftDate.getTime()) ? 1 : shiftDate.getDay();
      const isSaturday = dayIndex === 6;
      const isSunday = dayIndex === 0;
      const isWeekday = dayIndex >= 1 && dayIndex <= 5;
      const isFriday = dayIndex === 5;
      const dayName = dayNames[dayIndex] || '';

      const dayTypeCalculated = isSaturday ? 'CUMARTESI' : isSunday ? 'PAZAR' : 'HAFTA_ICI';
      const dayTypeLabel = isSaturday
        ? 'Cumartesi Mesaisi'
        : isSunday
        ? 'Pazar Full Mesaisi'
        : 'Hafta İçi (08:30-17:30)';

      // Daily 11 hours legal limit = 660 minutes
      const exceeds11Hours = durationMinutes > 660;
      const excessMinutes = exceeds11Hours ? (durationMinutes - 660) : 0;

      let normalMinutes = 0;
      let after1730Minutes = 0;
      let baseOvertimeMinutes = 0;
      let transferredOutMinutes = 0;
      let transferredOutTarget = '';
      let transferredInMinutes = 0;
      let transferredInSource = '';
      let finalOvertimeMinutes = 0;

      const person = s.personel_adi;

      if (isWeekday) {
        // Weekday: 17:30 cutoff (1050 minutes of day)
        // Anything before 17:30 is considered normal working hours
        const startM = timeToMinutes(s.baslama_saati);
        const endM = timeToMinutes(s.bitis_saati || '17:30');

        normalMinutes = Math.max(0, Math.min(endM, 1050) - startM);
        after1730Minutes = Math.max(0, endM - Math.max(startM, 1050));

        // Capped work time cannot exceed 660 minutes (11 hours)
        const cappedWorkMinutes = Math.min(durationMinutes, 660);
        baseOvertimeMinutes = Math.max(0, cappedWorkMinutes - normalMinutes);

        // If exceeded 11 hours, remainder is transferred to next work day
        if (excessMinutes > 0) {
          transferredOutMinutes = excessMinutes;
          // Friday excess transfers to Next Monday, others to Next Day
          transferredOutTarget = isFriday ? 'Pazartesi' : 'Sonraki Gün';
        }

        // Check if there is incoming carryover from previous work day
        if (carryoverMap[person] && carryoverMap[person].minutes > 0) {
          transferredInMinutes = carryoverMap[person].minutes;
          transferredInSource = `${carryoverMap[person].sourceDate} (${carryoverMap[person].sourceDayName})`;
          finalOvertimeMinutes = baseOvertimeMinutes + transferredInMinutes;
          delete carryoverMap[person];
        } else {
          transferredInMinutes = 0;
          finalOvertimeMinutes = baseOvertimeMinutes;
        }

        // If this day produced excess, queue it for the next weekday of this personnel
        if (transferredOutMinutes > 0) {
          carryoverMap[person] = {
            minutes: transferredOutMinutes,
            sourceDate: s.tarih,
            sourceDayName: dayName,
          };
        }
      } else {
        // Weekend (Cumartesi or Pazar):
        normalMinutes = 0;
        after1730Minutes = durationMinutes;
        baseOvertimeMinutes = durationMinutes;
        transferredInMinutes = 0;
        transferredOutMinutes = 0;
        finalOvertimeMinutes = durationMinutes;
      }

      return {
        ...s,
        durationMinutes,
        durationFormatted: formatMinutes(durationMinutes),
        normalMinutes,
        normalFormatted: formatMinutes(normalMinutes),
        after1730Minutes,
        after1730Formatted: formatMinutes(after1730Minutes),
        baseOvertimeMinutes,
        baseOvertimeFormatted: formatMinutes(baseOvertimeMinutes),
        transferredOutMinutes,
        transferredOutFormatted: formatMinutes(transferredOutMinutes),
        transferredOutTarget,
        transferredInMinutes,
        transferredInFormatted: formatMinutes(transferredInMinutes),
        transferredInSource,
        finalOvertimeMinutes,
        finalOvertimeFormatted: formatMinutes(finalOvertimeMinutes),
        isSaturday,
        isSunday,
        isWeekday,
        isWeekend: isSaturday || isSunday,
        isFriday,
        dayName,
        dayType: dayTypeCalculated,
        dayTypeLabel,
        exceeds11Hours,
        excessMinutes,
        excessFormatted: formatMinutes(excessMinutes),
      };
    });

    // Now filter by date / month / range for the response
    let dateFiltered = enrichedAll.filter((s) => {
      if (gun && s.tarih !== gun) return false;
      if (month && month !== 'ALL') {
        if (!s.tarih.startsWith(month)) return false;
      }
      if (startDate && s.tarih < startDate) return false;
      if (endDate && s.tarih > endDate) return false;
      return true;
    });

    // Calculate aggregated statistics on dateFiltered set
    let toplamMesaiDakika = 0;
    let haftaIciMesaiDakika = 0;
    let haftaIciNormalDakika = 0;
    let haftaIciGunSayisi = 0;
    let cumartesiDakika = 0;
    let cumartesiGunSayisi = 0;
    let pazarDakika = 0;
    let pazarGunSayisi = 0;
    let toplamSarkanDakika = 0;
    let toplamTorba = 0;
    let toplamHane = 0;
    let tamamlananGunSayisi = 0;

    // Personnel payroll breakdown map for the selected period
    const personnelBreakdownMap: Record<string, any> = {};

    dateFiltered.forEach((s) => {
      const p = s.personel_adi;
      if (!personnelBreakdownMap[p]) {
        personnelBreakdownMap[p] = {
          personel_adi: p,
          haftaIciMesaiDakika: 0,
          haftaIciNormalDakika: 0,
          cumartesiDakika: 0,
          pazarDakika: 0,
          sarkanDakika: 0,
          toplamMesaiDakika: 0,
          toplamTorba: 0,
          toplamHane: 0,
          gunSayisi: 0,
        };
      }

      if (s.durum === 'TAMAMLANDI') {
        tamamlananGunSayisi++;
        personnelBreakdownMap[p].gunSayisi++;

        if (s.isSaturday) {
          cumartesiDakika += s.finalOvertimeMinutes;
          cumartesiGunSayisi++;
          personnelBreakdownMap[p].cumartesiDakika += s.finalOvertimeMinutes;
        } else if (s.isSunday) {
          pazarDakika += s.finalOvertimeMinutes;
          pazarGunSayisi++;
          personnelBreakdownMap[p].pazarDakika += s.finalOvertimeMinutes;
        } else {
          haftaIciMesaiDakika += s.finalOvertimeMinutes;
          haftaIciNormalDakika += s.normalMinutes;
          haftaIciGunSayisi++;
          personnelBreakdownMap[p].haftaIciMesaiDakika += s.finalOvertimeMinutes;
          personnelBreakdownMap[p].haftaIciNormalDakika += s.normalMinutes;
        }

        toplamSarkanDakika += s.transferredOutMinutes;
        personnelBreakdownMap[p].sarkanDakika += s.transferredOutMinutes;
        personnelBreakdownMap[p].toplamMesaiDakika += s.finalOvertimeMinutes;
      }

      toplamTorba += s.teslim_edilen_torba || 0;
      toplamHane += s.teslim_edilen_hane || 0;
      personnelBreakdownMap[p].toplamTorba += s.teslim_edilen_torba || 0;
      personnelBreakdownMap[p].toplamHane += s.teslim_edilen_hane || 0;
    });

    toplamMesaiDakika = haftaIciMesaiDakika + cumartesiDakika + pazarDakika;

    const monthlyBreakdown = Object.values(personnelBreakdownMap).map((item: any) => ({
      ...item,
      haftaIciMesaiFormatli: formatMinutes(item.haftaIciMesaiDakika),
      haftaIciNormalFormatli: formatMinutes(item.haftaIciNormalDakika),
      cumartesiFormatli: formatMinutes(item.cumartesiDakika),
      pazarFormatli: formatMinutes(item.pazarDakika),
      sarkanFormatli: formatMinutes(item.sarkanDakika),
      toplamMesaiFormatli: formatMinutes(item.toplamMesaiDakika),
    }));

    // Filter by dayType for final list view
    let finalShifts = dateFiltered;
    if (dayType === 'CUMARTESI') {
      finalShifts = dateFiltered.filter((s) => s.isSaturday);
    } else if (dayType === 'PAZAR') {
      finalShifts = dateFiltered.filter((s) => s.isSunday);
    } else if (dayType === 'HAFTA_ICI') {
      finalShifts = dateFiltered.filter((s) => s.isWeekday);
    }

    // Return descending by date (newest first)
    finalShifts.sort((a, b) => {
      if (a.tarih !== b.tarih) return b.tarih.localeCompare(a.tarih);
      return (b.baslama_saati || '').localeCompare(a.baslama_saati || '');
    });

    return NextResponse.json({
      success: true,
      shifts: finalShifts,
      activeShift,
      availableMonths,
      monthlyBreakdown,
      stats: {
        toplamMesaiDakika,
        toplamMesaiFormatli: formatMinutes(toplamMesaiDakika),
        haftaIciMesaiDakika,
        haftaIciMesaiFormatli: formatMinutes(haftaIciMesaiDakika),
        haftaIciNormalDakika,
        haftaIciNormalFormatli: formatMinutes(haftaIciNormalDakika),
        haftaIciGunSayisi,
        cumartesiDakika,
        cumartesiFormatli: formatMinutes(cumartesiDakika),
        cumartesiGunSayisi,
        pazarDakika,
        pazarFormatli: formatMinutes(pazarDakika),
        pazarGunSayisi,
        toplamSarkanDakika,
        toplamSarkanFormatli: formatMinutes(toplamSarkanDakika),
        toplamTorba,
        toplamHane,
        tamamlananGunSayisi,
        toplamKayit: finalShifts.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/shifts - Start, End, or Create shift record
export async function POST(request: NextRequest) {
  try {
    const { workShifts: shiftsCol, deliveryHistory: histCol } = await getDbCollections();
    const body = await request.json();
    const { action, personel_adi, baslama_saati, bitis_saati, tarih, mahalleler, notlar, shiftId } = body;

    const now = new Date();
    const localToday = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nowStr = now.toLocaleString('tr-TR');

    if (action === 'START') {
      if (!personel_adi) {
        return NextResponse.json({ success: false, error: 'Personel adı zorunludur' }, { status: 400 });
      }

      const shiftDate = tarih || localToday;

      // Check if already active
      const existing = await shiftsCol.findOne({
        personel_adi,
        tarih: shiftDate,
        durum: 'DEVAM_EDIYOR',
      });

      if (existing) {
        return NextResponse.json({
          success: true,
          message: 'Bu personel için zaten aktif bir mesai bulunmaktadır.',
          shift: mapDoc(existing),
        });
      }

      const startTime = baslama_saati || localTime;

      const newDoc = {
        personel_adi,
        tarih: shiftDate,
        baslama_saati: startTime,
        bitis_saati: null,
        toplam_dakika: 0,
        durum: 'DEVAM_EDIYOR',
        mahalleler: '',
        teslim_edilen_torba: 0,
        teslim_edilen_hane: 0,
        notlar: notlar || null,
        created_at: nowStr,
        updated_at: nowStr,
      };

      // Encrypt shift with AES-256-GCM
      const encryptedDoc = encryptShift(newDoc);
      const result = await shiftsCol.insertOne(encryptedDoc);
      const inserted = await shiftsCol.findOne({ _id: result.insertedId });

      await recordActivityLog({
        kullanici_adi: personel_adi,
        kullanici_rolu: 'PERSONEL',
        islem_tipi: 'MESAI_BASLAT',
        baslik: 'Günlük Dağıtım Mesaisi Başlatıldı',
        detay: `${personel_adi} tarafından saat ${startTime} itibarıyla mesai başlatıldı.`,
        ek_bilgi: { shiftDate, startTime },
      });

      return NextResponse.json({
        success: true,
        message: 'Kömür dağıtım mesaisi başarıyla başlatıldı.',
        shift: mapDoc(inserted),
      });
    }

    if (action === 'END') {
      let targetShift: any = null;

      if (shiftId) {
        targetShift = await shiftsCol.findOne(buildIdFilter(shiftId));
      } else if (personel_adi) {
        const rawActiveList = await shiftsCol.find({ durum: 'DEVAM_EDIYOR' }).toArray();
        const activeList = mapDocs(rawActiveList);
        const match = activeList.find((s: any) => s.personel_adi?.toLowerCase() === personel_adi.trim().toLowerCase());
        if (match) targetShift = await shiftsCol.findOne(buildIdFilter(match.id));
      }

      if (!targetShift) {
        return NextResponse.json({ success: false, error: 'Sonlandırılacak aktif mesai kaydı bulunamadı.' }, { status: 404 });
      }

      // Check shift ownership if non-admin
      const callerRole = request.headers.get('x-user-role') || body.callerRole;
      const callerName = request.headers.get('x-user-name') || body.callerName;

      if (callerRole && callerRole !== 'ADMIN' && callerName) {
        if (targetShift.personel_adi?.trim().toLowerCase() !== callerName.trim().toLowerCase()) {
          return NextResponse.json(
            { success: false, error: 'Yetkisiz işlem! Personeller sadece kendi mesailerini sonlandırabilir.' },
            { status: 403 }
          );
        }
      }

      const startTime = baslama_saati || targetShift.baslama_saati || '08:30';
      const endTime = bitis_saati || localTime;
      const totalMinutes = calculateMinutes(startTime, endTime);

      // Auto-aggregate deliveries performed by this staff on that day from delivery_history
      const deliveries = await histCol
        .find({
          personel: { $regex: new RegExp(`^${targetShift.personel_adi.trim()}$`, 'i') },
          gun_tarihi: targetShift.tarih,
          islem_tipi: 'TESLIMAT',
        })
        .toArray();

      let finalTorba = 0;
      const uniqueTc = new Set<string>();
      const uniqueMahalle = new Set<string>();

      for (const d of deliveries) {
        finalTorba += Number(d.torba_sayisi || 0);
        if (d.tc_no) uniqueTc.add(d.tc_no);
        if (d.mahalle) uniqueMahalle.add(d.mahalle);
      }

      const finalHane = uniqueTc.size;
      const finalMahalleler = mahalleler || Array.from(uniqueMahalle).join(', ');

      const updateFilter = targetShift._id ? { _id: targetShift._id } : buildIdFilter(targetShift.id);

      await shiftsCol.updateOne(updateFilter, {
        $set: {
          baslama_saati: startTime,
          bitis_saati: endTime,
          toplam_dakika: totalMinutes,
          durum: 'TAMAMLANDI',
          mahalleler: finalMahalleler,
          teslim_edilen_torba: finalTorba,
          teslim_edilen_hane: finalHane,
          notlar: notlar || targetShift.notlar,
          updated_at: nowStr,
        },
      });

      await recordActivityLog({
        kullanici_adi: targetShift.personel_adi,
        kullanici_rolu: 'PERSONEL',
        islem_tipi: 'MESAI_BITIR',
        baslik: 'Günlük Dağıtım Mesaisi Tamamlandı',
        detay: `${targetShift.personel_adi} mesaiyi tamamladı (${startTime} - ${endTime}, ${formatMinutes(totalMinutes)}). Toplam ${finalTorba} torba kömür, ${finalHane} haneye teslim edildi. Mahalleler: ${finalMahalleler || 'Merkez'}`,
        ek_bilgi: { totalMinutes, finalTorba, finalHane, finalMahalleler },
      });

      const completedShift = await shiftsCol.findOne(updateFilter);

      return NextResponse.json({
        success: true,
        message: 'Kömür dağıtım mesaisi başarıyla tamamlandı ve kaydedildi.',
        shift: mapDoc(completedShift),
      });
    }

    if (action === 'CREATE') {
      if (!personel_adi || !tarih || !baslama_saati || !bitis_saati) {
        return NextResponse.json(
          { success: false, error: 'Personel, tarih, başlama ve bitiş saatleri zorunludur' },
          { status: 400 }
        );
      }

      const totalMinutes = calculateMinutes(baslama_saati, bitis_saati);

      const newDoc = {
        personel_adi,
        tarih,
        baslama_saati,
        bitis_saati,
        toplam_dakika: totalMinutes,
        durum: 'TAMAMLANDI',
        mahalleler: mahalleler || '',
        teslim_edilen_torba: body.teslim_edilen_torba || 0,
        teslim_edilen_hane: body.teslim_edilen_hane || 0,
        notlar: notlar || null,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const result = await shiftsCol.insertOne(newDoc);
      const inserted = await shiftsCol.findOne({ _id: result.insertedId });

      return NextResponse.json({
        success: true,
        message: 'Mesai kaydı başarıyla eklendi.',
        shift: mapDoc(inserted),
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem (action)' }, { status: 400 });
  } catch (error: any) {
    console.error('Error saving shift:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT /api/shifts - Update shift details
export async function PUT(request: NextRequest) {
  try {
    const { workShifts: shiftsCol } = await getDbCollections();
    const body = await request.json();
    const { id, personel_adi, tarih, baslama_saati, bitis_saati, mahalleler, teslim_edilen_torba, teslim_edilen_hane, notlar, durum } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Mesai ID zorunludur' }, { status: 400 });
    }

    const callerRole = request.headers.get('x-user-role') || body.callerRole;
    const callerName = request.headers.get('x-user-name') || body.callerName;

    const existingShift = await shiftsCol.findOne(buildIdFilter(id));
    if (!existingShift) {
      return NextResponse.json({ success: false, error: 'Mesai kaydı bulunamadı' }, { status: 404 });
    }

    if (callerRole && callerRole !== 'ADMIN' && callerName) {
      if (existingShift.personel_adi?.trim().toLowerCase() !== callerName.trim().toLowerCase()) {
        return NextResponse.json(
          { success: false, error: 'Yetkisiz işlem! Personeller diğer personellerin mesai kayıtlarını değiştiremez.' },
          { status: 403 }
        );
      }
    }

    let totalMinutes = 0;
    if (baslama_saati && bitis_saati) {
      totalMinutes = calculateMinutes(baslama_saati, bitis_saati);
    }

    const updateFields: any = {
      updated_at: new Date().toLocaleString('tr-TR'),
    };

    if (personel_adi) updateFields.personel_adi = personel_adi;
    if (tarih) updateFields.tarih = tarih;
    if (baslama_saati) updateFields.baslama_saati = baslama_saati;
    if (bitis_saati) updateFields.bitis_saati = bitis_saati;
    if (totalMinutes > 0) updateFields.toplam_dakika = totalMinutes;
    if (durum) updateFields.durum = durum;
    if (mahalleler !== undefined) updateFields.mahalleler = mahalleler;
    if (teslim_edilen_torba !== undefined) updateFields.teslim_edilen_torba = teslim_edilen_torba;
    if (teslim_edilen_hane !== undefined) updateFields.teslim_edilen_hane = teslim_edilen_hane;
    if (notlar !== undefined) updateFields.notlar = notlar;

    await shiftsCol.updateOne(buildIdFilter(id), { $set: updateFields });
    const updated = await shiftsCol.findOne(buildIdFilter(id));

    return NextResponse.json({
      success: true,
      message: 'Mesai kaydı güncellendi.',
      shift: mapDoc(updated),
    });
  } catch (error: any) {
    console.error('Error updating shift:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/shifts - Delete shift
export async function DELETE(request: NextRequest) {
  try {
    const { workShifts: shiftsCol } = await getDbCollections();
    const body = await request.json();
    const { id, callerRole } = body;
    const reqRole = request.headers.get('x-user-role') || callerRole;

    if (reqRole && reqRole !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz işlem! Mesai kayıtlarını sadece Sistem Yöneticisi silebilir.' },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Mesai ID zorunludur' }, { status: 400 });
    }

    await shiftsCol.deleteOne(buildIdFilter(id));

    return NextResponse.json({
      success: true,
      message: 'Mesai kaydı silindi.',
    });
  } catch (error: any) {
    console.error('Error deleting shift:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
