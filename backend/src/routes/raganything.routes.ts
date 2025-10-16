import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { redis } from '../config/redis';
import RAGAnythingService from '../services/raganything.service';
import multer from 'multer';
import path from 'path';

const router = Router();
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Use centralized Redis configuration (port 6379)

// Initialize RAGAnything service
const ragAnything = new RAGAnythingService(pgPool, redis);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Excel, CSV'));
    }
  }
});

// Process file upload
router.post('/process/file', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let sourceType: 'pdf' | 'excel' | 'csv';
    
    if (fileExt === '.pdf') {
      sourceType = 'pdf';
    } else if (['.xlsx', '.xls'].includes(fileExt)) {
      sourceType = 'excel';
    } else if (fileExt === '.csv') {
      sourceType = 'csv';
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    
    const result = await ragAnything.processDataSource({
      type: sourceType,
      path: req.file.path
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process web URL
router.post('/process/web', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const result = await ragAnything.processDataSource({
      type: 'web',
      url
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error processing web URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process database table
router.post('/process/database', async (req: Request, res: Response) => {
  try {
    const { table, columns, limit = 1000 } = req.body;
    
    if (!table || !columns || !Array.isArray(columns)) {
      return res.status(400).json({ 
        error: 'Table name and columns array are required' 
      });
    }
    
    const result = await ragAnything.processDataSource({
      type: 'database',
      config: { table, columns, limit }
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error processing database:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process API endpoint
router.post('/process/api', async (req: Request, res: Response) => {
  try {
    const { url, method = 'GET', headers = {}, body = null } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'API URL is required' });
    }
    
    const result = await ragAnything.processDataSource({
      type: 'api',
      url,
      config: { method, headers, body }
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error processing API:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get processing status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await ragAnything.getStatus();
    res.json(status);
  } catch (error: any) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await ragAnything.getStatistics();
    res.json(stats);
  } catch (error: any) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get supported formats
router.get('/formats', (req: Request, res: Response) => {
  const formats = ragAnything.getSupportedFormats();
  res.json({
    formats,
    details: {
      excel: { extensions: ['.xlsx', '.xls'], maxSize: '50MB' },
      pdf: { extensions: ['.pdf'], maxSize: '50MB' },
      csv: { extensions: ['.csv'], maxSize: '50MB' },
      web: { description: 'Any public URL' },
      database: { description: 'PostgreSQL tables' },
      api: { description: 'REST API endpoints' }
    }
  });
});

export default router;