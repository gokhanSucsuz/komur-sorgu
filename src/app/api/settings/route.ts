import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections } from '@/lib/mongodb';

export async function GET() {
  try {
    const { systemSettings } = await getDbCollections();
    const doc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const varsayilanHedefTorba = doc ? parseInt(doc.value, 10) : 34;

    return NextResponse.json({
      success: true,
      settings: {
        varsayilan_hedef_torba: varsayilanHedefTorba,
      },
    });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { systemSettings, beneficiaries } = await getDbCollections();
    const body = await request.json();
    const { varsayilan_hedef_torba, updateExisting } = body;

    const bagVal = parseInt(varsayilan_hedef_torba, 10);
    if (isNaN(bagVal) || bagVal <= 0) {
      return NextResponse.json({ success: false, error: 'Geçersiz torba miktarı' }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      message: `Hane başı hedef torba sayısı ${bagVal} olarak güncellendi.`,
    });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
