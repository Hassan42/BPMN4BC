const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 5000;
const DEP_API_BASE_URL = 'http://localhost:3000'; // External API running on port 3000
const COM_API_BASE_URL = 'http://localhost:8000'; // External API running on port 8000

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

// **Helper function to handle API requests safely**
async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error from ${url}: ${errorText}`);
      throw new Error(`${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Request to ${url} failed:`, error.message);
    throw error; // Rethrow for the caller to handle
  }
}

// **Relay GET request to fetch data**
app.get('/api/query', async (req, res) => {
  try {
    console.log('Fetching data from external API...');
    const data = await safeFetch(`${DEP_API_BASE_URL}/query`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `${error.message}` });
  }
});

// **Relay POST request to execute task**
app.post('/api/executeTask', async (req, res) => {
  try {
    console.log('Executing task via external API...');
    const data = await safeFetch(`${DEP_API_BASE_URL}/executeTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `${error.message}` });
  }
});

// **Relay POST request to deploy BPMN diagram**
app.post('/api/deploy', async (req, res) => {
  try {
    console.log('Deploying BPMN diagram...');
    const data = await safeFetch(`${DEP_API_BASE_URL}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `${error.message}` });
  }
});

// **Relay POST request to compile BPMN diagram**
app.post('/api/compile', async (req, res) => {
  try {
    console.log('Compiling BPMN diagram...');
    const data = await safeFetch(`${COM_API_BASE_URL}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: `${error.message}` });
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
