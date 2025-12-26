# Deployment Guide

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- Supabase account and project
- Git (for version control)

## Production Deployment

### 1. Database Setup

The database is already configured via Supabase. Tables are created automatically:
- processed_invoices
- vendor_memory
- correction_memory
- resolution_memory
- audit_trail

All tables have:
- RLS (Row Level Security) enabled
- Proper indexes for performance
- JSONB support for flexible data
- Timestamp tracking

### 2. Environment Configuration

Create production `.env` file:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key
```

**Security Notes**:
- Use production Supabase credentials
- Enable RLS policies for authenticated users only
- Rotate keys regularly
- Never commit `.env` to version control

### 3. Build for Production

```bash
# Install dependencies
npm ci

# Run TypeScript compiler
npm run build

# Verify build
ls -la dist/
```

Output should include:
- `dist/*.js` - Compiled JavaScript
- `dist/*.d.ts` - Type declarations
- `dist/*.js.map` - Source maps

### 4. Running in Production

```bash
# Using built JavaScript
node dist/demo.js

# Or using tsx for development
npm run demo
```

## Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

COPY .env ./

CMD ["node", "dist/demo.js"]
```

Build and run:

```bash
docker build -t invoice-memory-agent .
docker run --env-file .env invoice-memory-agent
```

## API Server (Optional)

To expose as HTTP API, add Express server:

```typescript
// src/server.ts
import express from 'express';
import { InvoiceProcessor } from './invoice-processor';

const app = express();
app.use(express.json());

const processor = new InvoiceProcessor();

app.post('/process', async (req, res) => {
  const { invoice, purchaseOrders, deliveryNotes } = req.body;

  try {
    const result = await processor.processInvoice(
      invoice,
      purchaseOrders,
      deliveryNotes
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/correct', async (req, res) => {
  const { invoice, correction, processingResult } = req.body;

  try {
    const updates = await processor.applyHumanCorrection(
      invoice,
      correction,
      processingResult
    );
    res.json({ updates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Invoice Memory Agent API running on port 3000');
});
```

## Monitoring & Logging

### Application Logs

Add structured logging:

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### Database Monitoring

Query Supabase metrics:
- Table sizes
- Query performance
- RLS policy hits
- Connection pool usage

### Memory Statistics

```bash
# Get memory stats
curl http://localhost:3000/stats
```

Returns:
- Total patterns learned
- Average confidence scores
- Success rates per vendor
- Processing throughput

## Backup & Recovery

### Database Backups

Supabase provides automatic backups. For additional safety:

```sql
-- Export vendor memory
COPY vendor_memory TO '/backups/vendor_memory.csv' CSV HEADER;

-- Export correction memory
COPY correction_memory TO '/backups/correction_memory.csv' CSV HEADER;
```

### Memory Snapshots

Export memory state:

```typescript
const stats = await processor.getMemoryStats();
fs.writeFileSync('memory-snapshot.json', JSON.stringify(stats, null, 2));
```

Restore from snapshot:

```typescript
const snapshot = JSON.parse(fs.readFileSync('memory-snapshot.json'));
// Implement restore logic
```

## Performance Tuning

### Database Indexes

Already created:
- `idx_processed_invoices_vendor`
- `idx_vendor_memory_vendor`
- `idx_vendor_memory_pattern_type`

Add if needed:
```sql
CREATE INDEX idx_audit_trail_timestamp ON audit_trail(timestamp DESC);
```

### Query Optimization

- Use `.select('*')` sparingly
- Filter early with `.eq()` before `.select()`
- Limit results with `.limit()`
- Use `.maybeSingle()` instead of `.single()` for optional data

### Caching

Add Redis for memory caching:

```typescript
import Redis from 'ioredis';

const redis = new Redis();

async function getCachedMemory(vendor: string) {
  const cached = await redis.get(`memory:${vendor}`);
  if (cached) return JSON.parse(cached);

  const memory = await memoryService.recallVendorMemory(vendor);
  await redis.setex(`memory:${vendor}`, 3600, JSON.stringify(memory));

  return memory;
}
```

## Scaling Considerations

### Horizontal Scaling

- Stateless design allows multiple instances
- Supabase handles database connection pooling
- Use load balancer for API endpoints

### Vertical Scaling

- Increase database resources in Supabase dashboard
- Upgrade Node.js container memory
- Optimize JSONB queries

### Data Partitioning

For large datasets:

```sql
-- Partition by vendor
CREATE TABLE vendor_memory_supplier_gmbh
PARTITION OF vendor_memory
FOR VALUES IN ('Supplier GmbH');
```

## Security Checklist

- [ ] Environment variables secured
- [ ] RLS policies enabled
- [ ] HTTPS enforced for API
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] Authentication for production endpoints
- [ ] Audit logging enabled
- [ ] Regular security updates
- [ ] Secrets rotation policy

## Troubleshooting

### High Memory Usage

- Limit audit trail retention
- Archive old processed invoices
- Reduce memory recall window

### Slow Queries

- Check query execution plans
- Add missing indexes
- Optimize JSONB queries
- Enable connection pooling

### Memory Not Learning

- Check human corrections are applied
- Verify confidence thresholds
- Review audit trail for errors
- Check database write permissions

## Health Checks

Add health endpoint:

```typescript
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vendor_memory')
      .select('count')
      .limit(1);

    if (error) throw error;

    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

## Maintenance

### Regular Tasks

Weekly:
- Review audit logs
- Check memory statistics
- Monitor confidence trends

Monthly:
- Archive old data
- Review RLS policies
- Update dependencies

Quarterly:
- Performance review
- Security audit
- Backup verification
