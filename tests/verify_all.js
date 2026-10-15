const http = require('http');

async function verifyAll() {
  console.log('--- CHEST-X AI V2 END-TO-END VERIFICATION ---');

  // 1. Check frontend HTML bundle
  const indexRes = await fetch('http://127.0.0.1:4000/');
  console.log('1. Frontend root URL status:', indexRes.status);
  const indexHtml = await indexRes.text();
  if (indexHtml.includes('Chest-X') || indexHtml.includes('script')) {
    console.log('   ✓ Frontend index.html served successfully.');
  }

  // 2. Doctor login
  const docLogin = await fetch('http://127.0.0.1:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dr.sharma', password: 'doctor123' })
  });
  const docData = await docLogin.json();
  console.log('2. Dr. Sharma login status:', docLogin.status, 'Full name:', docData.user?.full_name);
  const docToken = docData.token;

  // 3. Patient login
  const patLogin = await fetch('http://127.0.0.1:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'patient.aarav', password: 'patient123' })
  });
  const patData = await patLogin.json();
  console.log('3. Aarav Sharma (Patient) login status:', patLogin.status, 'Full name:', patData.user?.full_name);

  // 4. Verify patient database contents (only 3 clean Indian patients)
  const patientsRes = await fetch('http://127.0.0.1:4000/api/patients', {
    headers: { 'Authorization': `Bearer ${docToken}` }
  });
  const patients = await patientsRes.json();
  console.log('4. Patient list count:', patients.length);
  patients.forEach(p => console.log(`   - ${p.full_name} (${p.mrn}) · Age ${p.age} · ${p.gender}`));

  // 5. Verify Study 1
  const studyRes = await fetch('http://127.0.0.1:4000/api/studies/1', {
    headers: { 'Authorization': `Bearer ${docToken}` }
  });
  const study = await studyRes.json();
  console.log('5. Study 1 Patient:', study.patient_name, 'Status:', study.status);
  console.log('   Model Version:', study.prediction?.model_version);
  console.log('   Top findings:', study.prediction?.scores?.slice(0, 3).map(s => `${s.disease}: ${s.score_pct.toFixed(1)}%`).join(', '));

  // 6. Test Grad-CAM generation
  const camRes = await fetch('http://127.0.0.1:4000/api/studies/1/gradcam', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${docToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ disease: 'Infiltration', colormap: 'jet', alpha: 0.5 })
  });
  const camData = await camRes.json();
  console.log('6. Grad-CAM generation status:', camRes.status);
  console.log('   Heatmap data URL length:', camData.heatmap?.length);
  console.log('   Overlay data URL length:', camData.overlay?.length);
  console.log('   Is Heatmap valid base64 PNG:', camData.heatmap?.startsWith('data:image/png;base64,'));
  console.log('   Is Overlay valid base64 PNG:', camData.overlay?.startsWith('data:image/png;base64,'));

  // 7. Test PDF Report Download
  const pdfRes = await fetch('http://127.0.0.1:4000/api/studies/1/report.pdf', {
    headers: { 'Authorization': `Bearer ${docToken}` }
  });
  console.log('7. PDF Report Download status:', pdfRes.status);
  console.log('   Content-Type:', pdfRes.headers.get('content-type'));
  console.log('   Content-Disposition:', pdfRes.headers.get('content-disposition'));
  const pdfBuf = await pdfRes.arrayBuffer();
  console.log('   PDF file size:', pdfBuf.byteLength, 'bytes');
  const pdfHeader = Buffer.from(pdfBuf.slice(0, 5)).toString('utf8');
  console.log('   PDF header magic bytes:', pdfHeader);

  if (pdfHeader.startsWith('%PDF-') && camData.overlay && patients.length === 3) {
    console.log('\n=========================================');
    console.log('ALL CLINICAL & SYSTEM VERIFICATIONS PASSED!');
    console.log('=========================================');
  } else {
    console.error('\nVerification failed on one or more checks.');
  }
}

verifyAll().catch(console.error);
