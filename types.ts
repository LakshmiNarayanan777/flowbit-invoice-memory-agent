export interface Invoice {
  invoiceId: string;
  vendor: string;
  fields: InvoiceFields;
  confidence: number;
  rawText: string;
}

export interface InvoiceFields {
  invoiceNumber: string;
  invoiceDate: string;
  serviceDate?: string | null;
  currency: string | null;
  poNumber?: string | null;
  netTotal: number;
  taxRate: number;
  taxTotal: number;
  grossTotal: number;
  lineItems: LineItem[];
  discountTerms?: string | null;
}

export interface LineItem {
  sku?: string | null;
  description?: string;
  qty: number;
  unitPrice: number;
}

export interface PurchaseOrder {
  poNumber: string;
  vendor: string;
  date: string;
  lineItems: Array<{
    sku: string;
    qty: number;
    unitPrice: number;
  }>;
}

export interface DeliveryNote {
  dnNumber: string;
  vendor: string;
  poNumber: string;
  date: string;
  lineItems: Array<{
    sku: string;
    qtyDelivered: number;
  }>;
}

export interface HumanCorrection {
  invoiceId: string;
  vendor: string;
  corrections: Array<{
    field: string;
    from: any;
    to: any;
    reason: string;
  }>;
  finalDecision: string;
}

export interface ProcessingResult {
  normalizedInvoice: InvoiceFields;
  proposedCorrections: string[];
  requiresHumanReview: boolean;
  reasoning: string;
  confidenceScore: number;
  memoryUpdates: string[];
  auditTrail: AuditEntry[];
}

export interface AuditEntry {
  step: 'recall' | 'apply' | 'decide' | 'learn';
  timestamp: string;
  details: string;
}

export interface VendorMemory {
  id?: string;
  vendor: string;
  pattern_type: string;
  pattern_key: string;
  pattern_value: any;
  confidence: number;
  times_applied: number;
  times_successful: number;
  times_failed: number;
  last_applied_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CorrectionMemory {
  id?: string;
  vendor: string | null;
  correction_type: string;
  condition: any;
  correction_action: any;
  confidence: number;
  times_applied: number;
  times_successful: number;
  source_invoice_ids: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ResolutionMemory {
  id?: string;
  invoice_id: string;
  vendor: string;
  issue_type: string;
  issue_description: string | null;
  human_action: string;
  correction_applied: any;
  context: any;
  created_at?: string;
}
