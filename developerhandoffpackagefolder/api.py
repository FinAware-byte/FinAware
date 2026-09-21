import os
from typing import Optional
from fastapi import FastAPI,HTTPException
from pydantic import BaseModel,Field
from inference import FinAwarePredictor
app=FastAPI(title='FinAware ML Service',version='1.0.0'); predictor=None; PATH=os.getenv('FINAWARE_MODEL_PATH','artifacts/finaware_model.joblib')
class FinancialInput(BaseModel):
    age:Optional[float]=None; gender:Optional[str]=None; education_level:Optional[str]=None; employment_status:Optional[str]=None; job_title:Optional[str]=None
    monthly_income_zar:float=Field(...,gt=0); monthly_expenses_zar:float=Field(...,ge=0); savings_zar:float=Field(...,ge=0)
    loan_status:Optional[str]=None; loan_type:Optional[str]=None; loan_amount_zar:Optional[float]=Field(0,ge=0); loan_term_months:Optional[float]=Field(None,ge=0); monthly_emi_zar:Optional[float]=Field(0,ge=0); interest_rate:Optional[float]=Field(None,ge=0); debt_to_income_ratio:Optional[float]=Field(None,ge=0); credit_score:Optional[float]=Field(None,ge=300,le=850); savings_to_income_ratio:Optional[float]=Field(None,ge=-1); region:Optional[str]=None
@app.get('/health')
def health():
    global predictor
    try:
        if predictor is None: predictor=FinAwarePredictor(PATH)
        return {'status':'ok','service':'finaware-ml','model':predictor.bundle['primary_model_name']}
    except Exception as e: raise HTTPException(503,str(e))
@app.post('/predict')
def predict(payload:FinancialInput):
    global predictor
    try:
        if predictor is None: predictor=FinAwarePredictor(PATH)
        return predictor.predict(payload.model_dump())
    except Exception as e: raise HTTPException(400,f'Prediction failed: {e}')
