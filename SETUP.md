# Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   The `.env` file is already configured with Supabase credentials.

   If you need to reconfigure:
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase URL and Anon Key
   ```

3. **Build the Project**
   ```bash
   npm run build
   ```

4. **Run the Demo**
   ```bash
   npm run demo
   ```

## What the Demo Does

The demo runs through a complete learning cycle:

### Phase 1: Initial Processing (No Memory)
- Processes 6 invoices from 3 vendors
- All invoices require human review
- Missing fields detected (serviceDate, currency, SKUs)
- Lower confidence scores

### Phase 2: Learning from Corrections
- Applies 5 human corrections
- Learns vendor-specific patterns:
  - Supplier GmbH: "Leistungsdatum" → serviceDate
  - Parts AG: VAT included in totals
  - Parts AG: Currency from rawText
  - Freight & Co: Skonto discount terms
  - Freight & Co: Description → SKU mapping

### Phase 3: Re-processing with Memory
- Re-processes same invoices
- Automatically applies learned corrections
- Higher confidence scores
- Fewer human reviews needed

### Phase 4: Memory Statistics
- Shows all learned patterns
- Displays confidence levels
- Lists memory types

## Expected Output

```
[STEP 1] Clearing existing memory...

[STEP 2] Processing initial invoices (WITHOUT learned memory)...

--- Processing INV-A-001 (Supplier GmbH) ---
   Requires Review: true
   Confidence: 0.78
   Proposed Corrections: 0
   Reasoning: No learned patterns applied...

[STEP 3] Applying human corrections and learning...

--- Learning from INV-A-001 ---
   Corrections: 1
   ✓ Learned: Supplier GmbH uses "Leistungsdatum" for serviceDate

[STEP 4] Re-processing same invoices WITH learned memory...

--- Re-processing INV-A-001 (Supplier GmbH) ---
   Requires Review: false (improved!)
   Confidence: 0.82 (improved!)
   Proposed Corrections: 1
   Applied Corrections:
      - Set serviceDate from Leistungsdatum: 2024-01-01

[STEP 5] Memory Statistics

   Vendor Memory Patterns: 5
   Correction Patterns: 0
   Resolution History: 5

   Learned Vendor Patterns:
      - [Supplier GmbH] field_mapping/serviceDate (confidence: 0.70)
      - [Parts AG] tax_behavior/vat_included (confidence: 0.70)
      - [Parts AG] field_mapping/currency_from_text (confidence: 0.60)
      - [Freight & Co] discount_terms/skonto (confidence: 0.75)
      - [Freight & Co] sku_mapping/desc_to_sku_FREIGHT (confidence: 0.70)
```

## Troubleshooting

### Error: Missing Supabase credentials
- Check that `.env` file exists
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set

### Error: Cannot connect to database
- Check Supabase project is active
- Verify database tables exist (run migrations)
- Check network connectivity

### TypeScript compilation errors
- Run `npm run build` to see specific errors
- Ensure TypeScript version is 5.3.3+

## Database Schema

The system uses 5 tables:
- `processed_invoices` - All processed invoices
- `vendor_memory` - Vendor-specific patterns
- `correction_memory` - Generic correction patterns
- `resolution_memory` - Human decision history
- `audit_trail` - Complete operation log

All tables are created automatically via Supabase migrations.

## Demo Customization

To add more test invoices, edit `src/demo.ts`:
- Add to `INITIAL_INVOICES` array
- Add corresponding corrections to `INITIAL_CORRECTIONS`
- Add reference data to `REFERENCE_DATA`

## Performance Notes

- Initial run: ~3-5 seconds (includes learning)
- Subsequent runs: ~1-2 seconds (memory recall)
- Database queries are optimized with indexes
- Confidence scoring is computed in real-time
