#!/usr/bin/env node

import axios from 'axios';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = process.argv[2] || 'codellama:13b';

console.log('Testing Ollama connection...');
console.log('Model:', MODEL);
console.log('URL:', OLLAMA_URL);
console.log('');

async function testOllama() {
  try {
    // Test 1: Check connection
    console.log('Test 1: Checking Ollama server...');
    const tagsResponse = await axios.get(`${OLLAMA_URL}/api/tags`);
    console.log('✓ Server is running');
    console.log('Available models:', tagsResponse.data.models.map(m => m.name).join(', '));
    console.log('');

    // Test 2: Simple chat request (non-streaming)
    console.log('Test 2: Simple non-streaming chat...');
    const simpleRequest = {
      model: MODEL,
      messages: [
        { role: 'user', content: 'Say hello' }
      ],
      stream: false
    };

    console.log('Request:', JSON.stringify(simpleRequest, null, 2));
    
    try {
      const simpleResponse = await axios.post(
        `${OLLAMA_URL}/api/chat`,
        simpleRequest
      );
      console.log('✓ Non-streaming works');
      console.log('Response:', simpleResponse.data.message.content);
      console.log('');
    } catch (error) {
      console.error('✗ Non-streaming failed');
      console.error('Status:', error.response?.status);
      console.error('Error:', error.response?.data || error.message);
      console.log('');
    }

    // Test 3: Streaming chat request
    console.log('Test 3: Streaming chat...');
    const streamRequest = {
      model: MODEL,
      messages: [
        { role: 'user', content: 'Count to 3' }
      ],
      stream: true
    };

    try {
      const streamResponse = await axios.post(
        `${OLLAMA_URL}/api/chat`,
        streamRequest,
        {
          responseType: 'stream'
        }
      );

      let fullResponse = '';
      
      await new Promise((resolve, reject) => {
        streamResponse.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                fullResponse += parsed.message.content;
                process.stdout.write(parsed.message.content);
              }
              if (parsed.done) {
                resolve();
              }
            } catch (e) {
              // Skip invalid lines
            }
          }
        });

        streamResponse.data.on('error', reject);
      });

      console.log('\n✓ Streaming works');
      console.log('Full response:', fullResponse);
      console.log('');
    } catch (error) {
      console.error('✗ Streaming failed');
      console.error('Status:', error.response?.status);
      console.error('Error:', error.response?.data || error.message);
      console.log('');
    }

    // Test 4: Chat with system prompt
    console.log('Test 4: Chat with system prompt...');
    const systemRequest = {
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Always be concise.' },
        { role: 'user', content: 'What is 2+2?' }
      ],
      stream: false
    };

    try {
      const systemResponse = await axios.post(
        `${OLLAMA_URL}/api/chat`,
        systemRequest
      );
      console.log('✓ System prompt works');
      console.log('Response:', systemResponse.data.message.content);
      console.log('');
    } catch (error) {
      console.error('✗ System prompt failed');
      console.error('Status:', error.response?.status);
      console.error('Error:', error.response?.data || error.message);
      console.log('');
    }

    console.log('All tests completed!');
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

testOllama();
