import dotenv from 'dotenv';
dotenv.config();

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const REPO_URL = 'https://github.com/SayemR0018/canopy.git';

interface RenderService {
  service: {
    id: string;
    name: string;
    repo?: string;
    serviceDetails?: {
      url?: string;
      plan?: string;
      region?: string;
    };
  };
}

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, delayMs = 1500): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err: any) {
      if (i === retries - 1) throw err;
      console.warn(`  ⚠️ Request to ${url} failed (${err.message}). Retrying (${i + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts.`);
}

async function deploy() {
  console.log('======================================================');
  console.log('🚀 Milestone 7: Render REST API Automated Deployment');
  console.log('======================================================\n');

  if (!RENDER_API_KEY) {
    console.warn('⚠️  RENDER_API_KEY environment variable is not set.');
    console.warn('Per task instruction: Recording 3-click manual deployment steps in DEPLOY.md.');
    return;
  }

  const headers = {
    Authorization: `Bearer ${RENDER_API_KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Fetch owners
    console.log('[1/4] Fetching Render account owner details...');
    const ownersRes = await fetchWithRetry('https://api.render.com/v1/owners', { headers });

    if (!ownersRes.ok) {
      const err = await ownersRes.text();
      throw new Error(`Render API owners query returned ${ownersRes.status}: ${err}`);
    }

    const owners = await ownersRes.json();
    const ownerId = owners[0]?.owner?.id;
    const ownerName = owners[0]?.owner?.name || owners[0]?.owner?.email || 'Unknown';
    if (!ownerId) {
      throw new Error('No Render owner found for this API key.');
    }
    console.log(`  ✅ Owner authenticated: ${ownerName} (${ownerId})\n`);

    // 2. Query services
    console.log('[2/4] Querying existing Render Web Services...');
    const servicesRes = await fetchWithRetry('https://api.render.com/v1/services?limit=50', { headers });
    if (!servicesRes.ok) {
      const err = await servicesRes.text();
      throw new Error(`Render API services query returned ${servicesRes.status}: ${err}`);
    }

    const services: RenderService[] = await servicesRes.json();
    const canopyServices = services.filter((s) =>
      s.service?.name?.toLowerCase().includes('canopy') ||
      s.service?.repo?.toLowerCase().includes('canopy')
    );

    const desiredEnvVars = [
      { key: 'PORT', value: '10000' },
      { key: 'HOST', value: '0.0.0.0' },
      { key: 'NODE_ENV', value: 'production' },
      { key: 'NODE_OPTIONS', value: '--experimental-sqlite' },
      { key: 'DATA_DIR', value: '/app/data' },
      { key: 'PUBLIC_READONLY', value: 'true' },
      { key: 'RATE_LIMIT_PER_MIN', value: '60' },
      { key: 'DAILY_TOKEN_CAP', value: '200000' },
      {
        key: 'CANOPY_LLM_BASE_URL',
        value: process.env.CANOPY_LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
      },
      {
        key: 'CANOPY_LLM_MODEL',
        value: process.env.CANOPY_LLM_MODEL || 'models/gemma-4-26b-a4b-it',
      },
      {
        key: 'CANOPY_LLM_API_KEY',
        value: process.env.CANOPY_LLM_API_KEY || '',
      },
      {
        key: 'SENTRY_DSN',
        value: process.env.SENTRY_DSN || '',
      },
    ];

    let targetServices = canopyServices;

    if (targetServices.length === 0) {
      console.log('  No existing Canopy service found. Creating new Web Service "canopy-lazy-git"...');
      const createRes = await fetch('https://api.render.com/v1/services', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'web_service',
          name: 'canopy-lazy-git',
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
            envVars: desiredEnvVars,
          },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error(`Failed to create Render service: ${err}`);
      }

      const created = await createRes.json();
      targetServices = [created];
      console.log(`  ✅ Created new service: ${created.service?.name} (${created.service?.id})`);
    } else {
      console.log(`  Found ${targetServices.length} matching Canopy service(s):`);
      for (const s of targetServices) {
        console.log(`  - [${s.service?.name}] id: ${s.service?.id} -> ${s.service?.serviceDetails?.url}`);
      }
    }

    // 3. Configure/Update environment variables via Render REST API
    console.log('\n[3/4] Configuring & updating service environment variables via REST API...');
    for (const s of targetServices) {
      const serviceId = s.service.id;
      console.log(`  Updating env vars for ${s.service.name} (${serviceId})...`);

      const putRes = await fetchWithRetry(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(desiredEnvVars),
      });

      if (!putRes.ok) {
        const err = await putRes.text();
        console.warn(`  ⚠️ Failed to update env vars for ${s.service.name}: ${err}`);
      } else {
        const updated = await putRes.json();
        const updatedKeys = Array.isArray(updated) ? updated.map((u: any) => u.envVar?.key) : [];
        console.log(`  ✅ Updated ${updatedKeys.length} environment variables on ${s.service.name}`);
        console.log(`     Configured keys: ${updatedKeys.join(', ')}`);
        console.log(`     SENTRY_DSN configured: ${!!process.env.SENTRY_DSN}`);
        console.log(`     CANOPY_LLM_API_KEY configured: ${!!process.env.CANOPY_LLM_API_KEY}`);
      }
    }

    // 4. Verify deployment status and live service health
    console.log('\n[4/4] Verifying Render deployment status & health...');
    for (const s of targetServices) {
      const serviceId = s.service.id;
      const deploysRes = await fetchWithRetry(`https://api.render.com/v1/services/${serviceId}/deploys?limit=1`, {
        headers,
      });

      let latestDeploy: any = null;
      if (deploysRes.ok) {
        const deploys = await deploysRes.json();
        latestDeploy = deploys[0]?.deploy;
      }

      const url = s.service.serviceDetails?.url;
      console.log(`  Service: ${s.service.name}`);
      console.log(`  URL:     ${url}`);
      console.log(`  Deploy:  ${latestDeploy?.id || 'unknown'} (Status: ${latestDeploy?.status || 'unknown'})`);
      if (latestDeploy?.commit) {
        console.log(`  Commit:  ${latestDeploy.commit.id?.slice(0, 8)} - ${latestDeploy.commit.message}`);
      }

      if (url) {
        try {
          const healthRes = await fetchWithRetry(`${url}/healthz`);
          if (healthRes.ok) {
            const health = await healthRes.json();
            console.log(`  Health:  ✅ HTTP 200 OK (uptime: ${health.uptime}s, cache: ${health.cacheEntries})`);
          } else {
            console.log(`  Health:  ⚠️ HTTP ${healthRes.status} (${healthRes.statusText})`);
          }
        } catch (hErr: any) {
          console.log(`  Health:  ⚠️ Connection failed: ${hErr.message}`);
        }
      }
      console.log('');
    }

    console.log('======================================================');
    console.log('🎉 Milestone 7 Render REST API Orchestration Complete');
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('❌ Render deployment orchestration error:', err.message);
    process.exit(1);
  }
}

deploy();
