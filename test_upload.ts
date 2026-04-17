import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

async function run() {
  const form = new FormData();
  // generate a tiny dummy PDF content
  const pdfContent = Buffer.from(
    "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids [3 0 R]/Count 1>> endobj\n3 0 obj <</Type/Page/Parent 2 0 R/MediaBox [0 0 612 792]/Resources <<>>/Contents 4 0 R>> endobj\n4 0 obj <</Length 21>> stream\nBT /F1 12 Tf (Hello) Tj ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \n0000000213 00000 n \ntrailer <</Size 5/Root 1 0 R>>\nstartxref\n284\n%%EOF"
  );
  
  form.append('file', pdfContent, {
    filename: 'test.pdf',
    contentType: 'application/pdf'
  });

  const res = await fetch('http://localhost:3000/api/parse-file', {
    method: 'POST',
    body: form as any
  });
  
  const text = await res.text();
  console.log(res.status, text);
}
run();
