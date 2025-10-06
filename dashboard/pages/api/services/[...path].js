export default async function handler(req, res) {
  const { path } = req.query;

  try {
    // Forward the request to the actual API service
    const response = await fetch(`http://api:3000/api/v2/services/${path.join('/')}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('API Proxy Error:', error);
    res.status(500).json({ error: 'Failed to connect to API service' });
  }
}