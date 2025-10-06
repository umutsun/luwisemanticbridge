export default async function handler(req, res) {
  try {
    // Forward the request to the actual API service
    const response = await fetch('http://api:3000/api/v1/health');
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('API Proxy Error:', error);
    res.status(500).json({ error: 'Failed to connect to API service' });
  }
}