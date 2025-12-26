import { MemoryService } from './memory-service';
import { addAuditEntry } from './database';
import { HumanCorrection, Invoice, ProcessingResult } from './types';

export class LearningEngine {
  private memoryService: MemoryService;

  constructor() {
    this.memoryService = new MemoryService();
  }

  async learnFromCorrection(
    invoice: Invoice,
    correction: HumanCorrection,
    processingResult: ProcessingResult
  ): Promise<string[]> {
    const updates: string[] = [];

    await addAuditEntry(invoice.invoiceId, 'learn', 'processing_correction', {
      vendor: correction.vendor,
      correctionCount: correction.corrections.length,
      decision: correction.finalDecision
    });

    for (const corr of correction.corrections) {
      if (corr.field === 'serviceDate' && corr.from === null) {
        await this.learnServiceDateMapping(invoice, corr);
        updates.push(`Learned: ${correction.vendor} uses "Leistungsdatum" for serviceDate`);
      }

      if (corr.field === 'taxTotal' && corr.reason.toLowerCase().includes('vat included')) {
        await this.learnVatIncludedPattern(invoice);
        updates.push(`Learned: ${correction.vendor} includes VAT in stated totals`);
      }

      if (corr.field === 'grossTotal' && corr.reason.toLowerCase().includes('vat included')) {
        await this.learnVatIncludedPattern(invoice);
        updates.push(`Learned: ${correction.vendor} includes VAT in stated totals`);
      }

      if (corr.field === 'currency' && corr.from === null) {
        await this.learnCurrencyRecovery(invoice, corr);
        updates.push(`Learned: ${correction.vendor} currency can be recovered from rawText`);
      }

      if (corr.field === 'poNumber' && corr.from === null) {
        await this.learnPoMatching(invoice, corr);
        updates.push(`Learned: PO matching pattern for ${correction.vendor}`);
      }

      if (corr.field === 'discountTerms' || corr.reason.toLowerCase().includes('skonto')) {
        await this.learnDiscountTerms(invoice, corr);
        updates.push(`Learned: ${correction.vendor} discount terms pattern`);
      }

      if (corr.field.includes('lineItems') && corr.field.includes('sku')) {
        await this.learnSkuMapping(invoice, corr);
        updates.push(`Learned: SKU mapping for ${correction.vendor}`);
      }
    }

    await this.memoryService.storeResolutionMemory({
      invoice_id: invoice.invoiceId,
      vendor: correction.vendor,
      issue_type: this.categorizeIssue(correction.corrections),
      issue_description: correction.corrections.map(c => c.field).join(', '),
      human_action: correction.finalDecision,
      correction_applied: correction.corrections,
      context: {
        confidence: processingResult.confidenceScore,
        proposedCorrections: processingResult.proposedCorrections
      }
    });

    await addAuditEntry(invoice.invoiceId, 'learn', 'stored_learnings', {
      updateCount: updates.length,
      updates
    });

    return updates;
  }

  private async learnServiceDateMapping(invoice: Invoice, correction: any): Promise<void> {
    await this.memoryService.storeVendorMemory({
      vendor: invoice.vendor,
      pattern_type: 'field_mapping',
      pattern_key: 'serviceDate',
      pattern_value: {
        source: 'Leistungsdatum',
        target: 'serviceDate',
        example: correction.to
      },
      confidence: 0.7,
      times_applied: 0,
      times_successful: 1,
      times_failed: 0
    });
  }

  private async learnVatIncludedPattern(invoice: Invoice): Promise<void> {
    await this.memoryService.storeVendorMemory({
      vendor: invoice.vendor,
      pattern_type: 'tax_behavior',
      pattern_key: 'vat_included',
      pattern_value: {
        behavior: 'vat_already_included',
        indicators: ['incl', 'inkl', 'included'],
        recalculation: 'gross_to_net'
      },
      confidence: 0.7,
      times_applied: 0,
      times_successful: 1,
      times_failed: 0
    });
  }

  private async learnCurrencyRecovery(invoice: Invoice, correction: any): Promise<void> {
    await this.memoryService.storeVendorMemory({
      vendor: invoice.vendor,
      pattern_type: 'field_mapping',
      pattern_key: 'currency_from_text',
      pattern_value: {
        currency: correction.to,
        pattern: 'text_extraction'
      },
      confidence: 0.6,
      times_applied: 0,
      times_successful: 1,
      times_failed: 0
    });
  }

  private async learnPoMatching(invoice: Invoice, correction: any): Promise<void> {
    await this.memoryService.storeCorrectionMemory({
      vendor: invoice.vendor,
      correction_type: 'po_matching',
      condition: {
        missing_po: true,
        has_line_items: true
      },
      correction_action: {
        strategy: 'match_by_vendor_date_items',
        max_days_diff: 30
      },
      confidence: 0.65,
      times_applied: 0,
      times_successful: 1,
      source_invoice_ids: [invoice.invoiceId]
    });
  }

  private async learnDiscountTerms(invoice: Invoice, correction: any): Promise<void> {
    const skontoMatch = invoice.rawText.match(/(\d+%\s*[Ss]konto.*?\d+\s*days)/);
    const terms = skontoMatch ? skontoMatch[1] : correction.to;

    await this.memoryService.storeVendorMemory({
      vendor: invoice.vendor,
      pattern_type: 'discount_terms',
      pattern_key: 'skonto',
      pattern_value: {
        terms: terms,
        detection: 'rawText_pattern'
      },
      confidence: 0.75,
      times_applied: 0,
      times_successful: 1,
      times_failed: 0
    });
  }

  private async learnSkuMapping(invoice: Invoice, correction: any): Promise<void> {
    const itemIndex = parseInt(correction.field.match(/\[(\d+)\]/)?.[1] || '0');
    const item = invoice.fields.lineItems[itemIndex];

    if (item && item.description) {
      await this.memoryService.storeVendorMemory({
        vendor: invoice.vendor,
        pattern_type: 'sku_mapping',
        pattern_key: `desc_to_sku_${correction.to}`,
        pattern_value: {
          description: item.description,
          sku: correction.to
        },
        confidence: 0.7,
        times_applied: 0,
        times_successful: 1,
        times_failed: 0
      });
    }
  }

  private categorizeIssue(corrections: any[]): string {
    const fields = corrections.map(c => c.field);

    if (fields.some(f => f.includes('tax') || f.includes('Total'))) {
      return 'tax_calculation';
    }
    if (fields.some(f => f === 'serviceDate')) {
      return 'missing_field';
    }
    if (fields.some(f => f === 'currency')) {
      return 'missing_field';
    }
    if (fields.some(f => f === 'poNumber')) {
      return 'po_matching';
    }
    if (fields.some(f => f.includes('lineItems'))) {
      return 'line_item_mapping';
    }

    return 'general_correction';
  }
}
