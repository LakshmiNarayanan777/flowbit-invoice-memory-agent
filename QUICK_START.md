# Quick Start Guide

## 1. Install Dependencies (1 minute)

```bash
npm install
```

## 2. Verify Environment (30 seconds)

```bash
# Check .env file exists
cat .env

# Should show:
# VITE_SUPABASE_URL=https://...
# VITE_SUPABASE_ANON_KEY=...
```

## 3. Build Project (30 seconds)

```bash
npm run build
```

## 4. Run Demo (1 minute)

```bash
npm run demo
```

## What You'll See

```
[STEP 1] Clearing existing memory...

[STEP 2] Processing initial invoices (WITHOUT learned memory)...
--- Processing INV-A-001 (Supplier GmbH) ---
   Requires Review: true
   Confidence: 0.78
   Proposed Corrections: 0

[STEP 3] Applying human corrections and learning...
--- Learning from INV-A-001 ---
   ✓ Learned: Supplier GmbH uses "Leistungsdatum" for serviceDate

[STEP 4] Re-processing same invoices WITH learned memory...
--- Re-processing INV-A-001 (Supplier GmbH) ---
   Requires Review: false (improved!)
   Confidence: 0.82 (improved!)
   Applied Corrections:
      - Set serviceDate from Leistungsdatum: 2024-01-01

[STEP 5] Memory Statistics
   Vendor Memory Patterns: 5
   Learned Vendor Patterns:
      - [Supplier GmbH] field_mapping/serviceDate (confidence: 0.70)
      - [Parts AG] tax_behavior/vat_included (confidence: 0.70)
      - [Freight & Co] sku_mapping/desc_to_sku_FREIGHT (confidence: 0.70)
```

## That's It!

The system is now:
- Learning from corrections
- Applying patterns automatically
- Improving confidence over time
- Storing everything in Supabase

## Next Steps

1. Read README.md for full documentation
2. Check SETUP.md for detailed setup
3. Review ARCHITECTURE.md for technical details
4. Follow SUBMISSION_INSTRUCTIONS.md to submit

## Commands Reference

```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript
npm run demo          # Run learning demo
npm run demo:initial  # Same as demo
```

## File Structure

```
src/
├── demo.ts              # Start here - demo runner
├── invoice-processor.ts # Main orchestrator
├── decision-engine.ts   # Pattern application
├── learning-engine.ts   # Learning logic
├── memory-service.ts    # Database operations
└── types.ts            # TypeScript interfaces
```

## Need Help?

- **Setup issues**: See SETUP.md
- **Architecture questions**: See ARCHITECTURE.md
- **Deployment**: See DEPLOYMENT.md
- **Submission**: See SUBMISSION_INSTRUCTIONS.md
