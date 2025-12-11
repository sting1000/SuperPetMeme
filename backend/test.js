const axios = require('axios');

async function test() {
    const apiKey = 'sk-JrevfeDICFPffmvZaWftXeeO5IM8ekZwUssynWFEPysHV4G4';
    const url = 'https://aicanapi.com/v1/images/generations';

    const payload = {
        model: 'dall-e-3',
        prompt: 'A cute baby sea otter',
        n: 1,
        size: '1024x1024'
    };

    try {
        console.log('Testing OpenAI-style Image Generation Endpoint with DALL-E 3...');
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });
        console.log('Success:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        if (error.response) {
            console.log('Error Status:', error.response.status);
            console.log('Error Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
}

test();
