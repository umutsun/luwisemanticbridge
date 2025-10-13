import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// Check multiple databases for Turkish law tables
router.get('/check-tables', async (req: Request, res: Response) => {
  const results: any = {};
  
  // Databases to check
  const databases = [
    { name: 'lsemb', connection: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb' },
    { name: 'postgres', connection: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/postgres' },
    { name: 'semantic_db', connection: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/semantic_db' }
  ];
  
  // Tables we're looking for
  const targetTables = ['OZELGELER', 'MAKALELER', 'SORUCEVAP', 'DANISTAYKARARLARI'];
  
  for (const db of databases) {
    try {
      const pool = new Pool({ connectionString: db.connection });
      
      // Get all tables in this database
      const tablesResult = await pool.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables 
        WHERE table_type = 'BASE TABLE'
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_name
      `);
      
      results[db.name] = {
        tables: tablesResult.rows,
        targetTablesFound: []
      };
      
      // Check for target tables (case-insensitive)
      for (const targetTable of targetTables) {
        const found = tablesResult.rows.find(
          (t: any) => t.table_name.toUpperCase() === targetTable.toUpperCase()
        );
        if (found) {
          results[db.name].targetTablesFound.push(found);
        }
      }
      
      await pool.end();
    } catch (error) {
      results[db.name] = { error: (error as Error).message };
    }
  }
  
  res.json(results);
});

export default router;