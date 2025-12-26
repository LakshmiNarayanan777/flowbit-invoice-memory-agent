import { getSupabaseClient } from './database';
import { DecisionEngine } from './decision-engine';
import { LearningEngine } from './learning-engine';
import {
  Invoice,
  ProcessingResult,
  PurchaseOrder,
  DeliveryNote,
  HumanCorrection
} from './types';

export class InvoiceProcessor {
  private supabase = getSupabaseClient();
  private decisionEngine: DecisionEngine;
  private learningEngine: LearningEngine;

  constructor() {
    this.decisionEngine = new DecisionEngine();
    this.learningEngine = new LearningEngine();
  }

  async processInvoice(
    invoice: Invoice,
    purchaseOrders: PurchaseOrder[],
    deliveryNotes: DeliveryNote[]
  ): Promise<ProcessingResult> {
    const result = await this.decisionEngine.processInvoice(
      invoice,
      purchaseOrders,
      deliveryNotes
    );

    await this.supabase.from('processed_invoices').insert({
      invoice_id: invoice.invoiceId,
      vendor: invoice.vendor,
      original_data: invoice,
      normalized_data: result.normalizedInvoice,
      proposed_corrections: result.proposedCorrections,
      requires_human_review: result.requiresHumanReview,
      reasoning: result.reasoning,
      confidence_score: result.confidenceScore,
      processed_at: new Date().toISOString()
    });

    return result;
  }

  async applyHumanCorrection(
    invoice: Invoice,
    correction: HumanCorrection,
    processingResult: ProcessingResult
  ): Promise<string[]> {
    const updates = await this.learningEngine.learnFromCorrection(
      invoice,
      correction,
      processingResult
    );

    await this.supabase
      .from('processed_invoices')
      .update({
        final_decision: correction.finalDecision
      })
      .eq('invoice_id', invoice.invoiceId);

    return updates;
  }

  async getProcessingHistory(invoiceId: string): Promise<any> {
    const { data } = await this.supabase
      .from('processed_invoices')
      .select('*')
      .eq('invoice_id', invoiceId)
      .maybeSingle();

    return data;
  }

  async getAuditTrail(invoiceId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('audit_trail')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('timestamp', { ascending: true });

    return data || [];
  }

  async getMemoryStats(): Promise<any> {
    const { data: vendorMemory } = await this.supabase
      .from('vendor_memory')
      .select('*');

    const { data: correctionMemory } = await this.supabase
      .from('correction_memory')
      .select('*');

    const { data: resolutionMemory } = await this.supabase
      .from('resolution_memory')
      .select('*');

    return {
      vendorMemoryCount: vendorMemory?.length || 0,
      correctionMemoryCount: correctionMemory?.length || 0,
      resolutionMemoryCount: resolutionMemory?.length || 0,
      vendorMemory: vendorMemory || [],
      correctionMemory: correctionMemory || [],
      resolutionMemory: resolutionMemory || []
    };
  }

  async clearAllMemory(): Promise<void> {
    await this.supabase.from('processed_invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('vendor_memory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('correction_memory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('resolution_memory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await this.supabase.from('audit_trail').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }
}
