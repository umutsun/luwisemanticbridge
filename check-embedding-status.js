const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8083,
  path: '/api/v2/embeddings/tables-fixed',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      const ozelgeler = response.tables.find(t => t.name === 'ozelgeler');
      if (ozelgeler) {
        console.log('ozelgeler status:');
        console.log('  Total records:', ozelgeler.totalRecords);
        console.log('  Embedded records:', ozelgeler.embeddedRecords);
        console.log('  Progress:', ozelgeler.progress + '%');
        console.log('  Status:', ozelgeler.status);
      }
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});

req.end();