import { Pool } from 'pg';

export class MockDataService {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb';
    this.pool = new Pool({ connectionString });
  }

  async addMockDocuments() {
    try {
      console.log(' Adding mock documents to database...');

      // Add mock documents table if not exists
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS mock_documents (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Add mock data
      const mockData = [
        {
          title: 'E-Beyanname Sistemi Nasıl Kullanılır?',
          content: 'E-Beyanname sistemi, vergi mükelleflerinin elektronik ortamda beyanname verme işlemidir. İlk olarak www.gib.gov.tr adresine giriş yapılır. Giriş yapmak için T.C. Kimlik No, Vergi No veya E-Devlet şifresi kullanılır. Sisteme giriş yaptıktan sonra "Beyanname Düzenleme" bölümünden gerekli beyanname türü seçilir. Beyanname doldururken dikkat edilmesi gerekenler: Tüm alanların eksiksiz doldurulması, gelir ve gider kalemlerinin doğru hesaplanması, ek Belgelerin doğru şekilde yüklenmesi. Beyanname onaylandıktan sonra ödeme işlemleri gerçekleştirilir.',
          category: 'vergi'
        },
        {
          title: 'Vergi Beyannamesi Verme Süresi',
          content: 'Gelir vergisi beyannamesi için son tarih her yıl Mart ayının son günüdür. Kurumlar vergisi beyannamesi için ise Nisan ayının son günü son tarihtir. Beyanname vermeyi unutan mükellefler için gecikme cezası uygulanır. Beyanname vermeden önce son gün tarihini mutlaka kontrol etmek gerekir.',
          category: 'vergi'
        },
        {
          title: 'KDV Beyannamesi Nasıl Doldurulur?',
          content: 'KDV beyannamesi, her ayın 23. günü akşamına kadar verilmesi gereken bir beyannamedir. Beyannamede "KDV Tahakkuk Eden" ve "KDV İndirilecek" olmak üzere iki bölüm bulunur. Tahakkuk eden KDV, satışlardan elde edilen KDV tutarını ifade eder. İndirilecek KDV ise alış faturalarından ödenen KDV tutarını gösterir. Beyanname doldurulduktan sonra ödeme işlemi aynı sistem üzerinden gerçekleştirilir.',
          category: 'vergi'
        },
        {
          title: 'Stopaj Vergisi Nedir?',
          content: 'Stopaj vergisi, vergi kesintisi anlamına gelir. Örneğin maaş alan çalışanların gelir vergisi, işveren tarafından ödenir. Bu durumda stopaj yapılmış sayılır. Serbest çalışan avukatlar, doktorlar gibi meslek erbabı da stopaj vergisi ödemekle yükümlüdür. Stopaj oranları gelir türüne göre değişir. Yıllık gelir vergisi beyannamesinde stopaj ödenen tutarlar hesaptan düşülür.',
          category: 'vergi'
        },
        {
          title: 'Elektronik Beyanname Düzenleme Rehberi',
          content: 'Elektronik beyanname sistemi (e-Beyanname), mükemmallerin vergi beyannamelerini internet üzerinden verebilmelerini sağlayan dijital bir sistemdir. Sisteme erişim için www.gib.gov.tr portalından giriş yapılır. Giriş bilgileri E-Devlet, T.C. Kimlik No veya Vergi No ile yapılabilir. Sistemin avantajları: 7/24 erişim, hızlı işlem, otomatik hesaplamalar, anında onay. Dikkat edilmesi gerekenler: Sistem bakım saatleri (genelde 01:00-02:00 arası), internet bağlantısı güvenliği, doğru bilgi girişi.',
          category: 'vergi'
        }
      ];

      // Insert mock data
      for (const doc of mockData) {
        await this.pool.query(
          'INSERT INTO mock_documents (title, content, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [doc.title, doc.content, doc.category]
        );
      }

      console.log(' Mock documents added successfully!');
      return true;
    } catch (error) {
      console.error(' Error adding mock data:', error);
      return false;
    }
  }

  async createEmbeddings() {
    try {
      console.log(' Creating embeddings for mock data...');

      // Create embeddings table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS mock_embeddings (
          id SERIAL PRIMARY KEY,
          content TEXT NOT NULL,
          embedding VECTOR(1536),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Get documents
      const result = await this.pool.query('SELECT id, title, content FROM mock_documents');

      if (result.rows.length === 0) {
        console.log('️ No documents to create embeddings for');
        return false;
      }

      // For demo purposes, we'll just add a simple hash for embedding
      // In real scenario, this would use OpenAI/Claude API
      for (const doc of result.rows) {
        const mockEmbedding = Array(1536).fill(0).map(() => Math.random() * 2 - 1);
        const metadata = {
          title: doc.title,
          content: doc.content,
          table: 'mock_documents'
        };

        await this.pool.query(
          'INSERT INTO mock_embeddings (content, embedding, metadata) VALUES ($1, $2, $3)',
          [doc.content, JSON.stringify(mockEmbedding), metadata]
        );
      }

      console.log(' Mock embeddings created!');
      return true;
    } catch (error) {
      console.error(' Error creating embeddings:', error);
      return false;
    }
  }
}
