# Architecture Documentation

## System Overview

The Invoice Memory System is a multi-layered architecture implementing a learning agent for invoice automation.

```
┌─────────────────────────────────────────────────────┐
│                   Demo Runner                        │
│              (User Interface Layer)                  │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│              Invoice Processor                       │
│           (Orchestration Layer)                      │
└─────────────────────────────────────────────────────┘
         │                    │                    │
┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│Decision Engine │  │Learning Engine  │  │Memory Service   │
│(Apply & Decide)│  │(Learn Patterns) │  │(Store & Recall) │
└────────────────┘  └─────────────────┘  └─────────────────┘
                              │
┌─────────────────────────────────────────────────────┐
│              Database Layer (Supabase)               │
│  - processed_invoices  - vendor_memory              │
│  - correction_memory   - resolution_memory          │
│  - audit_trail                                      │
└─────────────────────────────────────────────────────┘
```

## Core Components

### 1. Invoice Processor
**File**: `src/invoice-processor.ts`

Main orchestrator that coordinates all operations.

**Responsibilities**:
- Process invoices end-to-end
- Apply human corrections
- Query processing history
- Generate memory statistics
- Clear memory (for demos)

**Key Methods**:
- `processInvoice()` - Main entry point
- `applyHumanCorrection()` - Learn from feedback
- `getProcessingHistory()` - Retrieve past decisions
- `getMemoryStats()` - Memory analytics

### 2. Decision Engine
**File**: `src/decision-engine.ts`

Applies memory and makes processing decisions.

**Responsibilities**:
- Recall relevant memories
- Apply learned patterns
- Calculate confidence scores
- Determine if human review needed
- Generate reasoning explanations

**Pattern Application**:
- Service date mapping
- VAT included corrections
- Currency recovery
- Discount terms detection
- SKU mapping
- PO matching

**Confidence Calculation**:
```typescript
totalConfidence = baseConfidence + Σ(patternConfidence)
avgConfidence = totalConfidence / factorCount
finalScore = clamp(avgConfidence, 0.0, 0.95)
```

**Decision Threshold**: 0.75

### 3. Learning Engine
**File**: `src/learning-engine.ts`

Learns patterns from human corrections.

**Responsibilities**:
- Extract patterns from corrections
- Store new memories
- Categorize issues
- Store resolution history

**Learning Strategies**:

1. **Field Mapping**
   - Detects source-to-target mappings
   - Example: "Leistungsdatum" → serviceDate
   - Initial confidence: 0.7

2. **Tax Behavior**
   - Learns VAT included/excluded patterns
   - Detects indicator keywords
   - Initial confidence: 0.7

3. **Currency Recovery**
   - Learns text extraction patterns
   - Regex-based detection
   - Initial confidence: 0.6

4. **PO Matching**
   - Learns matching strategies
   - Date proximity + item matching
   - Initial confidence: 0.65

5. **Discount Terms**
   - Pattern detection in rawText
   - Structured storage
   - Initial confidence: 0.75

6. **SKU Mapping**
   - Description → SKU relationships
   - Fuzzy matching support
   - Initial confidence: 0.7

### 4. Memory Service
**File**: `src/memory-service.ts`

Manages persistent memory storage.

**Responsibilities**:
- Store/retrieve vendor memory
- Store/retrieve correction memory
- Store/retrieve resolution memory
- Reinforce memory on success
- Decay memory on failure
- Detect duplicates

**Memory Types**:

1. **Vendor Memory**
   - Vendor-specific patterns
   - Confidence tracking
   - Usage statistics

2. **Correction Memory**
   - Generic correction patterns
   - Condition matching
   - Success rates

3. **Resolution Memory**
   - Human decision history
   - Issue categorization
   - Context preservation

**Confidence Evolution**:
```typescript
// On success
newConfidence = min(0.95, confidence + 0.1 * (1 - confidence))

// On failure
newConfidence = max(0.1, confidence - 0.15)
```

**Recall Threshold**: 0.3 (patterns below this are not retrieved)

### 5. Database Layer
**File**: `src/database.ts`

Supabase client and utilities.

**Responsibilities**:
- Database connection management
- Audit trail recording
- Query execution

## Data Flow

### Processing Flow

```
1. Invoice Input
   ↓
2. Duplicate Check
   ↓
3. Recall Memories (vendor + correction)
   ↓
4. Apply Patterns
   ↓
5. Calculate Confidence
   ↓
6. Make Decision (auto/review)
   ↓
7. Store Result
   ↓
8. Return ProcessingResult
```

### Learning Flow

```
1. Human Correction Input
   ↓
2. Analyze Corrections
   ↓
3. Extract Patterns
   ↓
4. Store Vendor Memory
   ↓
5. Store Resolution Memory
   ↓
6. Record Audit Trail
   ↓
7. Return Updates
```

## Key Algorithms

### Duplicate Detection

```typescript
Check if existing invoice with:
- Same vendor
- Same invoice number
- Invoice date within 7 days
→ Flag as duplicate
```

### PO Matching

```typescript
For each PO:
  If vendor matches AND
     date within 30 days AND
     line items match
  → Return matched PO

If only one PO for vendor:
  → Return that PO
```

### Confidence Scoring

```typescript
factors = [base_confidence]
For each applied pattern:
  factors.push(pattern_confidence)

average = sum(factors) / factors.length
final = clamp(average, 0.0, 0.95)
```

### Pattern Matching

```typescript
For each memory:
  If confidence >= 0.3 AND
     conditions match invoice
  → Apply pattern
  → Increase confidence score
```

## Error Handling

- Database errors: Logged but don't stop processing
- Missing fields: Flagged for review
- Low confidence: Escalated to human
- Duplicates: Auto-rejected with reasoning

## Security

- RLS enabled on all tables
- Anonymous access for demo
- Authenticated access for production
- No secrets in code
- Environment variables for credentials

## Performance Optimizations

- Indexed queries on vendor, pattern_type
- Batch memory retrieval
- Confidence pre-filtering (>= 0.3)
- Single database write per invoice
- Efficient JSONB queries

## Extensibility

### Adding New Memory Types

1. Create table schema
2. Add to MemoryService
3. Implement recall logic
4. Implement store logic
5. Add to DecisionEngine

### Adding New Patterns

1. Identify pattern in LearningEngine
2. Store in appropriate memory table
3. Add application logic in DecisionEngine
4. Test with sample data

### Adding New Decision Logic

1. Extend DecisionEngine
2. Add confidence factor
3. Update reasoning generation
4. Add audit trail entry

## Testing Strategy

- Integration tests via demo runner
- Database migrations tested via Supabase
- Type safety via TypeScript strict mode
- Manual testing of learning cycles

## Monitoring

- Audit trail for all operations
- Confidence tracking over time
- Success/failure rates per pattern
- Processing history per invoice
