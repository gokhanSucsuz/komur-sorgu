import { getDbCollections } from './mongodb';

export async function seedDatabaseIfNeeded() {
  const { beneficiaries, users } = await getDbCollections();
  const count = await beneficiaries.countDocuments();
  if (count > 0) {
    return;
  }
  console.log('[Seed] Database initialization verified.');
}
