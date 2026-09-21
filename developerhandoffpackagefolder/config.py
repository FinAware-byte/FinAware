from pathlib import Path
BASE_DIR=Path(__file__).resolve().parent
ARTIFACT_DIR=BASE_DIR/'artifacts'
ALIASES={
'age':['age'],'gender':['gender','sex'],'education_level':['education_level','education'],'employment_status':['employment_status','employment'],'job_title':['job_title','occupation'],
'monthly_income_zar':['monthly_income_zar','monthly_income','income'],'monthly_expenses_zar':['monthly_expenses_zar','monthly_expenses','expenses'],'savings_zar':['savings_zar','savings'],
'loan_status':['loan_status','has_loan','loan'],'loan_type':['loan_type'],'loan_amount_zar':['loan_amount_zar','loan_amount'],'loan_term_months':['loan_term_months','loan_term'],
'monthly_emi_zar':['monthly_emi_zar','monthly_emi','emi'],'interest_rate':['interest_rate','interest_rate_percent'],'debt_to_income_ratio':['debt_to_income_ratio','debt_to_income','dti'],
'credit_score':['credit_score'],'savings_to_income_ratio':['savings_to_income_ratio','savings_to_income','savings_ratio'],'region':['region','province'],'record_date':['record_date','date']}
NUMERIC=['age','monthly_income_zar','monthly_expenses_zar','savings_zar','loan_amount_zar','loan_term_months','monthly_emi_zar','interest_rate','debt_to_income_ratio','credit_score','savings_to_income_ratio']
CATEGORICAL=['gender','education_level','employment_status','job_title','loan_status','loan_type','region']
