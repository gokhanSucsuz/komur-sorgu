'use client';

/**
 * SignatureQueueManager
 *
 * Sahada personeller art arda "İmza Al" veya "İmza İptal" butonlarına bastığında:
 * 1. UI anında (0ms) güncellenir (Optimistic UI).
 * 2. Tıklamalar biriktirilir (Debounce ~400ms).
 * 3. Çoklu tıklamalar tek bir HTTP çağrısıyla (BULK_SIGN) veritabanına gönderilir.
 * 4. Veritabanından tüm listeyi (5.000+ kayıt) baştan indirmeyi ENGELLER.
 * 5. Sunucudan dönen `syncTime` kaydedilir, böylece sync pulse kendi cihazımızı gereksiz yere tetiklemez.
 * 6. Ağ ve veritabanı (MongoDB Atlas) kotalarını maksimum düzeyde korur.
 */

export interface QueuedSignatureItem {
  beneficiary_id: string;
  imza_durumu: 'IMZALANDI' | 'BEKLIYOR';
  imza_alan_personel?: string;
  notlar?: string;
  previousState?: 'IMZALANDI' | 'BEKLIYOR';
  timestamp: number;
}

type OptimisticUpdateCallback = (item: QueuedSignatureItem) => void;
type SyncTimeCallback = (syncTime: string) => void;
type ErrorCallback = (failedItem: QueuedSignatureItem, error: any) => void;

class SignatureQueueManager {
  private queue: Map<string, QueuedSignatureItem> = new Map();
  private debounceTimer: any = null;
  private isProcessing = false;
  private optimisticCallback: OptimisticUpdateCallback | null = null;
  private syncTimeCallback: SyncTimeCallback | null = null;
  private errorCallback: ErrorCallback | null = null;

  public setCallbacks(
    onOptimistic: OptimisticUpdateCallback,
    onSyncTime: SyncTimeCallback,
    onError: ErrorCallback
  ) {
    this.optimisticCallback = onOptimistic;
    this.syncTimeCallback = onSyncTime;
    this.errorCallback = onError;
  }

  /**
   * Yeni bir imza işlemini kuyruğa ekler ve optimistik olarak UI'ı tetikler.
   */
  public enqueue(item: Omit<QueuedSignatureItem, 'timestamp'>) {
    const fullItem: QueuedSignatureItem = {
      ...item,
      timestamp: Date.now()
    };

    // 1. Kuyruğa ekle (aynı id varsa üzerine yaz - son tık geçerli olsun)
    this.queue.set(fullItem.beneficiary_id, fullItem);

    // 2. Anında yerel state'i güncelle (0 ms gecikme)
    if (this.optimisticCallback) {
      try {
        this.optimisticCallback(fullItem);
      } catch (err) {
        console.error('Optimistic signature update error:', err);
      }
    }

    // 3. Debounce ile gönderimi planla (400ms bekle)
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processQueue();
    }, 400);
  }

  /**
   * Kuyruktaki tüm bekleyen işlemleri toplu veya sıralı olarak sunucuya aktarır.
   */
  public async processQueue() {
    if (this.isProcessing || this.queue.size === 0) return;

    this.isProcessing = true;
    const itemsToProcess = Array.from(this.queue.values());
    this.queue.clear();

    try {
      // İşlemleri durumuna göre grupla (IMZALANDI olanlar toplu gönderilebilir)
      const signedItems = itemsToProcess.filter((i) => i.imza_durumu === 'IMZALANDI');
      const resetItems = itemsToProcess.filter((i) => i.imza_durumu === 'BEKLIYOR');

      // 1. Çoklu İmzalar (BULK_SIGN)
      if (signedItems.length > 1) {
        try {
          const res = await fetch('/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'BULK_SIGN',
              beneficiary_ids: signedItems.map((i) => i.beneficiary_id),
              imza_durumu: 'IMZALANDI',
              imza_alan_personel: signedItems[0]?.imza_alan_personel || 'İmza Ekibi'
            })
          });
          const data = await res.json();
          if (data.success && data.syncTime && this.syncTimeCallback) {
            this.syncTimeCallback(data.syncTime);
          } else if (!data.success) {
            // Hata durumunda rollback
            signedItems.forEach((item) => {
              this.errorCallback?.(item, new Error(data.error || 'Toplu imza kaydedilemedi'));
            });
          }
        } catch (err) {
          signedItems.forEach((item) => {
            this.errorCallback?.(item, err);
          });
        }
      } else if (signedItems.length === 1) {
        // Tekil İmza (SIGN_BENEFICIARY)
        const single = signedItems[0];
        try {
          const res = await fetch('/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'SIGN_BENEFICIARY',
              beneficiary_id: single.beneficiary_id,
              imza_durumu: 'IMZALANDI',
              imza_alan_personel: single.imza_alan_personel || 'İmza Ekibi',
              notlar: single.notlar || ''
            })
          });
          const data = await res.json();
          if (data.success && data.syncTime && this.syncTimeCallback) {
            this.syncTimeCallback(data.syncTime);
          } else if (!data.success) {
            this.errorCallback?.(single, new Error(data.error || 'İmza kaydedilemedi'));
          }
        } catch (err) {
          this.errorCallback?.(single, err);
        }
      }

      // 2. Sıfırlama (İmza İptal) İşlemleri
      for (const item of resetItems) {
        try {
          const res = await fetch('/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'SIGN_BENEFICIARY',
              beneficiary_id: item.beneficiary_id,
              imza_durumu: 'BEKLIYOR',
              imza_alan_personel: null,
              notlar: ''
            })
          });
          const data = await res.json();
          if (data.success && data.syncTime && this.syncTimeCallback) {
            this.syncTimeCallback(data.syncTime);
          } else if (!data.success) {
            this.errorCallback?.(item, new Error(data.error || 'İmza durumu sıfırlanamadı'));
          }
        } catch (err) {
          this.errorCallback?.(item, err);
        }
      }
    } finally {
      this.isProcessing = false;
      // Eğer işlem sırasında yeni tıklamalar geldiyse onları da işle
      if (this.queue.size > 0) {
        this.processQueue();
      }
    }
  }

  public getPendingCount(): number {
    return this.queue.size;
  }

  public clear() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.queue.clear();
  }
}

export const signatureQueue = new SignatureQueueManager();
