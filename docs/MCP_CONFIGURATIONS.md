# MCP Konfigürasyonları - Alice Semantic Bridge

## 📁 Konfigürasyon Dosyaları

ASB-CLI MCP Server için aşağıdaki konfigürasyon dosyaları oluşturuldu:

### 1. `.claude/mcp.json`
Claude Desktop ve Claude Code için MCP server konfigürasyonu.

### 2. `.claude/project.json`
Claude için proje metadata ve tool/resource listesi.

### 3. `.codex/mcp-config.json`
Codex IDE için detaylı MCP server konfigürasyonu.

### 4. `.codex/project.json`
Codex için proje ayarları ve entegrasyon bilgileri.

### 5. `.gemini/mcp-config.json`
Gemini için kapsamlı MCP server konfigürasyonu.

### 6. `.gemini/project.json`
Gemini için proje ayarları ve AI entegrasyonu.

## 🚀 MCP Server Özellikleri

### Tools (10 adet)
- `asb_status` - Proje durumu ve istatistikleri
- `asb_search` - pgvector ile semantik arama
- `asb_embed` - OpenAI embedding oluşturma
- `asb_webscrape` - Web scraping ve embedding saklama
- `asb_workflow` - n8n workflow yönetimi
- `asb_database` - pgvector veritabanı işlemleri
- `asb_redis` - Redis cache yönetimi
- `asb_test` - Test çalıştırma
- `asb_build` - Build ve deploy işlemleri
- `asb_config` - Konfigürasyon yönetimi

### Resources (4 adet)
- `asb://status` - Proje durumu JSON
- `asb://config` - Konfigürasyon JSON
- `asb://workflows` - Workflow listesi JSON
- `asb://database/stats` - Veritabanı istatistikleri JSON

## 🔧 Kurulum

### Claude Desktop
1. `%APPDATA%\Claude\claude_desktop_config.json` dosyasını açın
2. `.claude/mcp.json` içeriğini ekleyin
3. Claude Desktop'ı yeniden başlatın

### Claude Code CLI
```bash
claude mcp add asb-cli --command "node C:\mcp-servers\asb-cli\index.js"
```

### Codex IDE
1. IDE ayarlarından MCP bölümünü açın
2. `.codex/mcp-config.json` dosyasını import edin
3. IDE'yi yeniden başlatın

## 📝 Kullanım Örnekleri

### Claude Desktop/Code
```
> asb_status()
> asb_search(query="semantic search", limit=10)
> asb_workflow(action="list")
```

### Claude Code CLI
```bash
> /mcp asb-cli asb_status
> /mcp asb-cli asb_search query="test"
> /mcp asb-cli read asb://status
```

## 🔍 Test

MCP server'ı test etmek için:
```bash
cd C:\mcp-servers\asb-cli
npm test
```

Test sonuçları:
- ✅ 13/13 test başarılı
- 100% başarı oranı

## 📂 Dosya Yapısı

```
alice-semantic-bridge/
├── .claude/
│   ├── mcp.json          # Claude MCP config
│   └── project.json       # Claude project metadata
├── .codex/
│   ├── mcp-config.json   # Codex MCP config
│   └── project.json       # Codex project settings
├── .gemini/
│   ├── mcp-config.json   # Gemini MCP config
│   └── project.json       # Gemini project settings
└── C:\mcp-servers\asb-cli/
    ├── index.js           # MCP server implementation
    ├── test.js            # Test suite
    ├── package.json       # Dependencies
    └── README.md          # Documentation
```

## 🛠️ Ortam Değişkenleri

- `ASB_PROJECT_ROOT` - Proje kök dizini
- `OPENAI_API_KEY` - OpenAI API anahtarı
- `POSTGRES_HOST` - PostgreSQL sunucu
- `POSTGRES_PORT` - PostgreSQL port
- `POSTGRES_DB` - Veritabanı adı
- `POSTGRES_USER` - PostgreSQL kullanıcı
- `POSTGRES_PASSWORD` - PostgreSQL şifre
- `REDIS_HOST` - Redis sunucu
- `REDIS_PORT` - Redis port

## 📚 Dokümantasyon

- [ASB MCP Setup](ASB_MCP_SETUP.md)
- [Claude Code MCP Setup](CLAUDE_CODE_MCP_SETUP.md)
- [ASB CLI Documentation](ASB_CLI_DOCUMENTATION.md)

## 📄 Lisans

MIT

## 👤 Yazar

Alice - Alice Semantic Bridge MCP Integration