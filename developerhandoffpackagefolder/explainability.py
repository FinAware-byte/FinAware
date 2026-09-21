import pandas as pd

def explain_prediction(bundle,input_df,max_features=5):
    model=bundle['model']; cols=bundle['feature_columns']; X=input_df[cols].copy(); base=model.predict_proba(X)[0]; classes=list(model.classes_); idx=int(base.argmax()); label=classes[idx]; impacts=[]
    for c in cols:
        z=X.copy(); original=z.iloc[0][c]; neutral=0.0 if pd.api.types.is_numeric_dtype(z[c]) else 'Unknown'; z.loc[z.index[0],c]=neutral
        try: changed=model.predict_proba(z)[0][idx]; impact=float(base[idx]-changed)
        except Exception: continue
        impacts.append({'feature':c,'value':None if pd.isna(original) else original,'probability_change':round(impact,6),'direction':'increases predicted risk' if impact>0 else 'decreases predicted risk' if impact<0 else 'minimal effect'})
    impacts.sort(key=lambda x:abs(x['probability_change']),reverse=True)
    return {'method':'local_feature_perturbation','predicted_class':label,'predicted_probability':float(base[idx]),'top_drivers':impacts[:max_features]}
