import { NextResponse } from 'next/server';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Call your sync endpoint
    const response = await fetch(`${process.env.VERCEL_URL || 'https://alicesoulai.xyz'}/api/sync-tweets?key=${process.env.CRON_SECRET}`);
    const data = await response.json();
    
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
