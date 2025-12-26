import { MemoryService } from './memory-service';
import { addAuditEntry } from './database';
import {
  Invoice,
  ProcessingResult,
  PurchaseOrder,
  DeliveryNote,
  InvoiceFields,
  VendorMemory,
  CorrectionMemory
} from './types';

export class DecisionEngine {
  private memoryService: MemoryService;

  constructor() {
    this.memoryService = new MemoryService();
  }

  async processInvoice(
    invoice: Invoice,
    purchaseOrders: PurchaseOrder[],
    deliveryNotes: DeliveryNote[]
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      normalizedInvoice: { ...invoice.fields },
      proposedCorrections: [],
      requiresHumanReview: true,
      reasoning: '',
      confidenceScore: invoice.confidence,
      memoryUpdates: [],
      auditTrail: []
    };

    const reasoningParts: string[] = [];
    let totalConfidence = invoice.confidence;
    let confidenceFactors = 1;

    await addAuditEntry(invoice.invoiceId, 'recall', 'start_processing', {
      vendor: invoice.vendor,
      invoiceNumber: invoice.fields.invoiceNumber
    });

    const duplicate = await this.memoryService.detectDuplicate(invoice);
    if (duplicate) {
      result.requiresHumanReview = true;
      result.reasoning = `DUPLICATE DETECTED: Invoice ${invoice.fields.invoiceNumber} from ${invoice.vendor} appears to be a duplicate. Similar invoice already processed.`;
      result.confidenceScore = 0.0;

      await addAuditEntry(invoice.invoiceId, 'decide', 'duplicate_detected', {
        original: duplicate.invoiceId
      });

      return result;
    }

    const vendorMemories = await this.memoryService.recallVendorMemory(invoice.vendor);

    await addAuditEntry(invoice.invoiceId, 'recall', 'vendor_memory', {
      count: vendorMemories.length,
      patterns: vendorMemories.map(m => m.pattern_type)
    });

    for (const memory of vendorMemories) {
      if (memory.pattern_type === 'field_mapping' && memory.pattern_key === 'serviceDate') {
        const applied = this.applyServiceDateMapping(invoice, memory, result);
        if (applied) {
          reasoningParts.push(`Applied learned pattern: ${memory.pattern_key} from "${memory.pattern_value.source}" (confidence: ${memory.confidence.toFixed(2)})`);
          totalConfidence += memory.confidence;
          confidenceFactors++;
        }
      }

      if (memory.pattern_type === 'tax_behavior' && memory.pattern_key === 'vat_included') {
        const applied = this.applyVatIncludedCorrection(invoice, memory, result);
        if (applied) {
          reasoningParts.push(`Applied learned pattern: VAT already included in totals (confidence: ${memory.confidence.toFixed(2)})`);
          totalConfidence += memory.confidence;
          confidenceFactors++;
        }
      }

      if (memory.pattern_type === 'field_mapping' && memory.pattern_key === 'currency_from_text') {
        const applied = this.applyCurrencyRecovery(invoice, memory, result);
        if (applied) {
          reasoningParts.push(`Recovered currency from text: ${memory.pattern_value.currency} (confidence: ${memory.confidence.toFixed(2)})`);
          totalConfidence += memory.confidence;
          confidenceFactors++;
        }
      }

      if (memory.pattern_type === 'discount_terms') {
        const applied = this.applyDiscountTerms(invoice, memory, result);
        if (applied) {
          reasoningParts.push(`Detected known discount pattern: ${memory.pattern_value.terms} (confidence: ${memory.confidence.toFixed(2)})`);
          totalConfidence += memory.confidence;
          confidenceFactors++;
        }
      }

      if (memory.pattern_type === 'sku_mapping') {
        const applied = this.applySkuMapping(invoice, memory, result);
        if (applied) {
          reasoningParts.push(`Mapped description to SKU: ${memory.pattern_value.sku} (confidence: ${memory.confidence.toFixed(2)})`);
          totalConfidence += memory.confidence;
          confidenceFactors++;
        }
      }
    }

    if (!result.normalizedInvoice.poNumber) {
      const matchedPo = this.matchPurchaseOrder(invoice, purchaseOrders);
      if (matchedPo) {
        result.normalizedInvoice.poNumber = matchedPo.poNumber;
        result.proposedCorrections.push(`Matched to PO: ${matchedPo.poNumber}`);
        reasoningParts.push(`Auto-matched to purchase order ${matchedPo.poNumber} based on vendor, date proximity, and line items`);
        totalConfidence += 0.7;
        confidenceFactors++;
      }
    }

    const correctionMemories = await this.memoryService.recallCorrectionMemory(invoice.vendor);

    await addAuditEntry(invoice.invoiceId, 'recall', 'correction_memory', {
      count: correctionMemories.length
    });

    for (const memory of correctionMemories) {
      if (this.matchesCondition(invoice, memory.condition)) {
        this.applyCorrectionAction(invoice, memory.correction_action, result);
        reasoningParts.push(`Applied correction pattern: ${memory.correction_type} (confidence: ${memory.confidence.toFixed(2)})`);
        totalConfidence += memory.confidence;
        confidenceFactors++;
      }
    }

    const avgConfidence = totalConfidence / confidenceFactors;
    result.confidenceScore = Math.min(0.95, Math.max(0.0, avgConfidence));

    const CONFIDENCE_THRESHOLD = 0.75;
    const hasIssues = this.detectIssues(result.normalizedInvoice);

    if (result.confidenceScore >= CONFIDENCE_THRESHOLD && !hasIssues && result.proposedCorrections.length > 0) {
      result.requiresHumanReview = false;
      reasoningParts.push(`Confidence ${result.confidenceScore.toFixed(2)} exceeds threshold ${CONFIDENCE_THRESHOLD}. Auto-accepted with learned corrections.`);
    } else if (hasIssues) {
      result.requiresHumanReview = true;
      reasoningParts.push('Flagged for review: Missing critical fields or validation issues detected.');
    } else if (result.proposedCorrections.length === 0) {
      result.requiresHumanReview = true;
      reasoningParts.push('No learned patterns applied. Requires human review.');
    } else {
      result.requiresHumanReview = true;
      reasoningParts.push(`Confidence ${result.confidenceScore.toFixed(2)} below threshold ${CONFIDENCE_THRESHOLD}. Requires human review.`);
    }

    result.reasoning = reasoningParts.join(' | ');

    await addAuditEntry(invoice.invoiceId, 'decide', 'final_decision', {
      requiresReview: result.requiresHumanReview,
      confidence: result.confidenceScore,
      corrections: result.proposedCorrections.length
    });

    return result;
  }

  private applyServiceDateMapping(invoice: Invoice, memory: VendorMemory, result: ProcessingResult): boolean {
    if (result.normalizedInvoice.serviceDate) return false;

    const pattern = memory.pattern_value.source;
    const regex = new RegExp(pattern + ':\\s*([\\d.]+)', 'i');
    const match = invoice.rawText.match(regex);

    if (match) {
      const dateStr = match[1];
      result.normalizedInvoice.serviceDate = this.parseDate(dateStr);
      result.proposedCorrections.push(`Set serviceDate from ${pattern}: ${result.normalizedInvoice.serviceDate}`);
      return true;
    }

    return false;
  }

  private applyVatIncludedCorrection(invoice: Invoice, memory: VendorMemory, result: ProcessingResult): boolean {
    const vatIncludedPatterns = ['incl', 'inkl', 'included', 'already included'];
    const hasVatIncluded = vatIncludedPatterns.some(pattern =>
      invoice.rawText.toLowerCase().includes(pattern)
    );

    if (hasVatIncluded) {
      const grossTotal = result.normalizedInvoice.grossTotal;
      const taxRate = result.normalizedInvoice.taxRate;

      const netTotal = grossTotal / (1 + taxRate);
      const taxTotal = grossTotal - netTotal;

      result.normalizedInvoice.netTotal = Math.round(netTotal * 100) / 100;
      result.normalizedInvoice.taxTotal = Math.round(taxTotal * 100) / 100;

      result.proposedCorrections.push(`Recalculated VAT (included in total): net=${result.normalizedInvoice.netTotal}, tax=${result.normalizedInvoice.taxTotal}`);
      return true;
    }

    return false;
  }

  private applyCurrencyRecovery(invoice: Invoice, memory: VendorMemory, result: ProcessingResult): boolean {
    if (result.normalizedInvoice.currency) return false;

    const currencyPattern = /\b(EUR|USD|GBP|CHF)\b/i;
    const match = invoice.rawText.match(currencyPattern);

    if (match) {
      result.normalizedInvoice.currency = match[1].toUpperCase();
      result.proposedCorrections.push(`Recovered currency from text: ${result.normalizedInvoice.currency}`);
      return true;
    }

    return false;
  }

  private applyDiscountTerms(invoice: Invoice, memory: VendorMemory, result: ProcessingResult): boolean {
    const skontoPattern = /(\d+)%\s*skonto.*?(\d+)\s*days/i;
    const match = invoice.rawText.match(skontoPattern);

    if (match) {
      result.normalizedInvoice.discountTerms = memory.pattern_value.terms;
      result.proposedCorrections.push(`Added discount terms: ${memory.pattern_value.terms}`);
      return true;
    }

    return false;
  }

  private applySkuMapping(invoice: Invoice, memory: VendorMemory, result: ProcessingResult): boolean {
    let applied = false;

    for (let i = 0; i < result.normalizedInvoice.lineItems.length; i++) {
      const item = result.normalizedInvoice.lineItems[i];

      if (!item.sku && item.description) {
        const descLower = item.description.toLowerCase();
        const memoryDesc = memory.pattern_value.description.toLowerCase();

        if (descLower.includes(memoryDesc) || memoryDesc.includes(descLower)) {
          result.normalizedInvoice.lineItems[i].sku = memory.pattern_value.sku;
          result.proposedCorrections.push(`Mapped "${item.description}" to SKU ${memory.pattern_value.sku}`);
          applied = true;
        }
      }
    }

    return applied;
  }

  private matchPurchaseOrder(invoice: Invoice, purchaseOrders: PurchaseOrder[]): PurchaseOrder | null {
    const vendorPOs = purchaseOrders.filter(po => po.vendor === invoice.vendor);

    if (vendorPOs.length === 0) return null;

    const invoiceDate = new Date(invoice.fields.invoiceDate);

    for (const po of vendorPOs) {
      const poDate = new Date(po.date);
      const daysDiff = (invoiceDate.getTime() - poDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff >= 0 && daysDiff <= 30) {
        const itemMatch = invoice.fields.lineItems.some(invItem =>
          po.lineItems.some(poItem => poItem.sku === invItem.sku)
        );

        if (itemMatch) {
          return po;
        }
      }
    }

    if (vendorPOs.length === 1) {
      return vendorPOs[0];
    }

    return null;
  }

  private matchesCondition(invoice: Invoice, condition: any): boolean {
    if (condition.field && condition.value !== undefined) {
      const fieldValue = this.getNestedField(invoice.fields, condition.field);
      return fieldValue === condition.value;
    }

    return false;
  }

  private applyCorrectionAction(invoice: Invoice, action: any, result: ProcessingResult): void {
    if (action.set_field && action.value !== undefined) {
      this.setNestedField(result.normalizedInvoice, action.set_field, action.value);
      result.proposedCorrections.push(`Set ${action.set_field} to ${action.value}`);
    }
  }

  private detectIssues(fields: InvoiceFields): boolean {
    if (!fields.currency) return true;
    if (!fields.invoiceNumber) return true;
    if (!fields.invoiceDate) return true;
    if (fields.lineItems.length === 0) return true;

    return false;
  }

  private getNestedField(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }

    return current;
  }

  private setNestedField(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  private parseDate(dateStr: string): string {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }

    return dateStr;
  }
}
