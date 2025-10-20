const fs = require('fs');
const path = require('path');

// Import database configuration directly
const lsembPool = require('../backend/src/config/database.config').lsembPool;

async function setupDatabase() {
    console.log('🔄 Setting up database tables...');

    try {
        // Read and execute SQL script
        const sqlFilePath = path.join(__dirname, 'init-database.sql');
        const sql = fs.readFileSync(sqlFilePath, 'utf8');

        // Split SQL into statements and execute them
        const statements = sql.split(';').filter(stmt => stmt.trim() !== '');

        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await lsembPool.query(statement);
                    console.log('✅ Executed:', statement.substring(0, 50) + '...');
                } catch (error) {
                    if (error.message.includes('already exists')) {
                        console.log('⚠️ Already exists:', statement.substring(0, 50) + '...');
                    } else {
                        console.log('⚠️ Warning:', error.message);
                    }
                }
            }
        }

        console.log('✅ Database setup completed successfully!');

        // Verify tables were created
        const tables = await lsembPool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
        `);

        console.log('\n📊 Tables created:');
        tables.rows.forEach(table => {
            console.log(`   • ${table.table_name}`);
        });

    } catch (error) {
        console.error('❌ Error setting up database:', error.message);
        throw error;
    }
}

setupDatabase()
    .then(() => {
        console.log('\n🎉 Database setup completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Database setup failed:', error.message);
        process.exit(1);
    });