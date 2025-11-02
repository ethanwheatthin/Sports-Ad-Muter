// Debug script to test Ollama API connectivity

async function testOllamaConnection() {
  const ollamaUrl = 'http://localhost:11434';
  
  console.log('🔍 Testing Ollama API Connection...');
  console.log('URL:', ollamaUrl);
  
  try {
    // Test 1: Basic connectivity
    console.log('\n1️⃣ Testing basic connectivity to', `${ollamaUrl}/api/tags`);
    const tagsResponse = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      mode: 'cors'
    });
    
    console.log('   Status:', tagsResponse.status, tagsResponse.statusText);
    
    if (!tagsResponse.ok) {
      const errorText = await tagsResponse.text();
      console.error('   ❌ Error:', errorText);
      console.error('   Response headers:', {
        'content-type': tagsResponse.headers.get('content-type'),
        'access-control-allow-origin': tagsResponse.headers.get('access-control-allow-origin')
      });
    } else {
      const data = await tagsResponse.json();
      console.log('   ✅ Success! Available models:', data.models?.map(m => m.name));
    }
    
    // Test 2: Test generate endpoint
    console.log('\n2️⃣ Testing generate endpoint...');
    const generateResponse = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3-vl:2b',
        prompt: 'Say hello',
        stream: false
      })
    });
    
    console.log('   Status:', generateResponse.status, generateResponse.statusText);
    console.log('   Response headers:', {
      'content-type': generateResponse.headers.get('content-type'),
      'access-control-allow-origin': generateResponse.headers.get('access-control-allow-origin')
    });
    
    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('   ❌ Error:', errorText);
    } else {
      const data = await generateResponse.json();
      console.log('   ✅ Success!');
      console.log('   Response preview:', data.response?.substring(0, 100));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error type:', error.constructor.name);
    console.error('Full error:', error);
  }
}

// Run the test
testOllamaConnection();
