# CSV Embedding Strategy & Implementation

## Overview
This document describes the comprehensive strategy for handling CSV files in the ASB system, including intelligent parsing, structured embedding, and tabular data visualization.

## Strategy Overview

### Why CSV Needs Special Handling
CSV files contain structured tabular data that requires special treatment:
- **Data Relationships**: Rows and columns have semantic relationships
- **Context Preservation**: Column headers provide crucial context
- **Query Patterns**: Users often search for specific data patterns
- **Structure Loss**: Plain text embedding loses table structure

## Multi-Layered Embedding Approach

### Layer 1: Schema & Metadata
```sql
-- Example of extracted metadata
{
  "totalColumns": 5,
  "totalRows": 1000,
  "numericColumns": 3,
  "categoricalColumns": 2,
  "columnTypes": [
    {
      "name": "id",
      "type": "numeric",
      "uniqueValues": 1000,
      "nullCount": 0
    },
    {
      "name": "category",
      "type": "text",
      "uniqueValues": 15,
      "nullCount": 5
    }
  ]
}
```

### Layer 2: Statistical Analysis
- **Numeric Columns**: Min, max, average values
- **Categorical Columns**: Unique value lists
- **Data Quality**: Null value counts
- **Distribution**: Value frequency analysis

### Layer 3: Contextual Chunking
Rows are grouped in semantic chunks (15 rows per chunk) with preserved column context:
```
--- Records 1 to 15 ---
Row 1: id: 1 | name: John | age: 25 | city: New York | salary: 50000
Row 2: id: 2 | name: Jane | age: 30 | city: Boston | salary: 60000
...
```

### Layer 4: Query-Optimized Structure
- Column-wise indexing for fast filtering
- Cross-reference tables for relationships
- Summary tables for analytics

## Implementation Details

### Backend Processing

#### CSV Parser (`backend/src/services/document-processor.service.ts`)
```typescript
private async processCSVWithMetadata(filePath: string) {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    const headers: string[] = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headerList: string[]) => {
        headers.push(...headerList);
      })
      .on('data', (data: any) => {
        results.push(data);
      })
      .on('end', () => {
        // Analyze and structure the data
        const numericColumns = this.analyzeNumericColumns(headers, results);
        const categoricalColumns = this.analyzeCategoricalColumns(headers, results);

        resolve({
          content: this.createStructuredCSVContent(headers, results),
          stats: { totalRows: results.length, totalColumns: headers.length },
          columnTypes: this.analyzeColumnTypes(headers, results),
          hasNumericData: numericColumns.length > 0,
          hasCategoricalData: categoricalColumns.length > 0
        });
      });
  });
}
```

#### Structured Content Generation
```typescript
private createStructuredCSVContent(headers: string[], rows: any[]): string {
  const sections: string[] = [];

  // 1. Dataset Overview
  sections.push(`CSV Dataset Overview:\n- Total Columns: ${headers.length}\n- Total Rows: ${rows.length}\n`);

  // 2. Column Statistics
  const numericColumns = this.analyzeNumericColumns(headers, rows);
  if (numericColumns.length > 0) {
    sections.push('\nColumn Statistics:');
    numericColumns.forEach(col => {
      sections.push(`- ${col.name}: min=${col.min}, max=${col.max}, avg=${col.avg}`);
    });
  }

  // 3. Data Records (chunked)
  sections.push('\nData Records:\n');
  const chunkSize = 15;
  for (let i = 0; i < rows.length; i += chunkSize) {
    sections.push(`\n--- Records ${i + 1} to ${Math.min(i + chunkSize, rows.length)} ---`);
    // ... process chunk
  }

  return sections.join('\n');
}
```

#### Smart Chunking for CSV
```typescript
private createCSVChunks(text: string): string[] {
  const chunks: string[] = [];

  // Extract overview as first chunk
  const overviewMatch = text.match(/CSV Dataset Overview:[\s\S]*?(?=\n\n|\nColumn Statistics:)/);
  if (overviewMatch) chunks.push(overviewMatch[0].trim());

  // Extract statistics as second chunk
  const statsMatch = text.match(/Column Statistics:[\s\S]*?(?=\n\nData Records:)/);
  if (statsMatch) chunks.push(statsMatch[0].trim());

  // Extract data record chunks
  const recordChunks = text.split(/--- Records \d+ to \d+ ---/);
  // ... process and add contextual chunks

  return chunks;
}
```

### Frontend Implementation

#### CSV Viewer Component (`frontend/src/components/ui/csv-viewer.tsx`)
Key features:
- **Interactive Table**: Sort, filter, paginate
- **Column Type Detection**: Visual badges for data types
- **Export Functionality**: Download filtered data
- **Search**: Global and column-specific search

#### Usage Example
```typescript
<CSVViewer
  data={csvData.data}
  columns={csvData.columns}
  title={document.title}
  stats={document.metadata?.csvStats}
  columnTypes={document.metadata?.columnTypes}
/>
```

## Query Examples

### Supported Query Types
1. **Value-based**: "Show all sales above $10,000"
2. **Category-based**: "Find all customers in New York"
3. **Statistical**: "What's the average order value?"
4. **Range-based**: "Products priced between $50 and $100"
5. **Aggregation**: "Count orders per customer"

### Search Implementation
```javascript
// Backend search with CSV awareness
if (doc.type === 'csv') {
  // Can leverage column structure for better search
  const searchInColumns = columns.map(col =>
    `${col}: ${row[col]}`
  ).join(' | ');
}
```

## Performance Optimizations

### 1. Lazy Loading
- Load first 100 rows initially
- Load more on demand (pagination)
- Cache parsed CSV data

### 2. Indexing Strategy
```sql
-- Create GIN index for JSONB metadata
CREATE INDEX idx_document_metadata_gin ON documents USING GIN (metadata);

-- Create index for CSV statistics
CREATE INDEX idx_csv_stats ON documents
USING GIN ((metadata->'csvStats'));

-- Column-wise search index
CREATE INDEX idx_csv_columns ON documents
USING GIN ((metadata->'columnTypes'));
```

### 3. Memory Management
- Stream processing for large CSVs
- Chunk-wise embedding generation
- Progress tracking

## Use Cases

### 1. Data Analysis
- Sales reports
- Customer databases
- Inventory lists
- Financial statements

### 2. Data Migration
- Legacy system exports
- Database dumps
- Log file analysis

### 3. Business Intelligence
- KPI tracking
- Trend analysis
- Report generation

## File Size Limits

### Current Configuration
- **Upload Limit**: 10MB per file
- **Processing Limit**: 50,000 rows per file
- **Chunk Size**: 15 rows per chunk
- **Memory Usage**: ~100MB for 10K rows

### Recommendations
1. **Large Files**: Split into smaller files
2. **Very Large Datasets**: Use database import instead
3. **Frequent Updates**: Consider direct database connection

## Integration Points

### 1. Database Integration
```sql
-- Direct CSV import to database
COPY target_table FROM '/path/to/file.csv'
WITH (FORMAT csv, HEADER true);
```

### 2. External APIs
- Connect to data sources directly
- Real-time sync capabilities
- Webhook triggers on updates

### 3. Export Features
- CSV download with filters applied
- Excel export (via conversion)
- JSON API response

## Security Considerations

### 1. Data Privacy
- Sanitize sensitive columns
- Role-based access control
- Audit logging for data access

### 2. Injection Prevention
- Validate CSV structure
- Escape special characters
- Limit file operations

### 3. Resource Limits
- CPU usage monitoring
- Memory allocation limits
- Concurrent processing limits

## Future Enhancements

### 1. Advanced Analytics
- Automatic chart generation
- Statistical analysis tools
- Predictive modeling

### 2. Data Validation
- Schema validation rules
- Data quality scores
- Anomaly detection

### 3. Integration Features
- Google Sheets sync
- Airtable import
- Zapier integration

## Troubleshooting

### Common Issues

1. **Memory Issues with Large CSVs**
   - Solution: Implement streaming processing

2. **Encoding Problems**
   - Solution: Detect and convert UTF-8 encoding

3. **Malformed CSV Files**
   - Solution: Robust parser with error recovery

4. **Slow Performance**
   - Solution: Implement caching and indexing

## Related Files

- `backend/src/services/document-processor.service.ts` - CSV processing logic
- `frontend/src/components/ui/csv-viewer.tsx` - CSV viewer component
- `backend/src/scripts/csv-processor.js` - Standalone CSV processor
- `docs/csv-format-specification.md` - CSV format guidelines