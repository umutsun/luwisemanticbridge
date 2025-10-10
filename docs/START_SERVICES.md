# Starting Alice Semantic Bridge Services

## Quick Start

### Option 1: Using Scripts (Recommended)

1. **Start Backend Services**:
   ```bash
   # Windows (PowerShell)
   .\start-backend.ps1

   # Or Windows (Batch)
   .\start-backend.bat
   ```

2. **Start Frontend** (in another terminal):
   ```bash
   cd frontend
   npm run dev
   ```

3. **Access the Application**:
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:8083

### Option 2: Manual Start

1. **Start LightRAG Service**:
   ```bash
   python backend/lightrag_service.py --port 8083
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Service Status Check

- **Dashboard**: Shows real-time status of all services
- **Settings Page**: Configure all aspects of the system
- **Services Tab**: Start/stop individual services

## Troubleshooting

### Dashboard Shows "Veri yüklenemedi" (Data could not be loaded)

This means the backend services are not running. Follow these steps:

1. Check if Python is installed:
   ```bash
   python --version
   ```

2. Start the backend services using one of the scripts above

3. Verify services are running:
   ```bash
   # Check LightRAG
   curl http://localhost:8083/health

   # Check port usage
   netstat -an | grep :8083
   ```

4. Check logs for errors:
   - `logs/lightrag.log` - LightRAG service logs
   - `logs/lightrag_error.log` - LightRAG error logs

### Port Already in Use

If you get "Port already in use" error:

1. Find the process using the port:
   ```bash
   netstat -ano | findstr :8083
   ```

2. Kill the process:
   ```bash
   taskkill /PID <process_id> /F
   ```

### Python Module Not Found

Install required dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

The settings are stored in:
- `config/asb-config.json` - Main configuration file
- Settings can be configured through the web interface at http://localhost:3001/dashboard/settings

## Default Ports

- Frontend: 3001
- LightRAG API: 8083
- Embedder Service: 8086 (optional)
- Streamlit: 8085 (optional)
- n8n: 5678 (optional)