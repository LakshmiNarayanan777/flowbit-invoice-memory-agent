import { getSupabaseClient, addAuditEntry } from './database';
import { VendorMemory, CorrectionMemory, ResolutionMemory, Invoice } from './types';

export class MemoryService {
  private supabase = getSupabaseClient();

  async recallVendorMemory(vendor: string, patternType?: string): Promise<VendorMemory[]> {
    let query = this.supabase
      .from('vendor_memory')
      .select('*')
      .eq('vendor', vendor)
      .gte('confidence', 0.3)
      .order('confidence', { ascending: false });

    if (patternType) {
      query = query.eq('pattern_type', patternType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error recalling vendor memory:', error);
      return [];
    }

    return data || [];
  }

  async recallCorrectionMemory(vendor?: string): Promise<CorrectionMemory[]> {
    let query = this.supabase
      .from('correction_memory')
      .select('*')
      .gte('confidence', 0.3)
      .order('confidence', { ascending: false });

    if (vendor) {
      query = query.or(`vendor.eq.${vendor},vendor.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error recalling correction memory:', error);
      return [];
    }

    return data || [];
  }

  async recallResolutionMemory(vendor: string, issueType?: string): Promise<ResolutionMemory[]> {
    let query = this.supabase
      .from('resolution_memory')
      .select('*')
      .eq('vendor', vendor)
      .order('created_at', { ascending: false })
      .limit(10);

    if (issueType) {
      query = query.eq('issue_type', issueType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error recalling resolution memory:', error);
      return [];
    }

    return data || [];
  }

  async storeVendorMemory(memory: Omit<VendorMemory, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const { data: existing } = await this.supabase
      .from('vendor_memory')
      .select('*')
      .eq('vendor', memory.vendor)
      .eq('pattern_type', memory.pattern_type)
      .eq('pattern_key', memory.pattern_key)
      .maybeSingle();

    if (existing) {
      await this.supabase
        .from('vendor_memory')
        .update({
          pattern_value: memory.pattern_value,
          confidence: memory.confidence,
          times_applied: existing.times_applied + memory.times_applied,
          times_successful: existing.times_successful + memory.times_successful,
          times_failed: existing.times_failed + memory.times_failed,
          last_applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await this.supabase.from('vendor_memory').insert({
        ...memory,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  async storeCorrectionMemory(memory: Omit<CorrectionMemory, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    await this.supabase.from('correction_memory').insert({
      ...memory,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  async storeResolutionMemory(memory: Omit<ResolutionMemory, 'id' | 'created_at'>): Promise<void> {
    await this.supabase.from('resolution_memory').insert({
      ...memory,
      created_at: new Date().toISOString()
    });
  }

  async reinforceMemory(memoryId: string, table: string, successful: boolean): Promise<void> {
    const { data: memory } = await this.supabase
      .from(table)
      .select('*')
      .eq('id', memoryId)
      .single();

    if (!memory) return;

    const timesSuccessful = successful ? memory.times_successful + 1 : memory.times_successful;
    const timesFailed = successful ? memory.times_failed : memory.times_failed + 1;
    const timesApplied = memory.times_applied + 1;

    const successRate = timesSuccessful / timesApplied;
    let newConfidence = memory.confidence;

    if (successful) {
      newConfidence = Math.min(0.95, memory.confidence + 0.1 * (1 - memory.confidence));
    } else {
      newConfidence = Math.max(0.1, memory.confidence - 0.15);
    }

    await this.supabase
      .from(table)
      .update({
        confidence: newConfidence,
        times_applied: timesApplied,
        times_successful: timesSuccessful,
        times_failed: timesFailed,
        updated_at: new Date().toISOString()
      })
      .eq('id', memoryId);
  }

  async detectDuplicate(invoice: Invoice): Promise<Invoice | null> {
    const { data: processed } = await this.supabase
      .from('processed_invoices')
      .select('*')
      .eq('vendor', invoice.vendor)
      .neq('invoice_id', invoice.invoiceId);

    if (!processed || processed.length === 0) return null;

    for (const existing of processed) {
      const existingData = existing.original_data;
      const invoiceDate = new Date(invoice.fields.invoiceDate);
      const existingDate = new Date(existingData.fields.invoiceDate);
      const daysDiff = Math.abs((invoiceDate.getTime() - existingDate.getTime()) / (1000 * 60 * 60 * 24));

      if (
        existingData.fields.invoiceNumber === invoice.fields.invoiceNumber &&
        daysDiff <= 7
      ) {
        return existingData;
      }
    }

    return null;
  }
}
