const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 5000;
const DEP_API_BASE_URL = 'http://deployment:3000'; // External API running on port 3000
const COM_API_BASE_URL = 'http://compiler:8000'; // External API running on port 3000

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }

  next();
});

// Middleware
app.use(cors()); // Allow cross-origin requests (optional)
app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public')));

// **Relay GET request to fetch data**
app.get('/api/query', async (req, res) => {
  try {
    console.log('Fetching data from external API...');
    const response = await axios.get(`${DEP_API_BASE_URL}/query`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching data:', error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch data' });
  }
});

// **Relay POST request to execute task**
app.post('/api/executeTask', async (req, res) => {
  try {
    console.log('Executing task via external API...');
    const response = await axios.post(`${DEP_API_BASE_URL}/executeTask`, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error executing task:', error.message);
    res.status(error.response?.status || 500).json({ error: 'Failed to execute task' });
  }
});

// **New Endpoint: Relay POST request to deploy BPMN diagram**
app.post('/api/deploy', async (req, res) => {
  try {
    console.log('Deploying BPMN diagram...');
    const response = await axios.post(`${DEP_API_BASE_URL}/deploy`, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error deploying BPMN diagram:', error.message);
    res.status(error.response?.status || 500).json({ error: `Failed to deploy diagram: ${error.message}` });
  }
});

// **New Endpoint: Proxy /api/compile to /compile**
app.post('/api/compile', async (req, res) => {
  try {
    console.log('Compiling BPMN diagram...');

    const response = await axios.post(`${COM_API_BASE_URL}/compile`, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error during compilation:', error.message);
    res.status(error.response?.status || 500).json({ error: `Compilation failed: ${error.message}` });
  }
});

// Catch-all route to serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
