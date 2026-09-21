import argparse,json,joblib,numpy as np,pandas as pd
from sklearn.ensemble import RandomForestClassifier,GradientBoostingClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split,StratifiedKFold,cross_val_score
from sklearn.metrics import accuracy_score,precision_score,recall_score,f1_score,classification_report,confusion_matrix,roc_auc_score
from config import ARTIFACT_DIR
from preprocessing import clean,engineer,target,features,preprocessor

def safe(v):
    if isinstance(v,dict): return {str(k):safe(x) for k,x in v.items()}
    if isinstance(v,list): return [safe(x) for x in v]
    if isinstance(v,np.ndarray): return v.tolist()
    if isinstance(v,np.integer): return int(v)
    if isinstance(v,np.floating): return float(v)
    return v

def models(): return {
'random_forest':RandomForestClassifier(n_estimators=400,min_samples_leaf=2,class_weight='balanced',random_state=42,n_jobs=-1),
'gradient_boosting':GradientBoostingClassifier(n_estimators=250,learning_rate=.05,max_depth=3,random_state=42),
'knn':KNeighborsClassifier(n_neighbors=15,weights='distance'),
'svm':SVC(kernel='rbf',C=2.0,gamma='scale',probability=True,class_weight='balanced',random_state=42)}

def evaluate(m,X,y):
    p=m.predict(X); prob=m.predict_proba(X); labels=list(m.classes_)
    r={'accuracy':accuracy_score(y,p),'precision_macro':precision_score(y,p,average='macro',zero_division=0),'recall_macro':recall_score(y,p,average='macro',zero_division=0),'f1_macro':f1_score(y,p,average='macro',zero_division=0),'classification_report':classification_report(y,p,labels=labels,output_dict=True,zero_division=0),'confusion_matrix':confusion_matrix(y,p,labels=labels).tolist()}
    try:r['roc_auc_ovr_macro']=roc_auc_score(y,prob,labels=labels,multi_class='ovr',average='macro')
    except ValueError:r['roc_auc_ovr_macro']=None
    return safe(r)

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--data',required=True); ap.add_argument('--test-size',type=float,default=.2); a=ap.parse_args(); ARTIFACT_DIR.mkdir(exist_ok=True)
    raw=pd.read_csv(a.data); x=engineer(clean(raw)); x,summary=target(x); cols=features(x); X=x[cols]; y=x.risk_tier
    Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=a.test_size,random_state=42,stratify=y)
    results={}; trained={}
    for name,est in models().items():
        pipe=Pipeline([('preprocessor',preprocessor(Xtr)),('model',est)]); pipe.fit(Xtr,ytr); m=evaluate(pipe,Xte,yte); cv=cross_val_score(pipe,Xtr,ytr,cv=StratifiedKFold(5,shuffle=True,random_state=42),scoring='f1_macro'); m['cv_f1_macro_mean']=float(cv.mean()); m['cv_f1_macro_std']=float(cv.std()); results[name]=m; trained[name]=pipe; print(name,m['accuracy'],m['f1_macro'])
    primary=max(results,key=lambda n:(results[n]['f1_macro'],results[n]['accuracy']))
    bundle={'model':trained[primary],'all_models':trained,'primary_model_name':primary,'feature_columns':cols,'risk_labels':['Low','Medium','High']}
    joblib.dump(bundle,ARTIFACT_DIR/'finaware_model.joblib')
    (ARTIFACT_DIR/'model_metrics.json').write_text(json.dumps(results,indent=2)); (ARTIFACT_DIR/'feature_schema.json').write_text(json.dumps({'features':cols},indent=2)); (ARTIFACT_DIR/'risk_target_summary.json').write_text(json.dumps(safe(summary.to_dict('records')),indent=2)); (ARTIFACT_DIR/'evaluation_report.json').write_text(json.dumps({'records_before_cleaning':len(raw),'records_after_cleaning':len(x),'primary_model':primary,'models':results},indent=2)); x.to_csv(ARTIFACT_DIR/'training_dataset_with_risk_tier.csv',index=False)
    print('Primary model:',primary)
