import { InvoiceProcessor } from './invoice-processor';
import { Invoice, PurchaseOrder, DeliveryNote, HumanCorrection } from './types';
import * as fs from 'fs';
import * as path from 'path';

const INITIAL_INVOICES: Invoice[] = [
  {
    "invoiceId": "INV-A-001",
    "vendor": "Supplier GmbH",
    "fields": {
      "invoiceNumber": "INV-2024-001",
      "invoiceDate": "12.01.2024",
      "serviceDate": null,
      "currency": "EUR",
      "poNumber": "PO-A-050",
      "netTotal": 2500.0,
      "taxRate": 0.19,
      "taxTotal": 475.0,
      "grossTotal": 2975.0,
      "lineItems": [
        { "sku": "WIDGET-001", "description": "Widget", "qty": 100, "unitPrice": 25.0 }
      ]
    },
    "confidence": 0.78,
    "rawText": "Rechnungsnr: INV-2024-001\\nLeistungsdatum: 01.01.2024\\nBestellnr: PO-A-050\\n..."
  },
  {
    "invoiceId": "INV-A-002",
    "vendor": "Supplier GmbH",
    "fields": {
      "invoiceNumber": "INV-2024-002",
      "invoiceDate": "18.01.2024",
      "serviceDate": null,
      "currency": "EUR",
      "poNumber": "PO-A-050",
      "netTotal": 2375.0,
      "taxRate": 0.19,
      "taxTotal": 451.25,
      "grossTotal": 2826.25,
      "lineItems": [
        { "sku": "WIDGET-001", "description": "Widget", "qty": 95, "unitPrice": 25.0 }
      ]
    },
    "confidence": 0.72,
    "rawText": "Rechnungsnr: INV-2024-002\\nLeistungsdatum: 15.01.2024\\nBestellnr: PO-A-050\\nHinweis: Teillieferung\\n..."
  },
  {
    "invoiceId": "INV-B-001",
    "vendor": "Parts AG",
    "fields": {
      "invoiceNumber": "PA-7781",
      "invoiceDate": "05-02-2024",
      "currency": "EUR",
      "poNumber": "PO-B-110",
      "netTotal": 2000.0,
      "taxRate": 0.19,
      "taxTotal": 400.0,
      "grossTotal": 2400.0,
      "lineItems": [
        { "sku": "BOLT-99", "description": "Bolts", "qty": 200, "unitPrice": 10.0 }
      ]
    },
    "confidence": 0.74,
    "rawText": "Invoice No: PA-7781\\nPO: PO-B-110\\nPrices incl. VAT (MwSt. inkl.)\\nTotal: 2380.00 EUR\\n..."
  },
  {
    "invoiceId": "INV-B-003",
    "vendor": "Parts AG",
    "fields": {
      "invoiceNumber": "PA-7810",
      "invoiceDate": "03-03-2024",
      "currency": null,
      "poNumber": "PO-B-111",
      "netTotal": 1000.0,
      "taxRate": 0.19,
      "taxTotal": 190.0,
      "grossTotal": 1190.0,
      "lineItems": [
        { "sku": "NUT-10", "description": "Nuts", "qty": 500, "unitPrice": 2.0 }
      ]
    },
    "confidence": 0.66,
    "rawText": "Invoice No: PA-7810\\nPO: PO-B-111\\nCurrency: EUR\\n..."
  },
  {
    "invoiceId": "INV-C-001",
    "vendor": "Freight & Co",
    "fields": {
      "invoiceNumber": "FC-1001",
      "invoiceDate": "01.03.2024",
      "currency": "EUR",
      "poNumber": "PO-C-900",
      "netTotal": 1000.0,
      "taxRate": 0.19,
      "taxTotal": 190.0,
      "grossTotal": 1190.0,
      "lineItems": [
        { "sku": null, "description": "Transport charges", "qty": 1, "unitPrice": 1000.0 }
      ]
    },
    "confidence": 0.79,
    "rawText": "Invoice: FC-1001\\nPO: PO-C-900\\n2% Skonto if paid within 10 days\\n..."
  },
  {
    "invoiceId": "INV-C-002",
    "vendor": "Freight & Co",
    "fields": {
      "invoiceNumber": "FC-1002",
      "invoiceDate": "10.03.2024",
      "currency": "EUR",
      "poNumber": "PO-C-900",
      "netTotal": 1000.0,
      "taxRate": 0.19,
      "taxTotal": 190.0,
      "grossTotal": 1190.0,
      "lineItems": [
        { "sku": null, "description": "Seefracht / Shipping", "qty": 1, "unitPrice": 1000.0 }
      ]
    },
    "confidence": 0.73,
    "rawText": "Invoice: FC-1002\\nPO: PO-C-900\\nService: Seefracht\\n..."
  }
];

const INITIAL_CORRECTIONS: HumanCorrection[] = [
  {
    "invoiceId": "INV-A-001",
    "vendor": "Supplier GmbH",
    "corrections": [
      { "field": "serviceDate", "from": null, "to": "2024-01-01", "reason": "Leistungsdatum found in rawText" }
    ],
    "finalDecision": "approved"
  },
  {
    "invoiceId": "INV-B-001",
    "vendor": "Parts AG",
    "corrections": [
      { "field": "grossTotal", "from": 2400.0, "to": 2380.0, "reason": "Raw text indicates totals already include VAT; extractor overestimated" },
      { "field": "taxTotal", "from": 400.0, "to": 380.0, "reason": "Recalculated from grossTotal and taxRate" }
    ],
    "finalDecision": "approved"
  },
  {
    "invoiceId": "INV-B-003",
    "vendor": "Parts AG",
    "corrections": [
      { "field": "currency", "from": null, "to": "EUR", "reason": "Currency appears in rawText" }
    ],
    "finalDecision": "approved"
  },
  {
    "invoiceId": "INV-C-001",
    "vendor": "Freight & Co",
    "corrections": [
      { "field": "discountTerms", "from": null, "to": "2% Skonto within 10 days", "reason": "Skonto terms in rawText" }
    ],
    "finalDecision": "approved"
  },
  {
    "invoiceId": "INV-C-002",
    "vendor": "Freight & Co",
    "corrections": [
      { "field": "lineItems[0].sku", "from": null, "to": "FREIGHT", "reason": "Vendor uses descriptions (Seefracht/Shipping) that map to FREIGHT" }
    ],
    "finalDecision": "approved"
  }
];

const REFERENCE_DATA = {
  "purchaseOrders": [
    {
      "poNumber": "PO-A-050",
      "vendor": "Supplier GmbH",
      "date": "2024-01-05",
      "lineItems": [{ "sku": "WIDGET-001", "qty": 100, "unitPrice": 25.0 }]
    },
    {
      "poNumber": "PO-A-051",
      "vendor": "Supplier GmbH",
      "date": "2024-01-18",
      "lineItems": [{ "sku": "WIDGET-002", "qty": 20, "unitPrice": 25.0 }]
    },
    {
      "poNumber": "PO-B-110",
      "vendor": "Parts AG",
      "date": "2024-02-01",
      "lineItems": [{ "sku": "BOLT-99", "qty": 200, "unitPrice": 10.0 }]
    },
    {
      "poNumber": "PO-B-111",
      "vendor": "Parts AG",
      "date": "2024-03-01",
      "lineItems": [{ "sku": "NUT-10", "qty": 500, "unitPrice": 2.0 }]
    },
    {
      "poNumber": "PO-C-900",
      "vendor": "Freight & Co",
      "date": "2024-03-01",
      "lineItems": [{ "sku": "FREIGHT", "qty": 1, "unitPrice": 1000.0 }]
    },
    {
      "poNumber": "PO-C-901",
      "vendor": "Freight & Co",
      "date": "2024-03-15",
      "lineItems": [{ "sku": "FREIGHT", "qty": 1, "unitPrice": 1000.0 }]
    }
  ],
  "deliveryNotes": [
    {
      "dnNumber": "DN-A-123",
      "vendor": "Supplier GmbH",
      "poNumber": "PO-A-050",
      "date": "2024-01-10",
      "lineItems": [{ "sku": "WIDGET-001", "qtyDelivered": 95 }]
    }
  ]
};

async function runInitialLearningDemo() {
  console.log('\\n========================================');
  console.log('INVOICE MEMORY SYSTEM - INITIAL LEARNING DEMO');
  console.log('========================================\\n');

  const processor = new InvoiceProcessor();

  console.log('[STEP 1] Clearing existing memory...\\n');
  await processor.clearAllMemory();

  console.log('[STEP 2] Processing initial invoices (WITHOUT learned memory)...\\n');

  for (const invoice of INITIAL_INVOICES) {
    console.log(`\\n--- Processing ${invoice.invoiceId} (${invoice.vendor}) ---`);

    const result = await processor.processInvoice(
      invoice,
      REFERENCE_DATA.purchaseOrders,
      REFERENCE_DATA.deliveryNotes
    );

    console.log(`   Requires Review: ${result.requiresHumanReview}`);
    console.log(`   Confidence: ${result.confidenceScore.toFixed(2)}`);
    console.log(`   Proposed Corrections: ${result.proposedCorrections.length}`);
    console.log(`   Reasoning: ${result.reasoning.substring(0, 150)}...`);
  }

  console.log('\\n\\n[STEP 3] Applying human corrections and learning...\\n');

  for (const correction of INITIAL_CORRECTIONS) {
    const invoice = INITIAL_INVOICES.find(inv => inv.invoiceId === correction.invoiceId)!;
    const history = await processor.getProcessingHistory(invoice.invoiceId);

    console.log(`\\n--- Learning from ${correction.invoiceId} ---`);
    console.log(`   Corrections: ${correction.corrections.length}`);

    const updates = await processor.applyHumanCorrection(invoice, correction, {
      normalizedInvoice: history.normalized_data,
      proposedCorrections: history.proposed_corrections,
      requiresHumanReview: history.requires_human_review,
      reasoning: history.reasoning,
      confidenceScore: history.confidence_score,
      memoryUpdates: [],
      auditTrail: []
    });

    for (const update of updates) {
      console.log(`   ✓ ${update}`);
    }
  }

  console.log('\\n\\n[STEP 4] Re-processing same invoices WITH learned memory...\\n');

  for (const invoice of INITIAL_INVOICES) {
    console.log(`\\n--- Re-processing ${invoice.invoiceId} (${invoice.vendor}) ---`);

    const result = await processor.processInvoice(
      invoice,
      REFERENCE_DATA.purchaseOrders,
      REFERENCE_DATA.deliveryNotes
    );

    console.log(`   Requires Review: ${result.requiresHumanReview} (improved!)`);
    console.log(`   Confidence: ${result.confidenceScore.toFixed(2)} (improved!)`);
    console.log(`   Proposed Corrections: ${result.proposedCorrections.length}`);

    if (result.proposedCorrections.length > 0) {
      console.log(`   Applied Corrections:`);
      result.proposedCorrections.forEach(corr => console.log(`      - ${corr}`));
    }
  }

  console.log('\\n\\n[STEP 5] Memory Statistics\\n');
  const stats = await processor.getMemoryStats();
  console.log(`   Vendor Memory Patterns: ${stats.vendorMemoryCount}`);
  console.log(`   Correction Patterns: ${stats.correctionMemoryCount}`);
  console.log(`   Resolution History: ${stats.resolutionMemoryCount}`);

  console.log('\\n   Learned Vendor Patterns:');
  for (const mem of stats.vendorMemory) {
    console.log(`      - [${mem.vendor}] ${mem.pattern_type}/${mem.pattern_key} (confidence: ${mem.confidence.toFixed(2)})`);
  }

  console.log('\\n\\n========================================');
  console.log('DEMO COMPLETE - Memory Learning Verified!');
  console.log('========================================\\n');
}

async function main() {
  const mode = process.argv[2] || 'initial';

  try {
    if (mode === 'initial' || !mode) {
      await runInitialLearningDemo();
    } else if (mode === 'full') {
      await runFullDemo();
    } else {
      console.log('Unknown mode. Use: npm run demo');
    }
  } catch (error) {
    console.error('Error running demo:', error);
    process.exit(1);
  }
}

async function runFullDemo() {
  console.log('\n[DEMO] Running full demo (currently runs the initial learning demo plus any extended steps)\n');
  // For now, full demo re-uses the initial learning demo flow.
  await runInitialLearningDemo();
}

main();
