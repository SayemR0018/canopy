import dotenv from 'dotenv';
dotenv.config();

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const REPO_URL = 'https://github.com/SayemR0018/canopy.git';

async function deploy() {
  console.log('🚀 Checking Render deployment status...');

  if (!RENDER_API_KEY) {
    console.log('⚠️  RENDER_API_KEY environment variable is not set.');
    console.log('Per task instruction: Recording 3-click manual deployment steps in DEPLOY.md.');
    return;
  }

  try {
    // 1. Fetch owners
    console.log('Fetching Render owner details...');
    const ownersRes = await fetch('https://api.render.com/v1/owners', {
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!ownersRes.ok) {
      const err = await ownersRes.text();
      console.warn(`Render API returned ${ownersRes.status}: ${err}`);
      return;
    }

    const owners = await ownersRes.json();
    const ownerId = owners[0]?.owner?.id;
    if (!ownerId) {
      console.warn('No Render owner found for this API key.');
      return;
    }
    console.log(`Found Render Owner: ${ownerId}`);

    // 2. Check existing services
    const servicesRes = await fetch('https://api.render.com/v1/services?limit=20', {
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        Accept: 'application/json',
      },
    });

    const services = await servicesRes.json();
    let canopyService = services.find((s: any) => s.service?.name === 'canopy');

    if (!canopyService) {
      console.log('Creating new Render Web Service "canopy"...');
      const createRes = await fetch('https://api.render.com/v1/services', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RENDER_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          type: 'web_service',
          name: 'canopy',
          ownerId,
          repo: REPO_URL,
          branch: 'main',
          rootDir: '',
          autoDeploy: 'yes',
          serviceDetails: {
            env: 'docker',
            plan: 'free',
            region: 'oregon',
            dockerfilePath: './Dockerfile',
            healthCheckPath: '/healthz',
            envVars: [
              { key: 'PORT', value: '10000' },
              { key: 'NODE_ENV', value: 'production' },
              { key: 'PUBLIC_READONLY', value: 'true' },
              { key: 'RATE_LIMIT_PER_MIN', value: '60' },
              { key: 'DAILY_TOKEN_CAP', value: '200000' },
              { key: 'CANOPY_LLM_BASE_URL', value: 'https://generativelanguage.googleapis.com/v1beta/openai' },
              { key: 'CANOPY_LLM_MODEL', value: 'models/gemma-4-26b-a4b-it' },
              { key: 'CANOPY_LLM_API_KEY', value: process.env.CANOPY_LLM_API_KEY || '' },
            ],
          },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        console.warn(`Render API create service refusal: ${err}`);
        return;
      }

      canopyService = await createRes.json();
      console.log('Service created:', canopyService.service?.serviceDetails?.url);
    } else {
      console.log('Existing Canopy service found:', canopyService.service?.serviceDetails?.url);
    }
  } catch (err: any) {
    console.warn('Render deployment check encountered an error:', err.message);
  }
}

deploy();
