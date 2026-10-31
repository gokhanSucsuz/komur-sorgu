import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, mapDoc, buildIdFilter, recordActivityLog } from '@/lib/mongodb';
import { encryptShift, encryptField } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { serverError, asString, isSafeId } from '@/lib/security';

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

function areIntervalsOverlapping(startA: string, endA: string, startB: string, endB: string): boolean {
  if (!startA || !endA || !startB || !endB) return false;
  const sA = timeToMinutes(startA);
  let eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  let eB = timeToMinutes(endB);
  if (eA <= sA) eA += 24 * 60;
  if (eB <= sB) eB += 24 * 60;
  return Math.max(sA, sB) < Math.min(eA, eB);
}

// GET /api/shifts - List shifts, active shift & calculated overtime stats with carryover
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

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
    const dateFiltered = enrichedAll.filter((s) => {
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
    return serverError('shifts:GET', error);
  }
}

// POST /api/shifts - Start, End, or Create shift record
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    if (session.rol === 'MUDUR') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Yetki Sınırı: Müdür yetkilisi salt okunur modundadır, çalışma saatlerinde değişiklik yapamaz.' },
        { status: 403 }
      );
    }

    const { workShifts: shiftsCol, deliveryHistory: histCol } = await getDbCollections();
    const body = await request.json();
    const { action, personel_adi, baslama_saati, bitis_saati, tarih, mahalleler, notlar, shiftId } = body;

    const { nowLocaleTr, nowEnCa, nowTimeHHmm } = getIstanbulDate();
    const localToday = nowEnCa; // YYYY-MM-DD
    const localTime = nowTimeHHmm;
    const nowStr = nowLocaleTr;

    const sessionStaffName = (session.ad_soyad || session.username || '').trim();
    const isAdminSession = session.rol === 'ADMIN';

    if (action === 'START') {
      const targetStaff = isAdminSession ? (personel_adi || sessionStaffName).trim() : sessionStaffName;
      if (!targetStaff) {
        return NextResponse.json({ success: false, error: 'Personel adı zorunludur' }, { status: 400 });
      }

      if (!isAdminSession && personel_adi && personel_adi.trim().toLocaleLowerCase('tr-TR') !== sessionStaffName.toLocaleLowerCase('tr-TR')) {
        return NextResponse.json(
          { success: false, error: 'Yetkisiz işlem! Personeller yalnızca kendi adlarına mesai başlatabilir.' },
          { status: 403 }
        );
      }

      const shiftDate = tarih || localToday;

      // Check if already active (decrypt active shifts first because personel_adi is AES-GCM encrypted)
      const rawActiveOnDate = await shiftsCol.find({
        tarih: shiftDate,
        durum: 'DEVAM_EDIYOR',
      }).toArray();
      const existing = mapDocs(rawActiveOnDate).find(
        (s: any) => (s.personel_adi || '').trim().toLowerCase() === targetStaff.toLowerCase()
      );

      if (existing) {
        return NextResponse.json({
          success: true,
          message: 'Bu personel için zaten aktif bir mesai bulunmaktadır.',
          shift: existing,
        });
      }

      const startTime = baslama_saati || localTime;

      const newDoc = {
        personel_adi: targetStaff,
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
        kullanici_adi: sessionStaffName || targetStaff,
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: 'MESAI_BASLAT',
        baslik: 'Günlük Dağıtım Mesaisi Başlatıldı',
        detay: `${targetStaff} tarafından saat ${startTime} itibarıyla mesai başlatıldı.`,
        ek_bilgi: { shiftDate, startTime },
      });

      return NextResponse.json({
        success: true,
        message: 'Kömür dağıtım mesaisi başarıyla başlatıldı.',
        shift: mapDoc(inserted),
      });
    }

    if (action === 'END') {
      let rawTargetShift: any = null;

      if (shiftId) {
        rawTargetShift = await shiftsCol.findOne(buildIdFilter(shiftId));
      } else if (personel_adi) {
        const rawActiveList = await shiftsCol.find({ durum: 'DEVAM_EDIYOR' }).toArray();
        const activeList = mapDocs(rawActiveList);
        const match = activeList.find((s: any) => s.personel_adi?.toLowerCase() === personel_adi.trim().toLowerCase());
        if (match) rawTargetShift = await shiftsCol.findOne(buildIdFilter(match.id));
      }

      if (!rawTargetShift) {
        return NextResponse.json({ success: false, error: 'Sonlandırılacak aktif mesai kaydı bulunamadı.' }, { status: 404 });
      }

      const targetShift = mapDoc(rawTargetShift);

      // Strictly check shift ownership against server-verified session if non-admin
      if (!isAdminSession) {
        if ((targetShift.personel_adi || '').trim().toLocaleLowerCase('tr-TR') !== sessionStaffName.toLocaleLowerCase('tr-TR')) {
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
      const rawDeliveries = await histCol
        .find({
          gun_tarihi: targetShift.tarih,
          islem_tipi: { $in: ['TESLIMAT', 'EKSIK_TESLIMAT'] },
        })
        .toArray();
      const staffLower = (targetShift.personel_adi || '').trim().toLowerCase();
      const deliveries = mapDocs(rawDeliveries).filter(
        (d: any) => (d.personel || '').trim().toLowerCase() === staffLower
      );

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

      const updateFilter = rawTargetShift._id ? { _id: rawTargetShift._id } : buildIdFilter(targetShift.id);
      const finalNotesPlain = notlar !== undefined ? notlar : targetShift.notlar;

      await shiftsCol.updateOne(updateFilter, {
        $set: {
          baslama_saati: startTime,
          bitis_saati: endTime,
          toplam_dakika: totalMinutes,
          durum: 'TAMAMLANDI',
          mahalleler: finalMahalleler,
          teslim_edilen_torba: finalTorba,
          teslim_edilen_hane: finalHane,
          notlar: finalNotesPlain ? encryptField(String(finalNotesPlain)) : null,
          updated_at: nowStr,
        },
      });

      await recordActivityLog({
        kullanici_adi: targetShift.personel_adi,
        kullanici_rolu: 'PERSONEL',
        islem_tipi: 'MESAI_BITIR',
        baslik: 'Günlük Dağıtım Mesaisi Tamamlandı',
        detay: `${targetShift.personel_adi} mesaiyi tamamladı (${startTime} - ${endTime}, ${formatMinutes(totalMinutes)}). Toplam ${finalTorba} torba kömür, ${finalHane} haneye teslim edildi. Mahalleler: ${finalMahalleler || 'Belirtilmemiş'}`,
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
      const targetStaff = isAdminSession ? (personel_adi || '').trim() : sessionStaffName;
      if (!targetStaff || !tarih || !baslama_saati || !bitis_saati) {
        return NextResponse.json(
          { success: false, error: 'Personel adı, tarih, başlama ve bitiş saatleri zorunludur' },
          { status: 400 }
        );
      }

      if (!isAdminSession && personel_adi && personel_adi.trim().toLocaleLowerCase('tr-TR') !== sessionStaffName.toLocaleLowerCase('tr-TR')) {
        return NextResponse.json(
          { success: false, error: 'Yetkisiz işlem! Personeller yalnızca kendi çalışma saatlerini kaydedebilir.' },
          { status: 403 }
        );
      }

      const totalMinutes = body.toplam_dakika || calculateMinutes(baslama_saati, bitis_saati);

      // Aynı personele aynı günde çakışan saatlerde ikinci mesai girişini engelle
      const rawExistingShifts = await shiftsCol.find({
        tarih: tarih.trim(),
      }).toArray();
      const existingShifts = mapDocs(rawExistingShifts).filter(
        (s: any) => (s.personel_adi || '').trim().toLowerCase() === targetStaff.toLowerCase()
      );

      const conflictingShift = existingShifts.find((s: any) =>
        areIntervalsOverlapping(baslama_saati.trim(), bitis_saati.trim(), s.baslama_saati, s.bitis_saati)
      );

      if (conflictingShift) {
        return NextResponse.json(
          {
            success: false,
            error: `${targetStaff} için ${tarih} tarihinde aynı saatlere denk gelen (${conflictingShift.baslama_saati} - ${conflictingShift.bitis_saati}) bir mesai kaydı mevcuttur. Aynı güne çakışan saatlerde birden fazla mesai girişi yapılamaz.`
          },
          { status: 400 }
        );
      }

      const newDoc = {
        personel_adi: targetStaff,
        tarih: tarih.trim(),
        baslama_saati: baslama_saati.trim(),
        bitis_saati: bitis_saati.trim(),
        toplam_dakika: totalMinutes,
        durum: 'TAMAMLANDI',
        mahalleler: mahalleler ? mahalleler.trim() : '',
        teslim_edilen_torba: body.teslim_edilen_torba || 0,
        teslim_edilen_hane: body.teslim_edilen_hane || 0,
        notlar: notlar ? notlar.trim() : null,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const encryptedDoc = encryptShift(newDoc);
      const result = await shiftsCol.insertOne(encryptedDoc);
      const inserted = await shiftsCol.findOne({ _id: result.insertedId });

      await recordActivityLog({
        kullanici_adi: sessionStaffName || targetStaff,
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: 'MESAI_GIRIS',
        baslik: 'Günlük Çalışma Saati Kaydedildi',
        detay: `${targetStaff} için ${tarih} tarihine çalışma saati girildi: ${baslama_saati} - ${bitis_saati} (${formatMinutes(totalMinutes)}).`,
        ek_bilgi: { tarih, baslama_saati, bitis_saati, totalMinutes },
      });

      return NextResponse.json({
        success: true,
        message: 'Çalışma saati kaydı başarıyla eklendi.',
        shift: mapDoc(inserted),
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem (action)' }, { status: 400 });
  } catch (error: any) {
    return serverError('shifts:POST', error);
  }
}

// PUT /api/shifts - Update shift details
export async function PUT(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    if (session.rol === 'MUDUR') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Yetki Sınırı: Müdür yetkilisi salt okunur modundadır, çalışma saatlerinde değişiklik yapamaz.' },
        { status: 403 }
      );
    }

    const { workShifts: shiftsCol } = await getDbCollections();
    const body = await request.json();
    const { id, personel_adi, tarih, baslama_saati, bitis_saati, mahalleler, teslim_edilen_torba, teslim_edilen_hane, notlar, durum } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Mesai ID zorunludur' }, { status: 400 });
    }

    const rawExistingShift = await shiftsCol.findOne(buildIdFilter(id));
    if (!rawExistingShift) {
      return NextResponse.json({ success: false, error: 'Mesai kaydı bulunamadı' }, { status: 404 });
    }
    const existingShift = mapDoc(rawExistingShift);

    if (session.rol !== 'ADMIN') {
      const staffName = (existingShift.personel_adi || '').trim().toLowerCase();
      const userName = (session.ad_soyad || session.username || '').trim().toLowerCase();
      if (staffName !== userName) {
        return NextResponse.json(
          { success: false, error: 'Yetkisiz işlem! Personeller diğer personellerin mesai kayıtlarını değiştiremez.' },
          { status: 403 }
        );
      }
    }

    const targetDate = (tarih || existingShift.tarih || '').trim();
    const targetStaff = (personel_adi || existingShift.personel_adi || '').trim();
    const targetStart = (baslama_saati || existingShift.baslama_saati || '').trim();
    const targetEnd = (bitis_saati || existingShift.bitis_saati || '').trim();

    // Çakışan saat kontrolü (kendisi hariç aynı personel ve aynı gün)
    const rawExistingShifts = await shiftsCol.find({
      tarih: targetDate,
    }).toArray();
    const otherShifts = mapDocs(rawExistingShifts).filter(
      (s: any) =>
        String(s.id || s._id) !== String(id) &&
        (s.personel_adi || '').trim().toLowerCase() === targetStaff.toLowerCase()
    );

    const conflictingShift = otherShifts.find((s: any) =>
      areIntervalsOverlapping(targetStart, targetEnd, s.baslama_saati, s.bitis_saati)
    );

    if (conflictingShift) {
      return NextResponse.json(
        {
          success: false,
          error: `${targetStaff} için ${targetDate} tarihinde aynı saatlere denk gelen (${conflictingShift.baslama_saati} - ${conflictingShift.bitis_saati}) başka bir mesai kaydı mevcuttur. Çakışan saatlerde güncelleme yapılamaz.`
        },
        { status: 400 }
      );
    }

    let totalMinutes = 0;
    if (baslama_saati && bitis_saati) {
      totalMinutes = calculateMinutes(baslama_saati, bitis_saati);
    }

    const { nowLocaleTr } = getIstanbulDate();
    const updateFields: any = {
      updated_at: nowLocaleTr,
    };

    if (personel_adi) updateFields.personel_adi = encryptField(personel_adi.trim());
    if (tarih) updateFields.tarih = tarih;
    if (baslama_saati) updateFields.baslama_saati = baslama_saati;
    if (bitis_saati) updateFields.bitis_saati = bitis_saati;
    if (totalMinutes > 0) updateFields.toplam_dakika = totalMinutes;
    if (durum) updateFields.durum = durum;
    if (mahalleler !== undefined) updateFields.mahalleler = mahalleler;
    if (teslim_edilen_torba !== undefined) updateFields.teslim_edilen_torba = teslim_edilen_torba;
    if (teslim_edilen_hane !== undefined) updateFields.teslim_edilen_hane = teslim_edilen_hane;
    if (notlar !== undefined) updateFields.notlar = notlar ? encryptField(String(notlar).trim()) : null;

    await shiftsCol.updateOne(buildIdFilter(id), { $set: updateFields });
    const updated = await shiftsCol.findOne(buildIdFilter(id));

    return NextResponse.json({
      success: true,
      message: 'Çalışma saati kaydı güncellendi.',
      shift: mapDoc(updated),
    });
  } catch (error: any) {
    return serverError('shifts:PUT', error);
  }
}

// DELETE /api/shifts - Delete shift
export async function DELETE(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    if (session.rol === 'MUDUR') {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', error: 'Yetki Sınırı: Müdür yetkilisi salt okunur modundadır, çalışma saatlerinde değişiklik yapamaz.' },
        { status: 403 }
      );
    }

    const { workShifts: shiftsCol } = await getDbCollections();
    const body = await request.json();
    const id = asString(body.id, 64);

    if (!id || !isSafeId(id)) {
      return NextResponse.json({ success: false, error: 'Mesai ID zorunludur veya geçersiz' }, { status: 400 });
    }

    const rawExisting = await shiftsCol.findOne(buildIdFilter(id));
    if (!rawExisting) {
      return NextResponse.json({ success: false, error: 'Mesai kaydı bulunamadı' }, { status: 404 });
    }
    const existing = mapDoc(rawExisting);

    if (session.rol !== 'ADMIN') {
      const staffName = (existing.personel_adi || '').trim().toLowerCase();
      const userName = (session.ad_soyad || session.username || '').trim().toLowerCase();
      if (staffName !== userName) {
        return NextResponse.json(
          { success: false, error: 'Yetkisiz işlem! Personeller sadece kendi girdikleri çalışma saatlerini silebilir.' },
          { status: 403 }
        );
      }
    }

    await shiftsCol.deleteOne(buildIdFilter(id));

    return NextResponse.json({
      success: true,
      message: 'Çalışma saati kaydı silindi.',
    });
  } catch (error: any) {
    return serverError('shifts:DELETE', error);
  }
}
