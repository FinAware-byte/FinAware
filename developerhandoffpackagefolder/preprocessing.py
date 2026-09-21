import re, numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from config import ALIASES,NUMERIC,CATEGORICAL

def norm(s): return re.sub(r'[^a-z0-9]+','_',str(s).lower()).strip('_')
def clean(df):
    x=df.copy(); x.columns=[norm(c) for c in x.columns]
    ren={}
    for canon, aliases in ALIASES.items():
        if canon not in x:
            for a in aliases:
                if norm(a) in x: ren[norm(a)]=canon; break
    x=x.rename(columns=ren)
    for c in NUMERIC:
        if c in x:
            x[c]=pd.to_numeric(x[c].astype(str).str.replace(r'[$R,% ,]','',regex=True),errors='coerce')
    for c in ['monthly_income_zar','monthly_expenses_zar','savings_zar','loan_amount_zar','loan_term_months','monthly_emi_zar']:
        if c in x: x.loc[x[c]<0,c]=np.nan
    if 'interest_rate' in x: x.loc[(x.interest_rate<0)|(x.interest_rate>100),'interest_rate']=np.nan
    if 'credit_score' in x: x.loc[(x.credit_score<300)|(x.credit_score>850),'credit_score']=np.nan
    return x.drop_duplicates().reset_index(drop=True)

def engineer(df):
    x=df.copy(); income=x.monthly_income_zar.replace(0,np.nan)
    x['expense_to_income_ratio']=x.monthly_expenses_zar/income
    x['savings_to_income_ratio']=x.savings_zar/income
    x['debt_zar']=x.get('loan_amount_zar',pd.Series(0,index=x.index)).fillna(0)
    x['emi_to_income_ratio']=x.get('monthly_emi_zar',pd.Series(0,index=x.index)).fillna(0)/income
    if 'debt_to_income_ratio' not in x: x['debt_to_income_ratio']=x.debt_zar/income
    x['disposable_income_zar']=x.monthly_income_zar-x.monthly_expenses_zar
    x['financial_buffer_months']=x.savings_zar/x.monthly_expenses_zar.replace(0,np.nan)
    x['loan_burden_zar']=x.get('monthly_emi_zar',pd.Series(0,index=x.index)).fillna(0)
    return x.replace([np.inf,-np.inf],np.nan)

def component_dti(v): return 50 if pd.isna(v) else float(np.clip((max(0,float(v)*100)-20)/40*100,0,100))
def component_exp(v): return 50 if pd.isna(v) else float(np.clip((max(0,float(v)*100)-50)/50*100,0,100))
def component_save(v): return 50 if pd.isna(v) else float(np.clip((20-float(v)*100)/20*100,0,100))
def component_credit(v): return 50 if pd.isna(v) else float(np.clip((750-float(v))/450*100,0,100))

def target(df):
    x=df.copy(); d=x.debt_to_income_ratio.apply(component_dti); e=x.expense_to_income_ratio.apply(component_exp); s=x.savings_to_income_ratio.apply(component_save); c=x.credit_score.apply(component_credit) if 'credit_score' in x else pd.Series(50.,index=x.index)
    x['risk_score']=(.35*d+.25*s+.20*e+.20*c).clip(0,100)
    x['risk_tier']=pd.cut(x.risk_score,[-np.inf,33.333333,66.666666,np.inf],labels=['Low','Medium','High'],right=False).astype(str)
    summary=x.risk_tier.value_counts().rename_axis('risk_tier').reset_index(name='records'); summary['percentage']=(summary.records/len(x)*100).round(2)
    return x,summary

def features(df):
    excluded={'risk_score','risk_tier','record_date','date','id','customer_id','user_id'}
    base=[c for c in df.columns if c not in excluded and (c in NUMERIC or c in CATEGORICAL)]
    extra=['expense_to_income_ratio','savings_to_income_ratio','debt_zar','emi_to_income_ratio','disposable_income_zar','financial_buffer_months','loan_burden_zar']
    return list(dict.fromkeys(base+[c for c in extra if c in df]))

def preprocessor(X):
    nums=[c for c in X if pd.api.types.is_numeric_dtype(X[c])]; cats=[c for c in X if c not in nums]
    npipe=Pipeline([('imputer',SimpleImputer(strategy='median')),('scaler',StandardScaler())])
    cpipe=Pipeline([('imputer',SimpleImputer(strategy='most_frequent')),('onehot',OneHotEncoder(handle_unknown='ignore',sparse_output=False))])
    return ColumnTransformer([('num',npipe,nums),('cat',cpipe,cats)],remainder='drop')
