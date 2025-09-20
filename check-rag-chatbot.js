const { Pool } = require('pg');

const ragChatbotPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'rag_chatbot',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

async function checkDatabase() {
  try {
    console.log('🔍 Rag_chatbot veritabanına bağlanılıyor...');
    
    // Tabloları kontrol et
    const tablesResult = await ragChatbotPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE' 
        AND table_name NOT LIKE 'pg_%' 
        AND table_name NOT LIKE 'sql_%'
      ORDER BY table_name
    `);
    
    console.log('📋 Rag_chatbot tabloları:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Önemli tabloların kayıt sayılarını kontrol et
    const importantTables = ['sorucevap', 'makaleler', 'danistaykararlari', 'ozelgeler', 'chat_history'];
    
    for (const tableName of importantTables) {
      try {
        const countResult = await ragChatbotPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`📊 ${tableName}: ${countResult.rows[0].count} kayıt`);
      } catch (err) {
        console.log(`❌ ${tableName} tablosu bulunamadı veya erişilemiyor`);
      }
    }
    
    // Son 20 kaydı kontrol et
    console.log('\n🔍 Son 20 kaydın embedding durumu:');
    
    for (const tableName of importantTables) {
      try {
        const recentResult = await ragChatbotPool.query(`
          SELECT id, 
                 CASE 
                   WHEN embedding IS NULL THEN '❌ EMBEDDING YOK'
                   ELSE '✅ EMBEDDING VAR'
                 END as embedding_status,
                 created_at
          FROM ${tableName}
          ORDER BY id DESC
          LIMIT 20
        `);
        
        if (recentResult.rows.length > 0) {
          console.log(`\n${tableName} tablosu son 20 kayıt:`);
          const noEmbeddingCount = recentResult.rows.filter(row => row.embedding_status === '❌ EMBEDDING YOK').length;
          console.log(`  - Toplam: ${recentResult.rows.length} kayıt`);
          console.log(`  - Embedding yok: ${noEmbeddingCount} kayıt`);
          console.log(`  - Örnek kayıtlar: ${recentResult.rows.slice(0, 3).map(row => `ID:${row.id} ${row.embedding_status}`).join(', ')}`);
        }
      } catch (err) {
        // Tablo yoksa veya embedding sütunu yoksa
        console.log(`ℹ️ ${tableName} tablosunda embedding sütunu yok veya tablo yok`);
      }
    }
    
  } catch (error) {
    console.error('❌ Veritabanı bağlantı hatası:', error);
  } finally {
    await ragChatbotPool.end();
  }
}

checkDatabase();