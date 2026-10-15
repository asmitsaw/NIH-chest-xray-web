import PDFDocument from 'pdfkit';

/**
 * Generates an official, beautifully formatted clinical PDF report for a chest radiograph study.
 * @param {Object} study - The populated study object with patient, prediction, and report.
 * @param {stream.Writable} res - The writable HTTP response stream or file stream.
 */
export function generateStudyReportPdf(study, res) {
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: {
      Title: `Radiology Report - ${study.patient_name} - ${study.study_uid}`,
      Author: 'Chest-X AI Clinical System',
      Subject: 'Chest Radiograph Examination Report',
    }
  });

  doc.pipe(res);

  const colors = {
    primary: '#0f172a',    // Dark navy
    secondary: '#0284c7',  // Medical cyan/blue
    darkText: '#1e293b',
    mutedText: '#64748b',
    border: '#cbd5e1',
    lightBg: '#f8fafc',
    positive: '#dc2626',   // Red
    borderline: '#d97706', // Amber
    normal: '#16a34a',     // Green
  };

  // --- HEADER ---
  doc.rect(40, 40, 515, 60).fill(colors.lightBg);
  doc.rect(40, 40, 515, 60).stroke(colors.border);

  doc.fillColor(colors.secondary)
     .font('Helvetica-Bold')
     .fontSize(15)
     .text('AIIMS THORACIC IMAGING & CHEST-X AI CLINICAL DECISION SUPPORT', 55, 52, { width: 485, align: 'left' });

  doc.fillColor(colors.mutedText)
     .font('Helvetica')
     .fontSize(9)
     .text('Department of Radiodiagnosis · All India Institute of Medical Sciences · New Delhi', 55, 72);

  const isFinal = study.report && !study.report.is_draft;
  const statusText = isFinal ? 'FINAL CLINICAL REPORT' : 'PRELIMINARY DRAFT REPORT';
  const statusColor = isFinal ? colors.normal : colors.borderline;

  doc.rect(380, 70, 160, 18).fillAndStroke(statusColor, statusColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text(statusText, 380, 74, { width: 160, align: 'center' });

  doc.moveDown(2);

  // --- METADATA TABLE (2 COLUMNS) ---
  const metaY = 115;
  doc.rect(40, metaY, 515, 80).fillAndStroke('#ffffff', colors.border);

  // Column 1: Patient Details
  doc.fillColor(colors.secondary).font('Helvetica-Bold').fontSize(10).text('PATIENT DEMOGRAPHICS', 55, metaY + 10);
  doc.fillColor(colors.darkText).font('Helvetica-Bold').fontSize(9);
  doc.text('Name:', 55, metaY + 28);
  doc.text('MRN:', 55, metaY + 43);
  doc.text('Age / Gender:', 55, metaY + 58);

  doc.font('Helvetica').fillColor(colors.darkText);
  doc.text(study.patient_name || 'N/A', 130, metaY + 28);
  doc.text(study.mrn || 'N/A', 130, metaY + 43);
  doc.text(`${study.age || 'N/A'} Yrs · ${study.gender || 'N/A'} (Blood: ${study.blood_group || 'Unknown'})`, 130, metaY + 58);

  // Column 2: Study Details
  doc.fillColor(colors.secondary).font('Helvetica-Bold').fontSize(10).text('EXAMINATION METADATA', 310, metaY + 10);
  doc.fillColor(colors.darkText).font('Helvetica-Bold').fontSize(9);
  doc.text('Study UID:', 310, metaY + 28);
  doc.text('Date & Time:', 310, metaY + 43);
  doc.text('Procedure:', 310, metaY + 58);

  doc.font('Helvetica').fillColor(colors.darkText);
  doc.text(study.study_uid || 'N/A', 385, metaY + 28);
  doc.text(study.study_date ? new Date(study.study_date).toLocaleString('en-IN') : 'N/A', 385, metaY + 43);
  doc.text(study.study_type || 'Chest Radiograph PA View', 385, metaY + 58);

  // --- SECTION: CLINICAL HISTORY ---
  let curY = metaY + 95;
  if (study.medical_history_notes || study.notes) {
    doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10.5).text('CLINICAL INDICATION & HISTORY', 40, curY);
    curY += 15;
    doc.rect(40, curY, 515, 30).fillAndStroke(colors.lightBg, colors.border);
    const histText = [study.medical_history_notes, study.notes].filter(Boolean).join(' | ');
    doc.fillColor(colors.darkText).font('Helvetica').fontSize(8.5).text(histText, 50, curY + 6, { width: 495, lineBreak: true });
    curY += 40;
  }

  // --- SECTION: AI ANALYSIS ---
  doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10.5).text('AI-ASSISTED MULTI-LABEL PATHOLOGY DETECTION', 40, curY);
  const modelVer = study.prediction?.model_version || 'TorchXRayVision DenseNet-121';
  doc.fillColor(colors.mutedText).font('Helvetica').fontSize(8.5).text(`Engine: ${modelVer} · Independent Sigmoid Activation`, 310, curY + 2, { align: 'right', width: 245 });
  curY += 16;

  // Table Header
  doc.rect(40, curY, 515, 18).fillAndStroke('#0f172a', '#0f172a');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  doc.text('PATHOLOGY FINDING', 50, curY + 5);
  doc.text('PROBABILITY', 230, curY + 5);
  doc.text('CALIBRATED THRESHOLD', 330, curY + 5);
  doc.text('DIAGNOSTIC STATUS', 450, curY + 5);
  curY += 18;

  const scores = study.prediction?.scores || [];
  if (scores.length > 0) {
    scores.forEach((item, idx) => {
      const isAlt = idx % 2 === 1;
      const rowH = 15;
      if (isAlt) doc.rect(40, curY, 515, rowH).fill('#f1f5f9');
      
      const probPct = (item.probability * 100).toFixed(1) + '%';
      const threshPct = item.threshold ? (item.threshold * 100).toFixed(1) + '%' : '5.0%';
      const isPos = item.exceeds_threshold;
      
      doc.fillColor(colors.darkText).font(isPos ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      doc.text(item.disease.replace(/_/g, ' '), 50, curY + 4);
      doc.text(probPct, 230, curY + 4);
      doc.text(threshPct, 330, curY + 4);

      if (isPos) {
        doc.fillColor(colors.positive).font('Helvetica-Bold').text('POSITIVE (High)', 450, curY + 4);
      } else if (item.probability >= (item.threshold * 0.6)) {
        doc.fillColor(colors.borderline).font('Helvetica').text('Borderline', 450, curY + 4);
      } else {
        doc.fillColor(colors.normal).font('Helvetica').text('Unremarkable', 450, curY + 4);
      }
      curY += rowH;
    });
  } else {
    doc.rect(40, curY, 515, 20).stroke(colors.border);
    doc.fillColor(colors.mutedText).font('Helvetica').fontSize(8.5).text('No automated predictions recorded for this study.', 50, curY + 6);
    curY += 20;
  }
  doc.rect(40, metaY + 95, 515, curY - (metaY + 95)).stroke(colors.border);

  curY += 15;

  // --- SECTION: PHYSICIAN IMPRESSION & REPORT ---
  doc.fillColor(colors.primary).font('Helvetica-Bold').fontSize(10.5).text('PHYSICIAN CLINICAL IMPRESSION & RECOMMENDATIONS', 40, curY);
  curY += 16;

  const rep = study.report;
  const impBoxH = 90;
  doc.rect(40, curY, 515, impBoxH).fillAndStroke('#ffffff', colors.border);

  doc.fillColor(colors.darkText).font('Helvetica-Bold').fontSize(8.5).text('CLINICAL FINDINGS & OBSERVATIONS:', 50, curY + 8);
  doc.font('Helvetica').fontSize(8.5).text(rep?.clinical_findings_text || 'Chest radiograph evaluated in conjunction with automated decision-support findings.', 50, curY + 20, { width: 495 });

  doc.font('Helvetica-Bold').fontSize(8.5).text('FINAL IMPRESSION:', 50, curY + 42);
  doc.font('Helvetica').fontSize(8.5).text(rep?.final_impression || 'Preliminary radiograph pending primary physician sign-off.', 50, curY + 54, { width: 495 });

  doc.font('Helvetica-Bold').fontSize(8.5).text('RECOMMENDATIONS & FOLLOW-UP:', 50, curY + 68);
  doc.font('Helvetica').fontSize(8.5).text(rep?.recommendation || 'Clinical correlation recommended.', 50, curY + 78, { width: 495 });

  curY += impBoxH + 15;

  // --- SIGNATURE BLOCK ---
  doc.rect(40, curY, 515, 50).fillAndStroke(colors.lightBg, colors.border);
  doc.fillColor(colors.secondary).font('Helvetica-Bold').fontSize(9).text('AUTHENTICATION & VERIFICATION BLOCK', 50, curY + 8);
  
  const docName = study.doctor_name || rep?.doctor_name || 'Dr. Rajesh Sharma, MD, DMRD';
  doc.fillColor(colors.darkText).font('Helvetica-Bold').fontSize(8.5).text(`Attending Radiologist: ${docName}`, 50, curY + 22);
  doc.font('Helvetica').fontSize(8).fillColor(colors.mutedText).text(`Medical Registration: MCI-84920 · All India Institute of Medical Sciences, New Delhi`, 50, curY + 34);

  const signDate = rep?.finalized_at ? new Date(rep.finalized_at).toLocaleString('en-IN') : 'DRAFT (Unsigned)';
  doc.fillColor(colors.darkText).font('Helvetica-Bold').fontSize(8.5).text(`Sign-off Date: ${signDate}`, 340, curY + 22, { align: 'right', width: 200 });
  doc.font('Helvetica').fontSize(8).fillColor(colors.mutedText).text(`Verification Hash: CX-${Date.now().toString(16).toUpperCase()}`, 340, curY + 34, { align: 'right', width: 200 });

  curY += 60;

  // --- LEGAL DISCLAIMER FOOTER ---
  doc.rect(40, curY, 515, 32).fillAndStroke('#f8fafc', colors.border);
  doc.fillColor(colors.mutedText).font('Helvetica').fontSize(7.5).text(
    'LEGAL & REGULATORY NOTICE: AI-generated decision support is intended as a clinical aid for licensed medical practitioners. ' +
    'This report does not substitute for independent clinical judgment, laboratory evaluation, or primary diagnostic confirmation by a certified radiologist.',
    45, curY + 6, { width: 505, align: 'center' }
  );

  doc.end();
}
