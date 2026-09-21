import joblib,pandas as pd
from preprocessing import clean,engineer
from explainability import explain_prediction
from recommendations import generate_recommendations
class FinAwarePredictor:
    def __init__(self,path): self.bundle=joblib.load(path); self.model=self.bundle['model']; self.cols=self.bundle['feature_columns']
    def predict(self,payload):
        x=engineer(clean(pd.DataFrame([payload]))); X=x[self.cols]; pred=self.model.predict(X)[0]; probs=self.model.predict_proba(X)[0]; classes=list(self.model.classes_)
        return {'risk_tier':str(pred),'confidence':float(max(probs)),'probabilities':{str(k):float(v) for k,v in zip(classes,probs)},'financial_indicators':{c:_val(x,c) for c in ['debt_to_income_ratio','expense_to_income_ratio','savings_to_income_ratio','disposable_income_zar','financial_buffer_months','emi_to_income_ratio']},'explainability':explain_prediction(self.bundle,x),'recommendations':generate_recommendations(x.iloc[0].to_dict(),str(pred))}
def _val(df,c):
    v=df.iloc[0].get(c); return None if pd.isna(v) else float(v)
