export async function getFinancialRiskPrediction(financialData: Record<string, unknown>) {
  const url = process.env.ML_SERVICE_URL ?? 'http://finaware-ml:8001';
  const response = await fetch(`${url}/predict`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(financialData)
  });
  if (!response.ok) throw new Error(`ML service failed: ${response.status} ${await response.text()}`);
  return await response.json();
}

// Express route pattern:
// router.post('/financial/risk', async (req,res)=>{
//   try { res.json(await getFinancialRiskPrediction(req.body)); }
//   catch(error) { res.status(500).json({message:'Unable to calculate financial risk'}); }
// });
